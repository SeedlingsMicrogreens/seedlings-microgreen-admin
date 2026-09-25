"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminPage } from "@/components/admin/AdminPage";
import { useAuth } from "@/components/auth/AuthProvider";
import { listCollection } from "@/lib/firestore";
import { listManualFulfilments, packOrderFulfilment } from "@/lib/fulfilmentService";
import { packagingDisplay } from "@/types/packaging";
import type { Packaging } from "@/types/packaging";
import type { SalesProduct } from "@/types/salesProduct";
import type { Fulfilment, FulfilmentPackLine } from "@/types/fulfilment";
import type { Order, OrderItem } from "@/types/order";
import type { SubscriptionDelivery } from "@/types/subscriptionDelivery";

function numberValue(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function dateValue(value: unknown) {
  if (value && typeof value === "object" && "toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toLocaleString();
  }
  if (value instanceof Date) return value.toLocaleString();
  return "—";
}

function requiredGrams(item: OrderItem) {
  return Math.max(0, Math.round(numberValue(item.weightGrams) * numberValue(item.quantity)));
}

function packLabel(size: number) {
  return packagingDisplay(size);
}

function defaultPackaging(remaining: number, options: Packaging[]) {
  const sizes = options.map(x => Math.round(numberValue(x.size))).filter(x => x > 0).sort((a, b) => b - a);
  if (!sizes.length || remaining <= 0) return 0;
  const exact = sizes.find(size => remaining % size === 0);
  if (exact) return exact;
  return sizes.find(size => size <= remaining) ?? sizes[sizes.length - 1];
}

function defaultBoxes(remaining: number, boxGrams: number) {
  if (!remaining || !boxGrams) return 0;
  if (remaining % boxGrams === 0) return remaining / boxGrams;
  return Math.floor(remaining / boxGrams);
}

function componentPreview(salable: SalesProduct | undefined, boxGrams: number) {
  if (!salable || !boxGrams) return [];
  if (salable.type === "single") {
    return salable.components.map(c => ({ name: c.productName, grams: boxGrams }));
  }
  const components = salable.components ?? [];
  const fallbackTotal = components.reduce((sum, c) => sum + Math.max(0, numberValue(c.quantityGrams)), 0);
  const shares = components.map(c => {
    const percentage = numberValue(c.percentage);
    return percentage > 0 ? percentage : (fallbackTotal > 0 ? numberValue(c.quantityGrams) / fallbackTotal * 100 : 0);
  });
  const total = shares.reduce((sum, x) => sum + x, 0);
  const rows = components.map((c, index) => ({ name: c.productName, grams: Math.round(boxGrams * shares[index] / total) }));
  const diff = boxGrams - rows.reduce((sum, row) => sum + row.grams, 0);
  if (rows.length) rows[rows.length - 1].grams += diff;
  return rows;
}

type PackDraft = FulfilmentPackLine & { key: string };

export default function FulfilmentPage() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [salableProducts, setSalableProducts] = useState<SalesProduct[]>([]);
  const [packaging, setPackaging] = useState<Packaging[]>([]);
  const [history, setHistory] = useState<Fulfilment[]>([]);
  const [subscriptionDeliveries, setSubscriptionDeliveries] = useState<SubscriptionDelivery[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [drafts, setDrafts] = useState<PackDraft[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    try {
      const [orderData, salesData, packagingData, fulfilmentData, subscriptionDeliveryData] = await Promise.all([
        listCollection<Order>("orders", "createdAt"),
        listCollection<SalesProduct>("salesProducts"),
        listCollection<Packaging>("packagingMaster", "size"),
        listManualFulfilments(),
        listCollection<SubscriptionDelivery>("subscriptionDeliveries", "deliveryDate"),
      ]);
      setOrders(orderData);
      setSalableProducts(salesData);
      setPackaging(packagingData.filter(x => x.active && Number(x.size) > 0).sort((a, b) => Number(b.size) - Number(a.size)));
      setHistory(fulfilmentData);
      setSubscriptionDeliveries(subscriptionDeliveryData);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load fulfilment data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const salableById = useMemo(() => new Map(salableProducts.map(p => [p.id, p])), [salableProducts]);

  const orderById = useMemo(() => new Map(orders.map(order => [order.id, order])), [orders]);
  const subscriptionDeliveryById = useMemo(
    () => new Map(subscriptionDeliveries.map(delivery => [delivery.id, delivery])),
    [subscriptionDeliveries],
  );

  // Fulfilment records stay in Firestore permanently. Only the active history
  // view is cleared once the linked order/delivery reaches Delivered.
  const activeHistory = useMemo(() => history.filter(record => {
    const delivery = record.subscriptionDeliveryId
      ? subscriptionDeliveryById.get(record.subscriptionDeliveryId)
      : undefined;
    const order = record.orderId ? orderById.get(record.orderId) : undefined;
    const status = delivery?.status || order?.status;
    return status !== "delivered";
  }), [history, orderById, subscriptionDeliveryById]);

  const pendingOrders = useMemo(() => orders
    .filter(order => order.paymentStatus === "paid")
    .filter(order => !["packed", "delivered", "cancelled", "out_for_delivery"].includes(order.status))
    .filter(order => order.packingStatus !== "packed")
    .sort((a, b) => String(a.scheduledDeliveryDate || "").localeCompare(String(b.scheduledDeliveryDate || "")) || String(a.orderNumber || a.id).localeCompare(String(b.orderNumber || b.id))), [orders]);

  const selectedOrder = orders.find(order => order.id === selectedOrderId);

  function openOrder(order: Order) {
    setSelectedOrderId(order.id);
    const next = (order.items ?? []).map((item, index) => {
      const remaining = Math.max(0, requiredGrams(item) - numberValue(item.packedGrams));
      const size = defaultPackaging(remaining, packaging);
      return {
        key: `${order.id}-${index}`,
        orderItemIndex: index,
        boxGrams: size,
        boxesPacked: defaultBoxes(remaining, size),
      };
    });
    setDrafts(next);
    setMessage("");
    setError("");
  }

  function updateDraft(index: number, patch: Partial<PackDraft>) {
    setDrafts(current => current.map((draft, i) => {
      if (i !== index) return draft;
      const next = { ...draft, ...patch };
      if (patch.boxGrams !== undefined && selectedOrder) {
        const item = selectedOrder.items[next.orderItemIndex];
        const remaining = Math.max(0, requiredGrams(item) - numberValue(item.packedGrams));
        next.boxesPacked = defaultBoxes(remaining, next.boxGrams);
      }
      return next;
    }));
  }

  const draftValidation = useMemo(() => {
    if (!selectedOrder) return { errors: [], full: false };
    const errors: string[] = [];
    let full = true;
    for (const draft of drafts) {
      const item = selectedOrder.items[draft.orderItemIndex];
      const salable = salableById.get(item?.salableProductId || item?.productId);
      const required = item ? requiredGrams(item) : 0;
      const packedBefore = item ? numberValue(item.packedGrams) : 0;
      const remaining = Math.max(0, required - packedBefore);
      const packedNow = draft.boxGrams * draft.boxesPacked;
      if (!item || !salable) errors.push(`Order item ${draft.orderItemIndex + 1} could not be resolved.`);
      if (!draft.boxGrams || !packaging.some(p => Number(p.size) === draft.boxGrams)) errors.push(`${salable?.name || "Product"}: select an active Packaging Master size.`);
      if (!Number.isInteger(draft.boxesPacked) || draft.boxesPacked < 1) errors.push(`${salable?.name || "Product"}: boxes must be at least 1.`);
      if (packedNow > remaining) errors.push(`${salable?.name || "Product"}: selected boxes exceed the remaining ${remaining.toLocaleString()} gms.`);
      if (packedNow !== remaining) full = false;
    }
    return { errors, full };
  }, [drafts, packaging, salableById, selectedOrder]);

  async function pack() {
    if (!user || !selectedOrder || draftValidation.errors.length) return;
    setWorking(true);
    setError("");
    setMessage("");
    try {
      const result = await packOrderFulfilment(selectedOrder.id, drafts.map(({ key: _key, ...draft }) => draft), user.uid, user.email ?? undefined);
      setMessage(result.packedCompletely
        ? `${selectedOrder.orderNumber || selectedOrder.id} is fully packed. It has been removed from pending packing.`
        : `${selectedOrder.orderNumber || selectedOrder.id} was partially packed. The remaining requirement stays pending.`);
      setSelectedOrderId("");
      setDrafts([]);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to complete fulfilment packing.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <AdminPage>
      <div className="container-fluid py-3">
        <div className="mb-3">
          <h1 className="h3 seedlings-brand mb-1">Packing & Fulfilment</h1>
          <p className="text-muted mb-0">Pack harvested Microgreens directly against customer orders. No Salable Product packed stock is maintained.</p>
        </div>

        {message && <div className="alert alert-success">{message}</div>}
        {error && <div className="alert alert-danger">{error}</div>}

        <div className="card border-0 shadow-sm mb-4">
          <div className="card-header d-flex justify-content-between align-items-center">
            <div>
              <strong>Pending Packing Requirements</strong>
              <div className="small text-muted">Only paid, not-yet-packed orders are shown. One-time and subscription orders use the same packing workflow.</div>
            </div>
            <span className="badge text-bg-primary">{pendingOrders.length} orders</span>
          </div>
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead><tr><th>Order</th><th>Type</th><th>Customer</th><th>Delivery Date</th><th>Items / Requirement</th><th className="text-end">Action</th></tr></thead>
              <tbody>
                {pendingOrders.map(order => <tr key={order.id}>
                  <td><strong>{order.orderNumber || order.id}</strong><div className="small text-muted">{order.id.slice(0, 8)}</div></td>
                  <td><span className={`badge text-bg-${order.orderType === "subscription" ? "info" : "secondary"}`}>{order.orderType === "subscription" ? "Subscription" : "One-time"}</span></td>
                  <td><strong>{order.customerName || order.customerMobile || order.customerId}</strong><div className="small text-muted">{order.customerMobile || "—"}</div></td>
                  <td>{order.scheduledDeliveryDate || "—"}</td>
                  <td>{(order.items ?? []).map((item, index) => {
                    const required = requiredGrams(item);
                    const packed = numberValue(item.packedGrams);
                    return <div key={`${order.id}-${index}`} className="small mb-1"><strong>{item.productName}</strong> · {required.toLocaleString()} gms · {Math.max(0, required - packed).toLocaleString()} gms pending</div>;
                  })}</td>
                  <td className="text-end"><button className="btn btn-sm btn-success" onClick={() => openOrder(order)}><i className="bi bi-box-seam me-1" />Pack</button></td>
                </tr>)}
                {!pendingOrders.length && !loading && <tr><td colSpan={6} className="text-center text-muted py-5">No pending paid orders require packing.</td></tr>}
                {loading && <tr><td colSpan={6} className="text-center py-5"><span className="spinner-border spinner-border-sm me-2" />Loading...</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        {selectedOrder && <div className="card border-success shadow-sm mb-4">
          <div className="card-header d-flex justify-content-between align-items-center">
            <div><strong>Pack Order {selectedOrder.orderNumber || selectedOrder.id}</strong><div className="small text-muted">{selectedOrder.orderType === "subscription" ? "Subscription order" : "One-time order"} · {selectedOrder.customerName || selectedOrder.customerMobile || selectedOrder.customerId}</div></div>
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => { setSelectedOrderId(""); setDrafts([]); }}>Close</button>
          </div>
          <div className="card-body">
            <div className="alert alert-info small">Select the actual box size from Packaging Master. Boxes are auto-calculated from the remaining requirement, but can be changed. A combo shows the Microgreen grams inside each selected box based on its Product percentages.</div>
            <div className="table-responsive">
              <table className="table align-middle">
                <thead><tr><th>Product</th><th>Requirement</th><th>Box Gms</th><th>Boxes</th><th>Packed</th><th>Microgreens / Box</th></tr></thead>
                <tbody>
                  {drafts.map((draft, index) => {
                    const item = selectedOrder.items[draft.orderItemIndex];
                    const salable = salableById.get(item.salableProductId || item.productId);
                    const required = requiredGrams(item);
                    const before = numberValue(item.packedGrams);
                    const remaining = Math.max(0, required - before);
                    const packedNow = draft.boxGrams * draft.boxesPacked;
                    const preview = componentPreview(salable, draft.boxGrams);
                    return <tr key={draft.key}>
                      <td><strong>{item.productName}</strong><div className="small text-muted">{salable?.type === "multiple" ? "Combo" : "Single"}</div></td>
                      <td>{required.toLocaleString()} gms<div className="small text-muted">{remaining.toLocaleString()} gms remaining</div></td>
                      <td style={{ minWidth: 160 }}><select className="form-select" value={draft.boxGrams || ""} onChange={e => updateDraft(index, { boxGrams: Number(e.target.value) })}><option value="">Select packaging</option>{packaging.map(p => <option key={p.id} value={p.size}>{packLabel(Number(p.size))}</option>)}</select></td>
                      <td style={{ width: 120 }}><input className="form-control" type="number" min="1" step="1" value={draft.boxesPacked || ""} onChange={e => updateDraft(index, { boxesPacked: Number(e.target.value) })}/></td>
                      <td><strong>{packedNow.toLocaleString()} gms</strong>{packedNow !== remaining && <div className="small text-warning">{Math.max(0, remaining - packedNow).toLocaleString()} gms will remain</div>}</td>
                      <td><div className="small">{preview.map((row, i) => <span key={`${row.name}-${i}`} className="badge text-bg-light border me-1 mb-1 fw-normal">{row.name}: {row.grams}g</span>)}</div></td>
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>
            {draftValidation.errors.map((text, index) => <div key={`${text}-${index}`} className="alert alert-danger py-2 small mb-2">{text}</div>)}
            {!draftValidation.errors.length && !draftValidation.full && <div className="alert alert-warning py-2 small">This is a partial packing. The order will remain in Pending Packing until the remaining grams are packed.</div>}
          </div>
          <div className="card-footer d-flex justify-content-end gap-2">
            <button type="button" className="btn btn-secondary" onClick={() => { setSelectedOrderId(""); setDrafts([]); }}>Cancel</button>
            <button type="button" className="btn btn-success" disabled={working || loading || !!draftValidation.errors.length} onClick={() => void pack()}>{working ? "Packing..." : draftValidation.full ? "Complete Packing" : "Pack Selected Quantity"}</button>
          </div>
        </div>}

        <div className="card border-0 shadow-sm">
          <div className="card-header d-flex justify-content-between align-items-center">
            <div><strong>Fulfilment History</strong><div className="small text-muted">Active packing records remain here until the linked Order or Subscription Delivery is delivered. Delivered records remain stored in Firestore but are removed from this view.</div></div>
            <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => setShowHistory(v => !v)}>{showHistory ? "Hide History" : "Show History"}</button>
          </div>
          {showHistory && <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead><tr><th>Date</th><th>Type</th><th>Order</th><th>Subscription Delivery</th><th>Packed</th><th>Batch Allocation</th><th>Status</th></tr></thead>
              <tbody>
                {activeHistory.map(record => <tr key={record.id}>
                  <td>{dateValue(record.packedAt)}</td>
                  <td><span className={`badge text-bg-${record.fulfilmentType === "SUBSCRIPTION" ? "info" : "secondary"}`}>{record.fulfilmentType || "ORDER"}</span></td>
                  <td><strong>{record.orderNumber || record.orderId || "—"}</strong><div className="small text-muted">{record.customerName || ""}</div></td>
                  <td>{record.subscriptionDeliveryId || "—"}</td>
                  <td>{numberValue(record.totalGramsConsumed).toLocaleString()} gms</td>
                  <td><div className="small">{(record.allocations ?? []).map((a, i) => <div key={`${a.growingBatchId}-${a.productId}-${i}`}>{a.growingBatchNumber}: {a.productName} {numberValue(a.quantityGrams).toLocaleString()}g</div>)}</div></td>
                  <td><span className={`badge text-bg-${record.status === "packed" ? "success" : "warning"}`}>{record.status}</span></td>
                </tr>)}
                {!activeHistory.length && <tr><td colSpan={7} className="text-center text-muted py-4">No active fulfilment history.</td></tr>}
              </tbody>
            </table>
          </div>}
        </div>
      </div>
    </AdminPage>
  );
}
