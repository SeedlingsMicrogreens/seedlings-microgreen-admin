"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminPage } from "@/components/admin/AdminPage";
import { useAuth } from "@/components/auth/AuthProvider";
import { listCollection } from "@/lib/firestore";
import { cancelFulfilmentPacking, listFulfilmentOrders, listManualFulfilments, packOrderFulfilment } from "@/lib/fulfilmentService";
import { addNextSubscriptionDeliveryForFulfilment } from "@/lib/subscriptionDeliveryService";
import { isPaidFulfilmentOrder, isPendingFulfilmentOrder, orderPackagingPlan } from "@/lib/fulfilmentEligibility";
import { packagingDisplay } from "@/types/packaging";
import type { Packaging } from "@/types/packaging";
import type { SalesProduct } from "@/types/salesProduct";
import type { Fulfilment, FulfilmentPackLine } from "@/types/fulfilment";
import type { Order, OrderItem } from "@/types/order";
import type { SubscriptionDelivery } from "@/types/subscriptionDelivery";
import type { Subscription } from "@/types/subscription";

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
  // Order `weightGrams` already contains the total grams for this line.
  return Math.max(0, Math.round(numberValue(item.weightGrams)));
}

function packLabel(size: number) {
  return packagingDisplay(size);
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
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [addingSubscriptionId, setAddingSubscriptionId] = useState("");
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
      const [orderData, salesData, packagingData, fulfilmentData, subscriptionDeliveryData, subscriptionData] = await Promise.all([
        listFulfilmentOrders(),
        listCollection<SalesProduct>("salesProducts"),
        listCollection<Packaging>("packagingMaster", "size"),
        listManualFulfilments(),
        listCollection<SubscriptionDelivery>("subscriptionDeliveries", "deliveryDate"),
        listCollection<Subscription>("subscriptions", "createdAt"),
      ]);
      setOrders(orderData);
      setSalableProducts(salesData);
      setPackaging(packagingData.filter(x => x.active && Number(x.size) > 0).sort((a, b) => Number(b.size) - Number(a.size)));
      setHistory(fulfilmentData);
      setSubscriptionDeliveries(subscriptionDeliveryData);
      setSubscriptions(subscriptionData);
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
  const subscriptionById = useMemo(() => new Map(subscriptions.map(subscription => [subscription.id, subscription])), [subscriptions]);

  const activeSubscriptions = useMemo(() => subscriptions
    .filter(subscription => subscription.status === "active")
    .map(subscription => {
      const deliveries = subscriptionDeliveries.filter(delivery => delivery.subscriptionId === subscription.id);
      const completed = Math.max(
        Math.round(numberValue(subscription.completedDeliveries || 0)),
        deliveries.filter(delivery => delivery.status === "delivered").length,
      );
      const total = Math.max(0, Math.round(numberValue(subscription.totalDeliveries || 0)));
      const nextNumber = completed + 1;
      const existingNext = deliveries.find(delivery => delivery.deliveryNumber === nextNumber);
      return { subscription, completed, total, nextNumber, existingNext };
    })
    .filter(row => row.total === 0 || row.completed < row.total),
    [subscriptions, subscriptionDeliveries],
  );

  async function addSubscriptionDelivery(subscription: Subscription) {
    if (!user) return;
    setAddingSubscriptionId(subscription.id);
    setError("");
    setMessage("");
    try {
      const result = await addNextSubscriptionDeliveryForFulfilment(subscription.id, user.uid, user.email ?? undefined);
      setMessage(result.created
        ? `Delivery ${result.deliveryId.split("_").pop()} added for ${subscription.subscriptionNumber}. It is now available below for packing.`
        : `The next delivery for ${subscription.subscriptionNumber} is already available below.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to add subscription delivery.");
    } finally {
      setAddingSubscriptionId("");
    }
  }

  // Fulfilment records stay in Firestore permanently. Only the active history
  // view is cleared once the linked order/delivery reaches Delivered.
  const activeHistory = useMemo(() => history.filter(record => {
    const delivery = record.subscriptionDeliveryId
      ? subscriptionDeliveryById.get(record.subscriptionDeliveryId)
      : undefined;
    const order = record.orderId ? orderById.get(record.orderId) : undefined;
    if (!order || !isPaidFulfilmentOrder(order)) return false;
    if (order.orderType !== "subscription" && !order.sourceSubscriptionId) return true;
    const subscription = order.sourceSubscriptionId ? subscriptionById.get(order.sourceSubscriptionId) : undefined;
    return subscription?.status === "active"
      && subscription.requiresCustomerContact !== true
      && subscription.availabilityDecision !== "contact"
      && Boolean(delivery)
      && delivery?.orderId === order.id
      && delivery.subscriptionId === order.sourceSubscriptionId
      && !["delivered", "failed", "cancelled"].includes(delivery?.status ?? "");
  }), [history, orderById, subscriptionById, subscriptionDeliveryById]);

  const pendingOrders = useMemo(() => orders
    .filter(order => isPendingFulfilmentOrder(order, subscriptionDeliveries, subscriptions))
    .sort((a, b) => String(a.scheduledDeliveryDate || "").localeCompare(String(b.scheduledDeliveryDate || "")) || String(a.orderNumber || a.id).localeCompare(String(b.orderNumber || b.id))), [orders, subscriptionDeliveries, subscriptions]);

  const selectedOrder = orders.find(order => order.id === selectedOrderId);

  function openOrder(order: Order) {
    const plan = orderPackagingPlan(order.items ?? []);
    if (plan.errors.length) {
      setError(plan.errors[0]);
      return;
    }
    setSelectedOrderId(order.id);
    const next = plan.lines.map(line => ({ key: `${order.id}-${line.orderItemIndex}`, ...line }));
    setDrafts(next);
    setMessage("");
    setError("");
  }

  const draftValidation = useMemo(() => {
    if (!selectedOrder) return { errors: [], full: false };
    const plan = orderPackagingPlan(selectedOrder.items ?? []);
    const errors = [...plan.errors];
    let full = drafts.length === plan.lines.length;
    if (!full) errors.push("The packing worksheet must include every remaining ordered box.");
    for (const draft of drafts) {
      const item = selectedOrder.items[draft.orderItemIndex];
      const salable = salableById.get(item?.salableProductId || item?.productId);
      const required = item ? requiredGrams(item) : 0;
      const packedBefore = item ? numberValue(item.packedGrams) : 0;
      const remaining = Math.max(0, required - packedBefore);
      const packedNow = draft.boxGrams * draft.boxesPacked;
      if (!item || !salable) errors.push(`Order item ${draft.orderItemIndex + 1} could not be resolved.`);
      if (!draft.boxGrams || !packaging.some(p => Number(p.size) === draft.boxGrams)) errors.push(`${salable?.name || "Product"}: the ordered packaging size is not active in Packaging Master.`);
      if (packedNow > remaining) errors.push(`${salable?.name || "Product"}: selected boxes exceed the remaining ${remaining.toLocaleString()} gms.`);
      if (packedNow !== remaining) errors.push(`${salable?.name || "Product"}: packaging and box quantity must match the remaining order.`);
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

  async function deleteFulfilment(record: Fulfilment) {
    if (!user) return;
    setWorking(true);
    setError("");
    setMessage("");
    try {
      await cancelFulfilmentPacking(record.id, user.uid, user.email ?? undefined);
      setMessage(`Packing for ${record.orderNumber || record.orderId} has been cancelled before handover.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to cancel the packing record.");
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
              <strong>Active Subscriptions</strong>
              <div className="small text-muted">Completed deliveries are tracked against the agreed total. Add the next delivery here only when it is not already below.</div>
            </div>
            <span className="badge text-bg-info">{activeSubscriptions.length} active</span>
          </div>
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead><tr><th>Subscription</th><th>Customer</th><th>Product / Pack</th><th>Completed</th><th>Next Delivery</th><th className="text-end">Action</th></tr></thead>
              <tbody>
                {activeSubscriptions.map(({ subscription, completed, total, nextNumber, existingNext }) => <tr key={subscription.id}>
                  <td><strong>{subscription.subscriptionNumber}</strong></td>
                  <td>{subscription.customerName || subscription.customerMobile || subscription.customerId}</td>
                  <td>{subscription.productName}<div className="small text-muted">{subscription.sellingOptionLabel} × {subscription.quantity}</div></td>
                  <td><strong>{completed}</strong> / {total || "ongoing"}</td>
                  <td>{existingNext?.deliveryDate || subscription.nextDeliveryDate || "—"}<div className="small text-muted">Delivery #{nextNumber}</div></td>
                  <td className="text-end">
                    {existingNext ? <span className="badge text-bg-secondary">Already in packing</span> : <button className="btn btn-sm btn-outline-primary" disabled={addingSubscriptionId === subscription.id} onClick={() => void addSubscriptionDelivery(subscription)}>{addingSubscriptionId === subscription.id ? <><span className="spinner-border spinner-border-sm me-1" />Adding...</> : <><i className="bi bi-plus-lg me-1" />Add Delivery</>}</button>}
                  </td>
                </tr>)}
                {!activeSubscriptions.length && !loading && <tr><td colSpan={6} className="text-center text-muted py-4">No active subscriptions waiting for another delivery.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card border-0 shadow-sm mb-4">
          <div className="card-header d-flex justify-content-between align-items-center">
            <div>
              <strong>Pending Packing Requirements</strong>
              <div className="small text-muted">Only fully paid, confirmed orders are shown. Subscription orders also require an active subscription and a pending scheduled delivery.</div>
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
                {!pendingOrders.length && !loading && <tr><td colSpan={6} className="text-center text-muted py-5">No fully paid, confirmed orders require packing.</td></tr>}
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
            <div className="alert alert-info small">Packaging size and ordered box quantity are fixed from the confirmed order. The remaining ordered boxes will be packed; they cannot be changed here. A combo shows the Microgreen grams inside each box based on its Product percentages.</div>
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
                      <td style={{ minWidth: 160 }}>{item.sellingOptionLabel || packLabel(draft.boxGrams)}</td>
                      <td style={{ width: 160 }}><span>{draft.boxesPacked} remaining</span><div className="small text-muted">{item.quantity} ordered</div></td>
                      <td><strong>{packedNow.toLocaleString()} gms</strong></td>
                      <td><div className="small">{preview.map((row, i) => <span key={`${row.name}-${i}`} className="badge text-bg-light border me-1 mb-1 fw-normal">{row.name}: {row.grams}g</span>)}</div></td>
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>
            {draftValidation.errors.map((text, index) => <div key={`${text}-${index}`} className="alert alert-danger py-2 small mb-2">{text}</div>)}
          </div>
          <div className="card-footer d-flex justify-content-end gap-2">
            <button type="button" className="btn btn-secondary" onClick={() => { setSelectedOrderId(""); setDrafts([]); }}>Cancel</button>
            <button type="button" className="btn btn-success" disabled={working || loading || !!draftValidation.errors.length || !draftValidation.full} onClick={() => void pack()}>{working ? "Packing..." : "Pack Ordered Boxes"}</button>
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
                  <td>
                    <span className={`badge text-bg-${record.status === "packed" ? "success" : "warning"}`}>{record.status}</span>
                    {record.status !== "cancelled" && !["delivered", "out_for_delivery", "handed_to_delivery"].includes((orderById.get(record.orderId)?.status ?? "")) && !record.subscriptionDeliveryId && <button className="btn btn-link btn-sm p-0 ms-2 text-danger" onClick={() => void deleteFulfilment(record)}>Delete</button>}
                    {record.status !== "cancelled" && record.subscriptionDeliveryId && !["delivered", "out_for_delivery", "handed_to_delivery"].includes((subscriptionDeliveryById.get(record.subscriptionDeliveryId)?.status ?? "")) && <button className="btn btn-link btn-sm p-0 ms-2 text-danger" onClick={() => void deleteFulfilment(record)}>Delete</button>}
                  </td>
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
