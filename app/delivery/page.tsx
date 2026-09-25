"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminPage } from "@/components/admin/AdminPage";
import { useAuth } from "@/components/auth/AuthProvider";
import { createRecord, listCollection, updateRecord } from "@/lib/firestore";
import { assignOrderToDelivery, updateDeliveryAssignmentStatus } from "@/lib/deliveryService";
import { confirmAction, showSuccess } from "@/lib/alerts";
import type { DeliveryAssignment, DeliveryUser, DeliveryUserStatus } from "@/types/delivery";
import type { Order } from "@/types/order";
import type { SalesProduct } from "@/types/salesProduct";
import type { SubscriptionDelivery } from "@/types/subscriptionDelivery";

type Tab = "handover" | "status" | "subscriptionDeliveries" | "users";

function userName(u: DeliveryUser) { return u.name?.trim() || "Unnamed delivery user"; }
function customerName(order: Order) { return order.customerName?.trim() || order.customerMobile || order.customerId; }
function customerMobile(order: Order) { return order.customerMobile || order.deliveryAddress?.mobileNumber || "—"; }
function numberValue(value: unknown) { const n = Number(value ?? 0); return Number.isFinite(n) ? n : 0; }
function itemLabel(order: Order, item: Order["items"][number], salableById: Map<string, SalesProduct>) {
  const salable = salableById.get(item.salableProductId || item.productId);
  const name = item.productName || salable?.name || "Product";
  const weight = Math.round(numberValue(item.weightGrams) || salable?.components.reduce((sum, c) => sum + numberValue(c.quantityGrams), 0) || 0);
  const boxes = Math.max(0, Math.round(numberValue(item.quantity)));
  return `${name} ${weight ? `${weight.toLocaleString()} gms ` : ""}${boxes} ${boxes === 1 ? "box" : "boxes"}`;
}

export default function DeliveryPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<DeliveryUser[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [assignments, setAssignments] = useState<DeliveryAssignment[]>([]);
  const [subscriptionDeliveries, setSubscriptionDeliveries] = useState<SubscriptionDelivery[]>([]);
  const [salableProducts, setSalableProducts] = useState<SalesProduct[]>([]);
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedUser, setSelectedUser] = useState<DeliveryUser | null>(null);
  const [creatingUser, setCreatingUser] = useState(false);
  const [tab, setTab] = useState<Tab>("handover");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [deliveryUsers, orderData, assignmentData, subscriptionDeliveryData, salesProducts] = await Promise.all([
        listCollection<DeliveryUser>("deliveryUsers"),
        listCollection<Order>("orders"),
        listCollection<DeliveryAssignment>("deliveryAssignments", "assignedAt"),
        listCollection<SubscriptionDelivery>("subscriptionDeliveries", "createdAt"),
        listCollection<SalesProduct>("salesProducts"),
      ]);
      setUsers(deliveryUsers);
      setOrders(orderData);
      setAssignments(assignmentData);
      setSubscriptionDeliveries(subscriptionDeliveryData);
      setSalableProducts(salesProducts);
      setError("");
    } catch {
      setError("Unable to load delivery operations. Check Firestore rules/indexes.");
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  const activeUsers = useMemo(() => users.filter(u => u.status === "active"), [users]);
  const salableById = useMemo(() => new Map(salableProducts.map(p => [p.id, p])), [salableProducts]);
  // Delivery Operations is driven by packing state, not by the scheduled delivery date.
  // Every fully packed order remains available for handover until it is assigned.
  const assignedOrderIds = useMemo(() => new Set(assignments.filter(a => !["delivered", "cancelled"].includes(a.status)).map(a => a.orderId)), [assignments]);
  const readyForHandover = useMemo(() => orders
    .filter(o => !assignedOrderIds.has(o.id) && o.status === "packed")
    .sort((a, b) => String(a.scheduledDeliveryDate || "").localeCompare(String(b.scheduledDeliveryDate || "")) || String(a.orderNumber || a.id).localeCompare(String(b.orderNumber || b.id))), [orders, assignedOrderIds]);
  const deliveryStatusAssignments = useMemo(() => assignments
    .filter(a => !["delivered", "cancelled"].includes(a.status))
    .sort((a, b) => String(b.assignedAt ?? "").localeCompare(String(a.assignedAt ?? ""))), [assignments]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter(u => !q || [u.name, u.mobileNumber, u.email, u.vehicleType, u.vehicleNumber].filter(Boolean).join(" ").toLowerCase().includes(q));
  }, [users, search]);

  function toggleOrder(id: string) {
    setSelectedOrderIds(current => current.includes(id) ? current.filter(x => x !== id) : [...current, id]);
  }

  function selectAllVisible() {
    setSelectedOrderIds(current => current.length === readyForHandover.length ? [] : readyForHandover.map(o => o.id));
  }

  async function handover() {
    if (!user || !selectedUserId || !selectedOrderIds.length) return;
    const deliveryUser = activeUsers.find(u => u.id === selectedUserId);
    if (!deliveryUser) return;
    const selectedOrders = readyForHandover.filter(o => selectedOrderIds.includes(o.id));
    if (!selectedOrders.length) return;
    const confirmed = await confirmAction({
      title: "Hand over selected orders?",
      text: `${selectedOrders.length} order(s) will be handed over to ${deliveryUser.name} and marked Out for delivery.`,
      confirmText: "Hand over",
    });
    if (!confirmed) return;
    setWorking(true);
    setError("");
    try {
      for (const order of selectedOrders) {
        await assignOrderToDelivery(order, deliveryUser, user.uid, user.email ?? undefined);
      }
      setSelectedOrderIds([]);
      setSelectedUserId("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to hand over selected orders.");
      await load();
    } finally { setWorking(false); }
  }

  async function updateAssignment(a: DeliveryAssignment, status: DeliveryAssignment["status"]) {
    if (!user) return;
    try {
      await updateDeliveryAssignmentStatus(a.id, status, user.uid, user.email ?? undefined);
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to update delivery status."); }
  }

  async function saveDeliveryUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const mobileNumber = String(form.get("mobileNumber") ?? "").trim();
    const authUid = String(form.get("authUid") ?? "").trim();
    if (!name || !mobileNumber || !authUid) { setError("Name, mobile number and Firebase Auth UID are required."); return; }
    try {
      const data = { authUid, name, mobileNumber, email: String(form.get("email") ?? "").trim(), vehicleType: String(form.get("vehicleType") ?? "").trim(), vehicleNumber: String(form.get("vehicleNumber") ?? "").trim(), status: "active" as DeliveryUserStatus };
      if (selectedUser) await updateRecord("deliveryUsers", selectedUser.id, data); else await createRecord("deliveryUsers", data);
      setSelectedUser(null); setCreatingUser(false); setTab("users"); await load();
    } catch { setError(selectedUser ? "Unable to update delivery user." : "Unable to create delivery user."); }
  }

  async function toggleUser(u: DeliveryUser) {
    const next = u.status === "active" ? "inactive" : "active";
    const action = next === "inactive" ? "deactivate" : "activate";
    if (!(await confirmAction({ title: `${action === "deactivate" ? "Deactivate" : "Activate"} ${userName(u)}?`, text: `This will ${action} this delivery user. This action changes the user's delivery access and cannot be undone by this confirmation.`, confirmText: action === "deactivate" ? "Yes, deactivate" : "Yes, activate" }))) return;
    try { await updateRecord("deliveryUsers", u.id, { status: next }); await load(); await showSuccess(`Delivery user ${action}d`); } catch { setError("Unable to update delivery user."); }
  }

  function openCreate() { setSelectedUser(null); setCreatingUser(true); setError(""); setTab("users"); }
  function openEdit(u: DeliveryUser) { setSelectedUser(u); setCreatingUser(false); setError(""); setTab("users"); }

  return <AdminPage>
    <div className="container-fluid py-3">
      <div className="d-flex flex-wrap justify-content-between align-items-end gap-3 mb-3">
        <div>
          <h1 className="h3 seedlings-brand mb-1">Delivery Operations</h1>
          <p className="text-muted mb-0">Hand over packed orders and track delivery status.</p>
        </div>
        {tab === "users" && !selectedUser && <button className="btn btn-success" onClick={openCreate}><i className="bi bi-person-plus me-1" /> Add Delivery User</button>}
        {tab === "handover" && <div className="d-flex gap-2"><span className="badge text-bg-success align-self-center">{activeUsers.length} active users</span><span className="badge text-bg-warning align-self-center">{readyForHandover.length} awaiting handover</span></div>}
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      <ul className="nav nav-tabs mb-3">
        <li className="nav-item"><button className={`nav-link ${tab === "handover" ? "active" : ""}`} onClick={() => { setTab("handover"); setSelectedUser(null); setCreatingUser(false); }}><i className="bi bi-box-arrow-right me-1" /> Handover</button></li>
        <li className="nav-item"><button className={`nav-link ${tab === "status" ? "active" : ""}`} onClick={() => setTab("status")}><i className="bi bi-truck me-1" /> Delivery Status <span className="badge text-bg-secondary ms-1">{deliveryStatusAssignments.length}</span></button></li>
        <li className="nav-item"><button className={`nav-link ${tab === "subscriptionDeliveries" ? "active" : ""}`} onClick={() => setTab("subscriptionDeliveries")}><i className="bi bi-arrow-repeat me-1" /> Subscription Deliveries <span className="badge text-bg-secondary ms-1">{subscriptionDeliveries.length}</span></button></li>
        <li className="nav-item"><button className={`nav-link ${tab === "users" ? "active" : ""}`} onClick={() => setTab("users")}><i className="bi bi-people me-1" /> Delivery Users <span className="badge text-bg-secondary ms-1">{users.length}</span></button></li>
      </ul>

      {tab === "handover" && <>
        <div className="card mb-3">
          <div className="card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
            <div><h3 className="card-title mb-0">Packed Orders — Ready for Handover</h3><div className="small text-muted mt-1">All fully packed orders are shown until they are handed over for delivery.</div></div>
            <button className="btn btn-sm btn-outline-secondary" onClick={selectAllVisible} disabled={!readyForHandover.length}>{selectedOrderIds.length === readyForHandover.length && readyForHandover.length ? "Clear selection" : "Select all"}</button>
          </div>
          <div className="card-body p-0">
            {readyForHandover.map(order => <div key={order.id} className="border-bottom p-3">
              <div className="d-flex gap-3 align-items-start">
                <div className="pt-1"><input className="form-check-input" type="checkbox" checked={selectedOrderIds.includes(order.id)} onChange={() => toggleOrder(order.id)} aria-label={`Select ${order.orderNumber || order.id}`} /></div>
                <div className="flex-grow-1">
                  <div className="d-flex flex-wrap justify-content-between gap-2">
                    <div><strong>{customerName(order)}</strong><div className="small text-muted"><i className="bi bi-telephone me-1" />{customerMobile(order)}</div></div>
                    <div className="text-end"><strong>{order.orderNumber || order.id.slice(0, 8)}</strong><div className="small text-muted">₹{numberValue(order.total).toFixed(2)}</div></div>
                  </div>
                  <div className="mt-2 d-flex flex-wrap gap-2">{(order.items ?? []).map((item, index) => <span key={`${order.id}-${index}`} className="badge text-bg-light border fw-normal">{itemLabel(order, item, salableById)}</span>)}</div>
                </div>
              </div>
            </div>)}
            {!readyForHandover.length && !loading && <div className="text-center text-muted py-5"><i className="bi bi-check2-circle fs-2 d-block mb-2" />No packed orders are awaiting handover.</div>}
            {loading && <div className="text-center py-5"><span className="spinner-border spinner-border-sm me-2" />Loading packed orders...</div>}
          </div>
        </div>

        <div className="card border-success sticky-top" style={{ top: 12, zIndex: 10 }}>
          <div className="card-body">
            <div className="row g-3 align-items-end">
              <div className="col-lg-8">
                <label className="form-label fw-semibold">Delivery User — common for selected orders</label>
                <select className="form-select" value={selectedUserId} onChange={e => setSelectedUserId(e.target.value)} disabled={!selectedOrderIds.length}>
                  <option value="">{selectedOrderIds.length ? "Select active delivery user" : "Select orders first"}</option>
                  {activeUsers.map(u => <option key={u.id} value={u.id}>{u.name} — {u.mobileNumber}{u.vehicleNumber ? ` — ${u.vehicleNumber}` : ""}</option>)}
                </select>
              </div>
              <div className="col-lg-4"><button className="btn btn-success w-100" disabled={working || !selectedOrderIds.length || !selectedUserId} onClick={() => void handover()}><i className="bi bi-box-arrow-right me-1" /> {working ? "Handing over..." : `Hand over ${selectedOrderIds.length || ""} selected`}</button></div>
            </div>
          </div>
        </div>
      </>}

      {tab === "status" && <div className="card">
        <div className="card-header"><h3 className="card-title mb-0">Out for Delivery</h3><div className="small text-muted mt-1">Orders handed over to a delivery user remain here until they are delivered.</div></div>
        <div className="card-body p-0">
          {deliveryStatusAssignments.map(a => {
            const order = orders.find(o => o.id === a.orderId);
            return <div key={a.id} className="border-bottom p-3">
              <div className="d-flex flex-wrap justify-content-between gap-3">
                <div className="flex-grow-1">
                  <div className="d-flex flex-wrap gap-2 align-items-center"><strong>{order ? customerName(order) : (a.orderNumber || a.orderId)}</strong><span className="badge text-bg-info">{a.status.replaceAll("_", " ")}</span></div>
                  {order && <div className="small text-muted"><i className="bi bi-telephone me-1" />{customerMobile(order)} · {order.orderNumber || order.id}</div>}
                  {order && <div className="mt-2 d-flex flex-wrap gap-2">{(order.items ?? []).map((item, index) => <span key={`${a.id}-${index}`} className="badge text-bg-light border fw-normal">{itemLabel(order, item, salableById)}</span>)}</div>}
                </div>
                <div className="text-end">
                  <div className="fw-semibold"><i className="bi bi-person me-1" />{a.deliveryUserName}</div>
                  <div className="small text-muted"><i className="bi bi-telephone me-1" />{a.deliveryUserMobile || users.find(u => u.id === a.deliveryUserId)?.mobileNumber || "—"}</div>
                  <div className="mt-2 text-nowrap">{a.status === "out_for_delivery" && <button className="btn btn-sm btn-success" onClick={() => void updateAssignment(a, "delivered")}>Delivered</button>}</div>
                </div>
              </div>
            </div>;
          })}
          {!deliveryStatusAssignments.length && !loading && <div className="text-center text-muted py-5"><i className="bi bi-truck fs-2 d-block mb-2" />No active deliveries.</div>}
        </div>
      </div>}

      {tab === "subscriptionDeliveries" && <div className="card">
        <div className="card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
          <div><h3 className="card-title mb-0">Subscription Deliveries</h3><div className="small text-muted mt-1">Informational view of individual subscription deliveries. Delivery actions are performed from Handover and Delivery Status.</div></div>
          <span className="badge text-bg-light border text-dark"><i className="bi bi-eye me-1" /> Read only</span>
        </div>
        <div className="card-body border-bottom py-2">
          <div className="small text-muted"><i className="bi bi-info-circle me-1" />These records are updated automatically when the related subscription order is packed, sent out for delivery, or delivered. Nothing can be changed or deleted from this tab.</div>
        </div>
        <div className="table-responsive"><table className="table table-hover align-middle mb-0"><thead><tr><th>Delivery</th><th>Customer</th><th>Product</th><th>Delivery Date</th><th>Status</th><th>Order</th></tr></thead><tbody>
          {subscriptionDeliveries.map(d => {
            const order = orders.find(o => o.id === d.orderId);
            return <tr key={d.id}><td><strong>#{d.deliveryNumber}</strong><div className="small text-muted">{d.subscriptionId.slice(0, 8)}</div></td><td><strong>{d.customerName || d.customerMobile || d.customerId}</strong><div className="small text-muted">{d.customerMobile || "—"}</div></td><td>{d.productName}</td><td>{d.deliveryDate || "—"}</td><td><span className={`badge text-bg-${d.status === "delivered" ? "success" : d.status === "failed" ? "danger" : d.status === "cancelled" ? "secondary" : "info"}`}>{d.status.replaceAll("_", " ")}</span></td><td>{order?.orderNumber || d.orderNumber || d.orderId}</td></tr>;
          })}
          {!subscriptionDeliveries.length && !loading && <tr><td colSpan={6} className="text-center text-muted py-5"><i className="bi bi-arrow-repeat fs-2 d-block mb-2" />No subscription delivery records available.</td></tr>}
          {loading && <tr><td colSpan={6} className="text-center py-5"><span className="spinner-border spinner-border-sm me-2" />Loading subscription deliveries...</td></tr>}
        </tbody></table></div>
      </div>}

      {tab === "users" && (selectedUser || creatingUser ? <div className="card"><div className="card-header"><h3 className="card-title mb-0">{selectedUser ? "Edit Delivery User" : "Add Delivery User"}</h3></div><DeliveryUserForm user={selectedUser} onSubmit={saveDeliveryUser} onCancel={() => { setSelectedUser(null); setCreatingUser(false); }} /></div> : <div className="card">
        <div className="card-header"><div className="row g-2 align-items-center"><div className="col-md-8"><div className="input-group"><span className="input-group-text"><i className="bi bi-search" /></span><input className="form-control" placeholder="Search delivery users..." value={search} onChange={e => setSearch(e.target.value)} /></div></div><div className="col-md-4 text-md-end text-muted small align-self-center">{filteredUsers.length} of {users.length} users</div></div></div>
        <div className="table-responsive"><table className="table table-hover align-middle mb-0"><thead><tr><th>Delivery User</th><th>Mobile</th><th>Email</th><th>Vehicle</th><th>Status</th><th className="text-end">Actions</th></tr></thead><tbody>{filteredUsers.map(u => <tr key={u.id}><td><strong>{userName(u)}</strong></td><td>{u.mobileNumber || "—"}</td><td>{u.email || "—"}</td><td>{[u.vehicleType, u.vehicleNumber].filter(Boolean).join(" / ") || "—"}</td><td><span className={`badge text-bg-${u.status === "active" ? "success" : "secondary"}`}>{u.status}</span></td><td className="text-end text-nowrap"><button className="btn btn-sm btn-outline-primary me-1" onClick={() => openEdit(u)}><i className="bi bi-pencil me-1" />Edit</button><button className="btn btn-sm btn-outline-secondary" onClick={() => void toggleUser(u)}>{u.status === "active" ? "Deactivate" : "Activate"}</button></td></tr>)}{!filteredUsers.length && !loading && <tr><td colSpan={6} className="text-center text-muted py-5">No delivery users found.</td></tr>}</tbody></table></div>
      </div>)}
    </div>
  </AdminPage>;
}

function DeliveryUserForm({ user, onSubmit, onCancel }: { user: DeliveryUser | null; onSubmit: (e: React.FormEvent<HTMLFormElement>) => void; onCancel: () => void }) {
  return <form onSubmit={onSubmit}><div className="card-body"><div className="row g-4"><div className="col-lg-7"><div className="card border"><div className="card-header"><strong>Personal Information</strong></div><div className="card-body"><div className="row"><div className="col-md-6 mb-3"><label className="form-label">Name *</label><input name="name" className="form-control" defaultValue={user?.name || ""} required /></div><div className="col-md-6 mb-3"><label className="form-label">Mobile *</label><input name="mobileNumber" className="form-control" defaultValue={user?.mobileNumber || ""} required /></div></div><div><label className="form-label">Email</label><input name="email" type="email" className="form-control" defaultValue={user?.email || ""} /></div></div></div><div className="card border mt-3"><div className="card-header"><strong>Vehicle</strong></div><div className="card-body"><div className="row"><div className="col-md-6"><label className="form-label">Vehicle type</label><input name="vehicleType" className="form-control" placeholder="Bike" defaultValue={user?.vehicleType || ""} /></div><div className="col-md-6"><label className="form-label">Vehicle number</label><input name="vehicleNumber" className="form-control" defaultValue={user?.vehicleNumber || ""} /></div></div></div></div></div><div className="col-lg-5"><div className="card border"><div className="card-header"><strong>Authentication</strong></div><div className="card-body"><label className="form-label">Firebase Auth UID *</label><input name="authUid" className="form-control font-monospace" defaultValue={user?.authUid || ""} required /><div className="form-text">Use the UID of the Firebase Authentication account linked to this delivery user.</div></div></div></div></div></div><div className="card-footer d-flex justify-content-end gap-2"><button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button><button className="btn btn-success">{user ? "Update Delivery User" : "Create Delivery User"}</button></div></form>;
}
