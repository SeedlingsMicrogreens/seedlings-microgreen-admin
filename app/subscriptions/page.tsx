"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminPage } from "@/components/admin/AdminPage";
import { useAuth } from "@/components/auth/AuthProvider";
import { createSubscription, updateSubscriptionStatus } from "@/lib/subscriptionService";
import { confirmAction } from "@/lib/alerts";
import { listCollection } from "@/lib/firestore";
import type { Product } from "@/types/catalog";
import type { Customer } from "@/types/customer";
import {
  SUBSCRIPTION_FREQUENCIES,
  SUBSCRIPTION_STATUSES,
  deliveriesForFrequency,
  frequencyLabel,
  nextDeliveryOnDay,
  packLabel,
} from "@/types/subscription";
import type { Subscription, SubscriptionFrequency, SubscriptionStatus } from "@/types/subscription";

function today() { return new Date().toISOString().slice(0, 10); }
function dateLabel(v?: string) {
  if (!v) return "Ongoing";
  return new Date(`${v}T00:00:00`).toLocaleDateString();
}
function statusClass(s: SubscriptionStatus) {
  return s === "active" ? "success" : s === "paused" ? "warning" : s === "cancelled" ? "danger" : "secondary";
}

export default function SubscriptionsPage() {
  const { user } = useAuth();
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [tab, setTab] = useState<"list" | "create">("list");
  const [selected, setSelected] = useState<Subscription | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | SubscriptionStatus>("all");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [s, p, c] = await Promise.all([
        listCollection<Subscription>("subscriptions"),
        listCollection<Product>("products"),
        listCollection<Customer>("customers"),
      ]);
      setSubscriptions(s);
      setProducts(p);
      setCustomers(c);
      setError("");
    } catch {
      setError("Unable to load subscriptions. Check Firestore rules/indexes.");
    } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return subscriptions.filter(s =>
      (status === "all" || s.status === status) &&
      (!q || [s.subscriptionNumber, s.customerName, s.customerMobile, s.productName, s.sellingOptionLabel].join(" ").toLowerCase().includes(q))
    );
  }, [subscriptions, search, status]);

  async function changeStatus(sub: Subscription, next: SubscriptionStatus) {
    if (!user) return;
    if (next === "cancelled" && !(await confirmAction({title:"Cancel this subscription?",text:"This will stop the active subscription. This action cannot be undone from this confirmation.",confirmText:"Yes, cancel"}))) return;
    try {
      await updateSubscriptionStatus(sub, next, user.uid, user.email ?? undefined);
      setSelected({ ...sub, status: next });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to update subscription.");
    }
  }

  return <AdminPage>
    <div className="container-fluid py-3">
      <div className="d-flex flex-wrap justify-content-between align-items-end gap-3 mb-3">
        <div><h1 className="h3 seedlings-brand mb-1">Subscriptions</h1><p className="text-muted mb-0">Manage recurring customer purchases based on existing products and selling options.</p></div>
        {tab === "list" && <button className="btn btn-success" onClick={() => { setError(""); setTab("create"); }}><i className="bi bi-plus-lg me-1"/>New Subscription</button>}
      </div>
      {error && <div className="alert alert-danger">{error}</div>}
      <ul className="nav nav-tabs mb-3">
        <li className="nav-item"><button className={`nav-link ${tab === "list" ? "active" : ""}`} onClick={() => setTab("list")}><i className="bi bi-repeat me-1"/>Subscriptions</button></li>
        {tab === "create" && <li className="nav-item"><button className="nav-link active"><i className="bi bi-plus-square me-1"/>Create Subscription</button></li>}
      </ul>

      {tab === "list" ? <>
        <div className="card">
          <div className="card-header"><div className="row g-2 align-items-center">
            <div className="col-lg-6"><div className="input-group"><span className="input-group-text"><i className="bi bi-search"/></span><input className="form-control" placeholder="Search customer, product or subscription..." value={search} onChange={e => setSearch(e.target.value)}/></div></div>
            <div className="col-lg-3"><select className="form-select" value={status} onChange={e => setStatus(e.target.value as typeof status)}><option value="all">All statuses</option>{SUBSCRIPTION_STATUSES.map(s => <option key={s} value={s}>{frequencyLabel(s as never)}</option>)}</select></div>
            <div className="col-lg-3 text-lg-end text-muted small">{filtered.length} subscriptions</div>
          </div></div>
          <div className="table-responsive"><table className="table table-hover align-middle mb-0"><thead><tr>
            <th>Subscription</th><th>Customer</th><th>Product / Pack</th><th>Frequency</th><th>Deliveries</th><th>Next delivery</th><th>Amount</th><th>Status</th><th className="text-end">Action</th>
          </tr></thead><tbody>
            {filtered.map(s => <tr key={s.id}>
              <td><strong>{s.subscriptionNumber}</strong><div className="small text-muted">Started {dateLabel(s.startDate)}</div></td>
              <td>{s.customerName || "—"}<div className="small text-muted">{s.customerMobile || ""}</div></td>
              <td>{s.productName}<div className="small text-muted">{s.sellingOptionLabel} × {s.quantity}</div></td>
              <td>{frequencyLabel(s.frequency)}</td>
              <td>{s.totalDeliveries ? `${s.completedDeliveries ?? 0} / ${s.totalDeliveries}` : `${s.completedDeliveries ?? 0} / ongoing`}</td>
              <td>{dateLabel(s.nextDeliveryDate)}</td>
              <td>₹{(s.unitPrice * s.quantity).toFixed(2)}</td>
              <td><span className={`badge text-bg-${statusClass(s.status)}`}>{frequencyLabel(s.status as never)}</span></td>
              <td className="text-end"><button className="btn btn-sm btn-outline-primary" onClick={() => setSelected(s)}>View</button></td>
            </tr>)}
            {!filtered.length && !loading && <tr><td colSpan={9} className="text-center text-muted py-5"><i className="bi bi-repeat fs-2 d-block mb-2"/>No subscriptions found.</td></tr>}
            {loading && <tr><td colSpan={9} className="text-center py-5"><span className="spinner-border spinner-border-sm me-2"/>Loading subscriptions...</td></tr>}
          </tbody></table></div>
        </div>
      </> : user && <CreateSubscription customers={customers} products={products} uid={user.uid} email={user.email ?? undefined} onCancel={() => setTab("list")} onCreated={async () => { await load(); setTab("list"); }} onError={setError}/>}

      {selected && <SubscriptionDetails subscription={selected} onClose={() => setSelected(null)} onStatus={changeStatus}/>}
    </div>
  </AdminPage>;
}

function CreateSubscription({ customers, products, uid, email, onCancel, onCreated, onError }: {
  customers: Customer[]; products: Product[]; uid: string; email?: string;
  onCancel: () => void; onCreated: () => Promise<void>; onError: (x: string) => void;
}) {
  const [customerId, setCustomerId] = useState("");
  const [productId, setProductId] = useState("");
  const [optionId, setOptionId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [frequency, setFrequency] = useState<SubscriptionFrequency>("weekly");
  const [startDate, setStartDate] = useState(today());
  const [deliveryDay, setDeliveryDay] = useState(6); // Saturday default, configurable
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const customer = customers.find(c => c.id === customerId);
  const product = products.find(p => p.id === productId);
  const options = (product?.sellingOptions ?? []).filter(o => o.active && o.weightGrams > 0);
  const selectedOption = options.find(o => o.id === optionId);
  const total = deliveriesForFrequency(frequency);
  const firstDelivery = startDate ? nextDeliveryOnDay(new Date(`${startDate}T00:00:00`), deliveryDay) : "";
  const endDate = total == null ? "" : (() => {
    if (!firstDelivery) return "";
    const d = new Date(`${firstDelivery}T00:00:00`);
    d.setDate(d.getDate() + (total - 1) * 7);
    return d.toISOString().slice(0, 10);
  })();

  function chooseProduct(id: string) {
    setProductId(id);
    const p = products.find(x => x.id === id);
    const first = (p?.sellingOptions ?? []).find(o => o.active);
    setOptionId(first?.id ?? "");
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    onError("");
    if (!customer || !product || !selectedOption) return onError("Select customer, product and an active selling option.");
    if (!Number.isInteger(quantity) || quantity < 1) return onError("Quantity must be at least 1.");
    setSaving(true);
    try {
      const address = customer.addresses?.[0];
      await createSubscription({
        customer, product, sellingOptionId: selectedOption.id, quantity, frequency, startDate,
        deliveryDay, deliveryAddress: typeof address === "string" ? { address } : (address as Record<string, unknown> | undefined),
        notes, uid, email
      });
      await onCreated();
    } catch (err) { onError(err instanceof Error ? err.message : "Unable to create subscription."); }
    finally { setSaving(false); }
  }

  return <form onSubmit={save}><div className="card">
    <div className="card-header"><h3 className="card-title mb-0">Create Subscription</h3></div>
    <div className="card-body"><div className="row g-4">
      <div className="col-lg-7"><div className="card border"><div className="card-header"><strong>Subscription</strong></div><div className="card-body">
        <div className="row g-3">
          <div className="col-md-6"><label className="form-label">Customer *</label><select className="form-select" value={customerId} onChange={e => setCustomerId(e.target.value)} required><option value="">Select customer...</option>{customers.map(c => <option key={c.id} value={c.id}>{c.name || "Unnamed"}{c.mobileNumber ? ` — ${c.mobileNumber}` : ""}</option>)}</select></div>
          <div className="col-md-6"><label className="form-label">Microgreen *</label><select className="form-select" value={productId} onChange={e => chooseProduct(e.target.value)} required><option value="">Select microgreen...</option>{products.filter(p => p.status !== "inactive").map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
          <div className="col-md-7"><label className="form-label">Selling / packing option *</label><select className="form-select" value={optionId} onChange={e => setOptionId(e.target.value)} disabled={!product} required><option value="">Select pack...</option>{options.map(o => <option key={o.id} value={o.id}>{packLabel(o.weightGrams)} — ₹{o.price}</option>)}</select></div>
          <div className="col-md-5"><label className="form-label">Packs per delivery *</label><input className="form-control" type="number" min="1" step="1" value={quantity} onChange={e => setQuantity(Number(e.target.value))} required/></div>
          <div className="col-md-4"><label className="form-label">Frequency *</label><select className="form-select" value={frequency} onChange={e => setFrequency(e.target.value as SubscriptionFrequency)}>{SUBSCRIPTION_FREQUENCIES.map(f => <option key={f} value={f}>{frequencyLabel(f)}</option>)}</select></div>
          <div className="col-md-4"><label className="form-label">Start date *</label><input className="form-control" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} required/></div>
          <div className="col-md-4"><label className="form-label">Delivery day *</label><select className="form-select" value={deliveryDay} onChange={e => setDeliveryDay(Number(e.target.value))}><option value={0}>Sunday</option><option value={1}>Monday</option><option value={2}>Tuesday</option><option value={3}>Wednesday</option><option value={4}>Thursday</option><option value={5}>Friday</option><option value={6}>Saturday</option></select><div className="form-text">Phase 1 default: Saturday.</div></div>
        </div>
        <div className="mt-3"><label className="form-label">Notes</label><textarea className="form-control" rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional subscription notes..."/></div>
      </div></div></div>
      <div className="col-lg-5"><div className="card border"><div className="card-header"><strong>Subscription Preview</strong></div><div className="card-body">
        {!selectedOption ? <div className="text-muted">Select a product and selling option to preview the subscription.</div> : <>
          <div className="mb-3"><strong>{product?.name}</strong><div className="text-muted">{packLabel(selectedOption.weightGrams)} × {quantity}</div></div>
          <div className="row g-3 small"><div className="col-6"><span className="text-muted">Per delivery</span><strong className="d-block">₹{(selectedOption.price * quantity).toFixed(2)}</strong></div><div className="col-6"><span className="text-muted">Grams / delivery</span><strong className="d-block">{(selectedOption.weightGrams * quantity).toLocaleString()} gms</strong></div><div className="col-6"><span className="text-muted">Frequency</span><strong className="d-block">{frequencyLabel(frequency)}</strong></div><div className="col-6"><span className="text-muted">Deliveries</span><strong className="d-block">{total == null ? "Ongoing" : total}</strong></div><div className="col-6"><span className="text-muted">First delivery</span><strong className="d-block">{dateLabel(firstDelivery)}</strong></div><div className="col-6"><span className="text-muted">End date</span><strong className="d-block">{dateLabel(endDate)}</strong></div></div>
          <div className="alert alert-light border mt-3 mb-0 small">This subscription will create normal orders for its deliveries. It does not directly deduct inventory.</div>
        </>}
      </div></div></div>
    </div></div>
    <div className="card-footer d-flex justify-content-end gap-2"><button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button><button className="btn btn-success" disabled={saving}>{saving ? "Creating..." : "Create Subscription"}</button></div>
  </div></form>;
}

function SubscriptionDetails({ subscription, onClose, onStatus }: {
  subscription: Subscription; onClose: () => void;
  onStatus: (s: Subscription, next: SubscriptionStatus) => Promise<void>;
}) {
  const perDelivery = subscription.unitPrice * subscription.quantity;
  const grams = subscription.weightGrams * subscription.quantity;
  return <div className="modal d-block" tabIndex={-1} role="dialog" aria-modal="true" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="modal-dialog modal-lg modal-dialog-centered"><div className="modal-content">
      <div className="modal-header"><div><h2 className="modal-title h5 mb-1">{subscription.subscriptionNumber}</h2><div className="small text-muted">{subscription.customerName} • {subscription.customerMobile || "No mobile"}</div></div><button className="btn-close" aria-label="Close" onClick={onClose}/></div>
      <div className="modal-body">
        <div className="row g-3">
          <div className="col-md-6"><div className="border rounded p-3 h-100"><h3 className="h6">Purchase</h3><dl className="row mb-0"><dt className="col-6">Product</dt><dd className="col-6">{subscription.productName}</dd><dt className="col-6">Selling option</dt><dd className="col-6">{subscription.sellingOptionLabel}</dd><dt className="col-6">Quantity</dt><dd className="col-6">{subscription.quantity} pack(s)</dd><dt className="col-6">Grams / delivery</dt><dd className="col-6">{grams.toLocaleString()} gms</dd><dt className="col-6">Price / delivery</dt><dd className="col-6">₹{perDelivery.toFixed(2)}</dd></dl></div></div>
          <div className="col-md-6"><div className="border rounded p-3 h-100"><h3 className="h6">Schedule</h3><dl className="row mb-0"><dt className="col-6">Frequency</dt><dd className="col-6">{frequencyLabel(subscription.frequency)}</dd><dt className="col-6">Delivery day</dt><dd className="col-6">{["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][subscription.deliveryDay] ?? "Saturday"}</dd><dt className="col-6">Start</dt><dd className="col-6">{dateLabel(subscription.startDate)}</dd><dt className="col-6">Next delivery</dt><dd className="col-6">{dateLabel(subscription.nextDeliveryDate)}</dd><dt className="col-6">Deliveries</dt><dd className="col-6">{subscription.totalDeliveries ? `${subscription.completedDeliveries ?? 0} / ${subscription.totalDeliveries}` : `${subscription.completedDeliveries ?? 0} / ongoing`}</dd><dt className="col-6">End</dt><dd className="col-6">{dateLabel(subscription.endDate)}</dd></dl></div></div>
        </div>
        <div className="alert alert-info mt-3 mb-0 small">Future subscription demand is available to the Forecasting phase. Each occurrence should become a normal order before fulfilment.</div>
      </div>
      <div className="modal-footer">
        {subscription.status === "active" && <button className="btn btn-outline-warning" onClick={() => void onStatus(subscription, "paused")}><i className="bi bi-pause-circle me-1"/>Pause</button>}
        {subscription.status === "paused" && <button className="btn btn-success" onClick={() => void onStatus(subscription, "active")}><i className="bi bi-play-circle me-1"/>Resume</button>}
        {(subscription.status === "active" || subscription.status === "paused") && <button className="btn btn-outline-danger" onClick={() => void onStatus(subscription, "cancelled")}><i className="bi bi-x-circle me-1"/>Cancel</button>}
        <button className="btn btn-secondary" onClick={onClose}>Close</button>
      </div>
    </div></div>
  </div>;
}
