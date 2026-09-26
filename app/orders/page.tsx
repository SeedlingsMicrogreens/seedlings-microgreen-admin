"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminPage } from "@/components/admin/AdminPage";
import { useAuth } from "@/components/auth/AuthProvider";
import { listCollection } from "@/lib/firestore";
import { createAdminOrder } from "@/lib/orderCreationService";
import { updateOrderStatus, refundOrderPayment, addOrderPayment } from "@/lib/orderService";
import type { Order, OrderStatus } from "@/types/order";
import { ORDER_STATUSES, formatOrderStatus } from "@/types/order";
import type { Customer } from "@/types/customer";
import type { SalesProduct, SalesProductSellingOption } from "@/types/salesProduct";
import type { Geolocation } from "@/types/geolocation";
import type { Offer } from "@/types/offer";
import { calculateOrderOffers, sellingOptionsFor } from "@/lib/orderOfferService";
import { formatAddressLines } from "@/lib/address";
import { promptText, showError, showSuccess } from "@/lib/alerts";

function money(v: number) { return `₹${Number(v || 0).toFixed(2)}`; }
function dateValue(v: unknown) {
  if (!v) return "—";
  if (typeof v === "object" && v && "toDate" in v && typeof (v as any).toDate === "function") return (v as any).toDate().toLocaleString();
  const d = new Date(v as any);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}
function statusClass(s: OrderStatus) {
  if (s === "delivered") return "success";
  if (s === "cancelled") return "danger";
  if (s === "out_for_delivery" || s === "handed_to_delivery") return "info";
  if (s === "pending_payment") return "warning";
  return "primary";
}
function customerMobile(c: Customer) { return c.mobileNumber || c.phone || c.id || ""; }
function customerLabel(c: Customer) { return c.name?.trim() || customerMobile(c) || "Customer"; }

export default function OrdersPage() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [salableProducts, setSalableProducts] = useState<SalesProduct[]>([]);
  const [geolocations, setGeolocations] = useState<Geolocation[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [tab, setTab] = useState<"list" | "create">("list");
  const [filter, setFilter] = useState<"all" | OrderStatus | "one_time" | "subscription">("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    try {
      const [o, c, p, d, offerRows] = await Promise.all([
        listCollection<Order>("orders", "createdAt"),
        listCollection<Customer>("customers", "updatedAt"),
        listCollection<SalesProduct>("salesProducts", "updatedAt"),
        listCollection<Geolocation>("geolocations", "updatedAt"),
        listCollection<Offer>("offers", "updatedAt"),
      ]);
      setOrders(o); setCustomers(c); setSalableProducts(p); setGeolocations(d); setOffers(offerRows); setError("");
    } catch (e) {
      setError("Unable to load orders.");
      await showError(e, "Unable to load orders.");
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => orders.filter(o => {
    const term = search.toLowerCase();
    const source = filter === "one_time"
      ? (o.orderType ?? "one_time") === "one_time"
      : filter === "subscription"
        ? o.orderType === "subscription"
        : filter === "all" || o.status === filter;
    return source && (!term || [o.orderNumber, o.id, o.customerName, o.customerMobile, o.subscriptionPlanName].filter(Boolean).join(" ").toLowerCase().includes(term));
  }), [orders, filter, search]);

  return <AdminPage><div className="container-fluid py-3">
    <div className="d-flex flex-wrap justify-content-between align-items-end gap-3 mb-3">
      <div><h1 className="h3 seedlings-brand mb-1">Orders</h1><p className="text-muted mb-0">Create and manage one-time orders from payment through delivery.</p></div>
      <button className="btn btn-outline-secondary" onClick={() => void load()} title="Refresh orders"><i className="bi bi-arrow-clockwise" /></button>
    </div>
    {error && <div className="alert alert-danger d-flex justify-content-between align-items-center"><span>{error}</span><button className="btn btn-sm btn-outline-danger" onClick={() => setError("")}>Dismiss</button></div>}
    <ul className="nav nav-tabs mb-3">
      <li className="nav-item"><button className={`nav-link ${tab === "list" ? "active" : ""}`} onClick={() => setTab("list")}><i className="bi bi-list-ul me-1" />Order Master <span className="badge text-bg-secondary ms-1">{orders.length}</span></button></li>
      <li className="nav-item"><button className={`nav-link ${tab === "create" ? "active" : ""}`} onClick={() => setTab("create")}><i className="bi bi-plus-lg me-1" />Create One-time Order</button></li>
    </ul>
    {tab === "create"
      ? <CreateOrder customers={customers} salableProducts={salableProducts} geolocations={geolocations} offers={offers} onCancel={() => setTab("list")} onSaved={async () => { await load(); setTab("list"); await showSuccess("One-time order created successfully."); }} />
      : <ListOrders orders={filtered} loading={loading} search={search} setSearch={setSearch} filter={filter} setFilter={setFilter} selected={selected} setSelected={setSelected} user={user} onChanged={load} />}
  </div></AdminPage>;
}

function ListOrders({ orders, loading, search, setSearch, filter, setFilter, selected, setSelected, user, onChanged }: {
  orders: Order[]; loading: boolean; search: string; setSearch: (s: string) => void;
  filter: "all" | OrderStatus | "one_time" | "subscription"; setFilter: (s: any) => void;
  selected: Order | null; setSelected: (o: Order | null) => void; user: any; onChanged: () => Promise<void>;
}) {
  const [next, setNext] = useState<OrderStatus | "">("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [refundSaving, setRefundSaving] = useState(false);
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentTransactionId, setPaymentTransactionId] = useState("");
  const [paymentReceiptFile, setPaymentReceiptFile] = useState<File | null>(null);

  async function save() {
    if (!selected || !next || !user) return;
    setSaving(true);
    try {
      await updateOrderStatus(selected, next, user.uid, user.email ?? undefined, note);
      setNote(""); setNext(""); await onChanged();
      const fresh = (await listCollection<Order>("orders", "createdAt")).find(o => o.id === selected.id);
      setSelected(fresh ?? null); await showSuccess("Order status updated");
    } catch (e) { await showError(e, "Unable to update order."); }
    finally { setSaving(false); }
  }

  async function recordPayment() {
    if (!selected || !user) return;
    const amount = Number(paymentAmount);
    const remaining = Math.max(0, Number(selected.total || 0) - Number(selected.paidAmount || 0));
    if (!Number.isFinite(amount) || amount <= 0 || amount > remaining + 0.005) {
      await showError(`Enter an amount between ₹0.01 and ${money(remaining)}.`, "Invalid payment amount");
      return;
    }
    setPaymentSaving(true);
    try {
      await addOrderPayment(selected, amount, user.uid, user.email ?? undefined, paymentTransactionId, paymentReceiptFile);
      setPaymentAmount(""); setPaymentTransactionId(""); setPaymentReceiptFile(null);
      await onChanged();
      const fresh = (await listCollection<Order>("orders", "createdAt")).find(o => o.id === selected.id);
      setSelected(fresh ?? null);
      await showSuccess("Payment recorded successfully");
    } catch (e) {
      await showError(e, "Unable to record payment.");
    } finally { setPaymentSaving(false); }
  }

  async function refund() {
    if (!selected || !user || selected.paymentStatus !== "paid") return;
    const amount = Number(selected.paidAmount ?? selected.total);
    const reason = await promptText({ title: `Refund ${money(amount)}?`, text: "Enter an optional reason for the refund.", inputLabel: "Refund reason", inputPlaceholder: "Optional reason", confirmText: "Continue refund" });
    if (reason === null) return;
    setRefundSaving(true);
    try {
      await refundOrderPayment(selected, user.uid, user.email ?? undefined, reason);
      await onChanged();
      const fresh = (await listCollection<Order>("orders", "createdAt")).find(o => o.id === selected.id);
      setSelected(fresh ?? null); await showSuccess("Refund completed");
    } catch (e) { await showError(e, "Unable to refund payment."); }
    finally { setRefundSaving(false); }
  }

  return <>
    <div className="card">
      <div className="card-header py-3"><div className="row g-2 align-items-center">
        <div className="col-lg-6"><div className="input-group"><span className="input-group-text"><i className="bi bi-search" /></span><input className="form-control" placeholder="Search order, customer, mobile or subscription..." value={search} onChange={e => setSearch(e.target.value)} /></div></div>
        <div className="col-lg-3"><select className="form-select" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">All orders</option><option value="one_time">One-time</option><option value="subscription">Subscription</option>{ORDER_STATUSES.map(s => <option key={s} value={s}>{formatOrderStatus(s)}</option>)}</select></div>
        <div className="col-lg-3 text-lg-end small text-muted">{orders.length} order{orders.length === 1 ? "" : "s"}</div>
      </div></div>
      <div className="table-responsive"><table className="table table-hover align-middle mb-0"><thead><tr><th>Order</th><th>Customer</th><th>Type</th><th>Total</th><th>Payment</th><th>Status</th><th className="text-end">Action</th></tr></thead><tbody>
        {orders.map(o => <tr key={o.id}>
          <td><strong>{o.orderNumber || o.id.slice(0, 8)}</strong><div className="small text-muted">{dateValue(o.createdAt)}</div></td>
          <td><strong>{o.customerName?.trim() || o.customerMobile || "Customer"}</strong><div className="small text-muted">{o.customerMobile || ""}</div></td>
          <td>{o.orderType === "subscription" ? <><span className="badge text-bg-primary">Subscription</span><div className="small text-muted">{o.subscriptionPlanName || ""}</div></> : <span className="badge text-bg-light border">One-time</span>}</td>
          <td><strong>{money(o.total)}</strong></td>
          <td><span className={`badge text-bg-${o.paymentStatus === "paid" ? "success" : o.paymentStatus === "partially_paid" ? "warning" : o.paymentStatus === "refunded" ? "secondary" : o.paymentStatus === "failed" ? "danger" : "warning"}`}>{o.paymentStatus === "partially_paid" ? `Partial · ${money(o.paidAmount ?? 0)} / ${money(o.total)}` : o.paymentStatus}</span></td>
          <td><span className={`badge text-bg-${statusClass(o.status)}`}>{formatOrderStatus(o.status)}</span></td>
          <td className="text-end"><button className="btn btn-sm btn-primary" onClick={() => { setSelected(o); setNext(""); setNote(""); }}><i className="bi bi-eye me-1" />View Details</button></td>
        </tr>)}
        {!orders.length && !loading && <tr><td colSpan={7} className="text-center text-muted py-5"><i className="bi bi-inbox fs-2 d-block mb-2" />No orders found.</td></tr>}
        {loading && <tr><td colSpan={7} className="text-center py-5"><span className="spinner-border spinner-border-sm me-2" />Loading orders...</td></tr>}
      </tbody></table></div>
    </div>

    {selected && <div className="modal fade show d-block seedlings-order-modal" tabIndex={-1} role="dialog" aria-modal="true" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}>
      <div className="modal-dialog modal-xl modal-dialog-scrollable"><div className="modal-content">
        <div className="modal-header"><div><h5 className="modal-title mb-1">{selected.orderNumber || selected.id}</h5><div className="small text-muted">Created {dateValue(selected.createdAt)}</div></div><div className="d-flex align-items-center gap-2"><span className={`badge text-bg-${statusClass(selected.status)}`}>{formatOrderStatus(selected.status)}</span><button type="button" className="btn-close" aria-label="Close" onClick={() => setSelected(null)} /></div></div>
        <div className="modal-body">
          <div className="row g-3">
            <div className="col-lg-8">
              <div className="card border mb-3"><div className="card-header"><strong><i className="bi bi-person me-2" />Customer & Delivery</strong></div><div className="card-body"><div className="row g-3"><div className="col-md-6"><div className="small text-muted">Customer</div><strong>{selected.customerName?.trim() || selected.customerMobile || "Customer"}</strong><div>{selected.customerMobile || "—"}</div></div><div className="col-md-6"><div className="small text-muted">Order type</div><span className="badge text-bg-light border">One-time order</span></div><div className="col-12">{selected.deliveryAddress ? <><div className="small text-muted mb-1">Delivery address</div>{formatAddressLines(selected.deliveryAddress).map((line, index) => <div key={index}>{line}</div>)}</> : <span className="text-muted">No delivery address stored.</span>}</div></div></div></div>
              <div className="card border mb-3"><div className="card-header"><strong><i className="bi bi-basket me-2" />Items</strong></div><div className="table-responsive"><table className="table table-sm align-middle mb-0"><thead><tr><th>Product</th><th>Qty</th><th>Unit Price</th><th className="text-end">Total</th></tr></thead><tbody>{(selected.items || []).map((i, n) => <tr key={n}><td><strong>{i.productName}</strong><div className="small text-muted">{i.sellingOptionLabel || i.unit || ""}</div></td><td>{i.quantity}</td><td>{money(i.unitPrice)}</td><td className="text-end">{money(i.lineTotal)}</td></tr>)}</tbody></table></div><div className="card-body border-top"><div className="d-flex justify-content-end"><dl className="row mb-0" style={{ minWidth: 280 }}><dt className="col-7">Subtotal</dt><dd className="col-5 text-end">{money(selected.subtotal)}</dd><dt className="col-7">Delivery</dt><dd className="col-5 text-end">{money(selected.deliveryFee)}</dd><dt className="col-7">Discount</dt><dd className="col-5 text-end">−{money(selected.discount)}</dd><dt className="col-7"><strong>Total</strong></dt><dd className="col-5 text-end"><strong>{money(selected.total)}</strong></dd></dl></div></div></div>
              {selected.notes && <div className="card border mb-3"><div className="card-header"><strong><i className="bi bi-sticky me-2" />Notes</strong></div><div className="card-body">{selected.notes}</div></div>}
            </div>
            <div className="col-lg-4">
              {selected.paymentStatus !== "paid" && <div className="card border mb-3"><div className="card-header d-flex justify-content-between align-items-center"><strong><i className="bi bi-credit-card me-2" />Payment</strong><span className={`badge text-bg-${selected.paymentStatus === "partially_paid" ? "warning" : selected.paymentStatus === "refunded" ? "secondary" : selected.paymentStatus === "failed" ? "danger" : "warning"}`}>{selected.paymentStatus === "partially_paid" ? "Partially paid" : selected.paymentStatus}</span></div><div className="card-body"><div className="small"><div className="d-flex justify-content-between mb-2"><span>Total</span><strong>{money(selected.total)}</strong></div><div className="d-flex justify-content-between mb-2"><span>Paid</span><strong className="text-success">{money(selected.paidAmount ?? 0)}</strong></div><div className="d-flex justify-content-between mb-3"><span>Remaining</span><strong className={Number(selected.total || 0) - Number(selected.paidAmount || 0) > 0.005 ? "text-danger" : "text-success"}>{money(Math.max(0, Number(selected.total || 0) - Number(selected.paidAmount || 0)))}</strong></div><div className="d-flex justify-content-between mb-2"><span>Method</span><span>{selected.paymentMethod || "—"}</span></div>{selected.paymentReceiptUrl && <a className="btn btn-sm btn-outline-primary w-100 mt-2" href={selected.paymentReceiptUrl} target="_blank" rel="noreferrer"><i className="bi bi-receipt me-1" />View latest payment receipt</a>}{selected.paymentStatus === "refunded" && <><hr /><div className="d-flex justify-content-between"><span>Refunded</span><strong>{money(selected.refundAmount ?? 0)}</strong></div><div className="d-flex justify-content-between"><span>Refund date</span><span>{dateValue(selected.refundedAt)}</span></div></>}{Number(selected.total || 0) - Number(selected.paidAmount || 0) > 0.005 && selected.paymentStatus !== "refunded" && <div className="border rounded p-3 mt-3"><div className="fw-semibold mb-2"><i className="bi bi-plus-circle me-1" />Record payment</div><div className="small text-muted mb-3">Remaining balance: <strong>{money(Math.max(0, Number(selected.total || 0) - Number(selected.paidAmount || 0)))}</strong>. You can collect the remaining amount in multiple payments.</div><label className="form-label">Amount received *</label><input className="form-control mb-2" type="number" min="0.01" max={Math.max(0, Number(selected.total || 0) - Number(selected.paidAmount || 0))} step="0.01" placeholder="Enter amount" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} /><label className="form-label">Transaction ID / No.</label><input className="form-control mb-2" placeholder="Optional" value={paymentTransactionId} onChange={e => setPaymentTransactionId(e.target.value)} /><label className="form-label">Payment transaction photo</label><input className="form-control mb-2" type="file" accept="image/*" onChange={e => setPaymentReceiptFile(e.target.files?.[0] || null)} /><div className="form-text mb-2">Optional · image only · max 5 MB.</div><button className="btn btn-success w-100" disabled={paymentSaving || !paymentAmount} onClick={() => void recordPayment()}>{paymentSaving ? "Saving payment..." : "Record Payment"}</button></div>}{(selected.paymentTransactions?.length || 0) > 0 && <div className="mt-4"><div className="fw-semibold mb-2">Payment history</div>{[...(selected.paymentTransactions || [])].reverse().map((tx, index) => <div className="border rounded p-2 mb-2" key={tx.id || index}><div className="d-flex justify-content-between"><strong>{money(tx.amount)}</strong><span className="small text-muted">{dateValue(tx.recordedAt)}</span></div><div className="small text-muted">Offline{tx.transactionId ? ` · ${tx.transactionId}` : " · No transaction number"}</div>{tx.paymentReceiptUrl && <a className="small" href={tx.paymentReceiptUrl} target="_blank" rel="noreferrer">View receipt</a>}</div>)}</div>}</div></div></div>}
              <div className="card border mb-3"><div className="card-header"><strong><i className="bi bi-truck me-2" />Delivery</strong></div><div className="card-body small">{selected.scheduledDeliveryDate ? <div><span className="text-muted">Scheduled date</span><div className="fw-semibold">{selected.scheduledDeliveryDate}</div></div> : <div className="text-muted">No delivery date set.</div>}</div></div>
              <div className="card border"><div className="card-header"><strong><i className="bi bi-arrow-repeat me-2" />Update Status</strong></div><div className="card-body"><select className="form-select mb-2" value={next} onChange={e => setNext(e.target.value as OrderStatus)}><option value="">Select next status</option>{ORDER_STATUSES.map(s => <option key={s} value={s}>{formatOrderStatus(s)}</option>)}</select><textarea className="form-control mb-2" rows={3} placeholder="Operational note (optional)" value={note} onChange={e => setNote(e.target.value)} /><button className="btn btn-success w-100" disabled={!next || saving || next === selected.status} onClick={() => void save()}>{saving ? "Updating..." : "Update order status"}</button></div></div>
            </div>
          </div>
        </div>
        <div className="modal-footer"><button className="btn btn-secondary" onClick={() => setSelected(null)}>Close</button></div>
      </div></div>
    </div>}
  </>;
}

function CreateOrder({ customers, salableProducts, geolocations, offers, onCancel, onSaved }: {
  customers: Customer[]; salableProducts: SalesProduct[]; geolocations: Geolocation[]; offers: Offer[]; onCancel: () => void; onSaved: () => Promise<void>;
}) {
  type DraftItem = { salableProductId: string; sellingOptionId: string; quantity: number };

  const [customerId, setCustomerId] = useState("");
  const [items, setItems] = useState<DraftItem[]>([{ salableProductId: "", sellingOptionId: "", quantity: 1 }]);
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [amountPaid, setAmountPaid] = useState("");
  const [transactionId, setTransactionId] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const customer = customers.find(c => c.id === customerId);
  const activeProducts = salableProducts.filter(p => p.active && p.oneTimePurchase);
  const deliveryLocation = customer?.addresses?.[0]?.pincode
    ? geolocations.find(g => g.active && g.pincode === customer.addresses?.[0]?.pincode)
    : undefined;
  const deliveryFee = Number(deliveryLocation?.deliveryCharge || 0);
  const deliveryCharge = deliveryLocation
    ? { id: deliveryLocation.id, name: deliveryLocation.pincode, amount: deliveryFee }
    : null;

  const resolvedItems = items.map(item => ({
    ...item,
    salableProduct: activeProducts.find(p => p.id === item.salableProductId),
  }));
  const validItems = resolvedItems.filter((item): item is DraftItem & { salableProduct: SalesProduct } => Boolean(item.salableProduct));
  const pricedItems = validItems.map(item => ({ ...item, sellingOption: sellingOptionsFor(item.salableProduct).find(o => o.id === item.sellingOptionId) }));
  const completeItems = pricedItems.filter((item): item is typeof item & { sellingOption: SalesProductSellingOption } => Boolean(item.sellingOption));
  const subtotal = completeItems.reduce((sum, item) => sum + Number(item.sellingOption.price) * item.quantity, 0);
  const offerDate = date || new Date().toISOString().slice(0, 10);
  const appliedOffers = calculateOrderOffers({ customer, locations: geolocations, offers, subtotal, deliveryFee, date: offerDate });
  const total = Math.max(0, subtotal + deliveryFee - appliedOffers.priceDiscount - appliedOffers.deliveryDiscount);

  function updateItem(index: number, patch: Partial<DraftItem>) {
    setItems(prev => prev.map((item, i) => i === index ? { ...item, ...patch } : item));
  }

  function addItem() {
    setItems(prev => [...prev, { salableProductId: "", sellingOptionId: "", quantity: 1 }]);
  }

  function removeItem(index: number) {
    setItems(prev => prev.length === 1 ? [{ salableProductId: "", sellingOptionId: "", quantity: 1 }] : prev.filter((_, i) => i !== index));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!customer) return showError("Select a customer.", "Customer required");
    if (!validItems.length || validItems.length !== items.length) return showError("Select a product for every item row.", "Products required");
    if (completeItems.length !== items.length) return showError("Select a selling option for every product.", "Selling option required");
    if (items.some(x => !Number.isInteger(x.quantity) || x.quantity < 1)) return showError("Each item quantity must be at least 1.", "Invalid quantity");
    if (!customer.addresses?.[0]) return showError("This customer has no saved delivery address. Add an address before creating the order.", "Delivery address required");

    setSaving(true);
    try {
      await createAdminOrder({
        customer,
        items: completeItems.map(item => ({ salableProduct: item.salableProduct, sellingOption: item.sellingOption, quantity: item.quantity, imageUrl: item.salableProduct.imageUrl })),
        discount: appliedOffers.priceDiscount + appliedOffers.deliveryDiscount,
        appliedOffers: {
          priceOfferId: appliedOffers.priceOffer?.id,
          priceOfferName: appliedOffers.priceOffer?.name,
          deliveryOfferId: appliedOffers.deliveryOffer?.id,
          deliveryOfferName: appliedOffers.deliveryOffer?.name,
        },
        deliveryCharge,
        scheduledDeliveryDate: date,
        notes,
        amountPaid: Number(amountPaid || 0),
        transactionId,
        paymentReceiptFile: receiptFile,
      });
      await onSaved();
    } catch (e) {
      await showError(e, "Unable to create one-time order.");
    } finally { setSaving(false); }
  }

  return <form onSubmit={save}>
    <div className="card border-0">
      <div className="card-header bg-transparent px-0">
        <div className="d-flex align-items-center justify-content-between gap-3">
          <div><h3 className="h5 mb-1">Create One-time Order</h3><p className="text-muted small mb-0">Admin-created orders are always one-time. No subscription is created from this screen.</p></div>
          <span className="badge text-bg-light border fs-6"><i className="bi bi-bag me-1" />One-time only</span>
        </div>
      </div>
      <div className="card-body px-0">
        <div className="row g-3">
          <div className="col-lg-6">
            <div className="card h-100 border">
              <div className="card-header"><strong>1. Customer</strong></div>
              <div className="card-body">
                <label className="form-label">Customer *</label>
                <select className="form-select" value={customerId} onChange={e => { setCustomerId(e.target.value); }} required>
                  <option value="">Select customer...</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{customerLabel(c)}{c.name?.trim() && customerMobile(c) ? ` — ${customerMobile(c)}` : ""}</option>)}
                </select>
                <div className="form-text">Customers without a name are identified by their mobile number.</div>
                {customer && <div className="alert alert-light border mt-3 mb-0 small">
                  <div className="fw-semibold">{customer.name?.trim() || customerMobile(customer)}</div>
                  <div>{customerMobile(customer) || "No mobile number"}</div>
                  {customer.addresses?.[0] ? <div className="text-muted mt-1"><i className="bi bi-check-circle me-1" />Default delivery address available</div> : <div className="text-danger mt-1"><i className="bi bi-exclamation-circle me-1" />No saved delivery address</div>}
                </div>}
              </div>
            </div>
          </div>

          <div className="col-lg-6">
            <div className="card h-100 border">
              <div className="card-header"><strong>2. Order Source</strong></div>
              <div className="card-body d-flex align-items-center">
                <div className="w-100"><div className="d-flex align-items-center gap-2 mb-2"><span className="badge text-bg-primary">One-time</span><span className="text-muted">Manual admin order</span></div><p className="small text-muted mb-0">This screen creates one-time orders only. Subscription selection and subscription creation are handled separately.</p></div>
              </div>
            </div>
          </div>

          <div className="col-12">
            <div className="card border">
              <div className="card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
                <div><strong>3. Products</strong><div className="small text-muted">Add one or more Products to the same order.</div></div>
                <button type="button" className="btn btn-sm btn-outline-primary" onClick={addItem}><i className="bi bi-plus-lg me-1" />Add Product</button>
              </div>
              <div className="card-body">
                <div className="table-responsive">
                  <table className="table align-middle mb-0">
                    <thead><tr><th style={{ minWidth: 280 }}>Product</th><th style={{ minWidth: 210 }}>Selling Option</th><th style={{ width: 120 }}>Quantity</th><th style={{ width: 150 }} className="text-end">Unit Price</th><th style={{ width: 160 }} className="text-end">Line Total</th><th style={{ width: 60 }} /></tr></thead>
                    <tbody>
                      {items.map((item, index) => {
                        const product = activeProducts.find(p => p.id === item.salableProductId);
                        const options = product ? sellingOptionsFor(product) : [];
                        const selectedOption = options.find(o => o.id === item.sellingOptionId);
                        const usedByOtherRow = new Set(items.filter((_, i) => i !== index).map(x => x.salableProductId).filter(Boolean));
                        return <tr key={`${index}-${item.salableProductId}-${item.sellingOptionId}`}>
                          <td>
                            <select className="form-select" value={item.salableProductId} onChange={e => { const next = e.target.value; const p = activeProducts.find(x => x.id === next); const first = p ? sellingOptionsFor(p)[0] : undefined; updateItem(index, { salableProductId: next, sellingOptionId: first?.id ?? "" }); }} required>
                              <option value="">Select product...</option>
                              {activeProducts.map(p => <option key={p.id} value={p.id} disabled={usedByOtherRow.has(p.id)}>{p.name}{p.sku ? ` (${p.sku})` : ""}</option>)}
                            </select>
                            {product && <div className="small text-muted mt-1">{product.type === "multiple" ? "Combo" : "Single"}</div>}
                          </td>
                          <td>
                            <select className="form-select" value={item.sellingOptionId} onChange={e => updateItem(index, { sellingOptionId: e.target.value })} disabled={!product} required>
                              <option value="">Select selling option...</option>
                              {options.map(o => <option key={o.id} value={o.id}>{o.weightGrams >= 1000 && o.weightGrams % 1000 === 0 ? `${o.weightGrams / 1000}kg` : `${o.weightGrams}gms`} — {money(o.price)}</option>)}
                            </select>
                          </td>
                          <td><input className="form-control" type="number" min="1" step="1" value={item.quantity} onChange={e => updateItem(index, { quantity: Number(e.target.value) })} required /></td>
                          <td className="text-end">{selectedOption ? money(Number(selectedOption.price)) : "—"}</td>
                          <td className="text-end fw-semibold">{selectedOption ? money(Number(selectedOption.price) * item.quantity) : "—"}</td>
                          <td className="text-end"><button type="button" className="btn btn-sm btn-outline-danger" title="Remove product" onClick={() => removeItem(index)}><i className="bi bi-trash" /></button></td>
                        </tr>;
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="small text-muted mt-3"><i className="bi bi-info-circle me-1" />The customer can have multiple different Products in one one-time order.</div>
              </div>
            </div>
          </div>

          <div className="col-lg-4">
            <div className="card border h-100"><div className="card-header"><strong>4. Delivery</strong></div><div className="card-body">
              <label className="form-label">Delivery charge</label><div className="form-control bg-light mb-3">{deliveryLocation ? money(deliveryFee) : customer ? "No delivery charge configured for this pincode" : "Select a customer"}</div>
              <label className="form-label">Scheduled delivery</label><input className="form-control" type="date" value={date} onChange={e => setDate(e.target.value)} />
              {appliedOffers.priceOffer && <div className="alert alert-success mt-3 mb-0 small"><strong>{appliedOffers.priceOffer.name}</strong> applied: {appliedOffers.priceDiscount > 0 ? `−${money(appliedOffers.priceDiscount)} on product price` : "No discount"}</div>}
              {appliedOffers.deliveryOffer && <div className="alert alert-success mt-2 mb-0 small"><strong>{appliedOffers.deliveryOffer.name}</strong> applied: {appliedOffers.deliveryDiscount > 0 ? `−${money(appliedOffers.deliveryDiscount)} on delivery` : "No discount"}</div>}
            </div></div>
          </div>

          <div className="col-lg-8">
            <div className="card border h-100"><div className="card-header d-flex justify-content-between align-items-center"><strong>5. Offline Payment</strong><span className="badge text-bg-info">Partial payment allowed</span></div><div className="card-body"><div className="row g-3">
              <div className="col-md-4"><label className="form-label">Payment method</label><input className="form-control" value="Offline" readOnly /><div className="form-text">Collect any amount now. The balance can be collected later in multiple payments.</div></div>
              <div className="col-md-4"><label className="form-label">Amount paid now</label><input className="form-control" type="number" min="0" max={total} step="0.01" placeholder="0.00" value={amountPaid} onChange={e => setAmountPaid(e.target.value)} /></div>
              <div className="col-md-4"><label className="form-label">Transaction ID / No.</label><input className="form-control" placeholder="Optional" value={transactionId} onChange={e => setTransactionId(e.target.value)} disabled={Number(amountPaid || 0) <= 0} /></div>
              <div className="col-md-8"><label className="form-label">Payment transaction photo</label><input className="form-control" type="file" accept="image/*" onChange={e => setReceiptFile(e.target.files?.[0] || null)} disabled={Number(amountPaid || 0) <= 0} /><div className="form-text">Optional. Image only, maximum 5 MB.</div>{receiptFile && <div className="small text-success mt-2"><i className="bi bi-paperclip me-1" />{receiptFile.name}</div>}</div>
              <div className="col-md-4 d-flex align-items-end"><div className="alert alert-light border w-100 mb-0 small"><strong>Total {money(total)}</strong><br />Paid now {money(Number(amountPaid || 0))}<br /><strong>Balance after order {money(Math.max(0, total - Number(amountPaid || 0)))}</strong></div></div>
            </div></div></div>
          </div>

          <div className="col-lg-7"><div className="card border"><div className="card-header"><strong>6. Notes</strong></div><div className="card-body"><textarea className="form-control" rows={4} placeholder="Optional order / delivery notes" value={notes} onChange={e => setNotes(e.target.value)} /></div></div></div>
          <div className="col-lg-5"><div className="card border h-100"><div className="card-header"><strong>Order Summary</strong></div><div className="card-body"><div className="d-flex justify-content-between mb-2"><span>Products ({validItems.length})</span><strong>{money(subtotal)}</strong></div><div className="d-flex justify-content-between mb-2"><span>Delivery</span><strong>{money(deliveryFee)}</strong></div>{(appliedOffers.priceDiscount + appliedOffers.deliveryDiscount) > 0 && <div className="d-flex justify-content-between mb-2 text-success"><span>Discount</span><strong>−{money(appliedOffers.priceDiscount + appliedOffers.deliveryDiscount)}</strong></div>}<div className="d-flex justify-content-between border-top pt-2 mt-2"><span><strong>Total</strong></span><strong>{money(total)}</strong></div><div className="d-flex justify-content-between mt-2"><span>Paid now</span><strong className="text-success">{money(Number(amountPaid || 0))}</strong></div><div className="d-flex justify-content-between mt-1"><span>Balance due</span><strong className="text-danger">{money(Math.max(0, total - Number(amountPaid || 0)))}</strong></div><div className="small text-muted mt-3">Payment status is Pending, Partially paid, or Paid based on the amount collected. Any balance can be collected later in multiple payments.</div></div></div></div>
        </div>
      </div>
      <div className="card-footer bg-transparent px-0 d-flex justify-content-end gap-2"><button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button><button className="btn btn-success px-4" disabled={saving}>{saving ? <><span className="spinner-border spinner-border-sm me-2" />Creating...</> : <><i className="bi bi-check2-circle me-1" />Create One-time Order</>}</button></div>
    </div>
  </form>;
}
