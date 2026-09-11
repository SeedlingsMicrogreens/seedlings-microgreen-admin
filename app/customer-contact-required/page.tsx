"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminPage } from "@/components/admin/AdminPage";
import { listCollection } from "@/lib/firestore";
import type { Order } from "@/types/order";
import type { Customer } from "@/types/customer";
import { formatOrderStatus } from "@/types/order";
import { formatAddressLines } from "@/lib/address";

type ContactOrder = Order & {
  requiresCustomerContact?: boolean;
  availabilityRequestedGrams?: number;
  availabilityAvailableGrams?: number;
  availabilityShortageGrams?: number;
  carryForwardQuantityGrams?: number;
  availabilityDecision?: string;
  deliveryDate?: string;
  subscriptionNumber?: string;
  subscriptionPlanName?: string;
};

function money(value: number) { return `₹${Number(value || 0).toFixed(2)}`; }

function dateValue(value: unknown) {
  if (!value) return "—";
  if (typeof value === "object" && value && "toDate" in value && typeof (value as any).toDate === "function") {
    return (value as any).toDate().toLocaleString();
  }
  const date = new Date(value as any);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function dateOnly(value?: string) {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

function contactReason(order: ContactOrder) {
  const shortage = Number(order.availabilityShortageGrams ?? 0);
  return shortage > 0 ? `Quantity shortage · ${shortage.toLocaleString()} gms` : "Customer requested contact";
}

export default function CustomerContactRequiredPage() {
  const [orders, setOrders] = useState<ContactOrder[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selected, setSelected] = useState<ContactOrder | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    try {
      const [orderData, customerData] = await Promise.all([
        listCollection<Order>("orders", "createdAt"),
        listCollection<Customer>("customers", "updatedAt"),
      ]);
      setOrders(orderData.filter((order) => (order as ContactOrder).requiresCustomerContact === true) as ContactOrder[]);
      setCustomers(customerData);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load customer-contact cases.");
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  const customerMap = useMemo(() => new Map(customers.map((customer) => [customer.id, customer])), [customers]);
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return orders;
    return orders.filter((order) => {
      const customer = customerMap.get(order.customerId);
      return [order.orderNumber, order.id, order.customerName, order.customerMobile, order.subscriptionNumber, order.subscriptionPlanName, customer?.name, customer?.mobileNumber]
        .filter(Boolean).join(" ").toLowerCase().includes(term);
    });
  }, [orders, customerMap, search]);

  return <AdminPage>
    <div className="container-fluid py-3">
      <div className="d-flex flex-wrap justify-content-between align-items-end gap-3 mb-3">
        <div>
          <h1 className="h3 seedlings-brand mb-1">Customer Contact Required</h1>
          <p className="text-muted mb-0">Orders where the customer asked to be contacted or delivery quantity needs manual confirmation.</p>
        </div>
        <div className="d-flex align-items-center gap-2">
          <span className="badge text-bg-warning fs-6">{orders.length} pending</span>
          <button className="btn btn-outline-secondary" onClick={() => void load()} title="Refresh"><i className="bi bi-arrow-clockwise" /></button>
        </div>
      </div>

      {error && <div className="alert alert-danger"><i className="bi bi-exclamation-triangle me-2" />{error}</div>}

      <div className="card">
        <div className="card-header">
          <div className="row g-2 align-items-center">
            <div className="col-md-7"><input className="form-control" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search customer, mobile, order or subscription..." /></div>
            <div className="col-md-5 text-md-end small text-muted">Showing {filtered.length} of {orders.length} contact cases</div>
          </div>
        </div>
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0">
            <thead><tr><th>Order</th><th>Customer</th><th>Type</th><th>Delivery</th><th>Issue</th><th>Status</th><th className="text-end">Action</th></tr></thead>
            <tbody>
              {filtered.map((order) => {
                const customer = customerMap.get(order.customerId);
                return <tr key={order.id}>
                  <td><strong>{order.orderNumber || order.id.slice(0, 8)}</strong><div className="small text-muted">{dateValue(order.createdAt)}</div></td>
                  <td><strong>{order.customerName || customer?.name || "Unnamed customer"}</strong><div className="small text-muted">{order.customerMobile || customer?.mobileNumber || "—"}</div></td>
                  <td>{order.orderType === "subscription" ? <><span className="badge text-bg-primary">Subscription</span><div className="small text-muted">{order.subscriptionPlanName || "—"}</div></> : <span className="badge text-bg-light">One-time</span>}</td>
                  <td>{dateOnly(order.scheduledDeliveryDate || order.deliveryDate)}</td>
                  <td><span className="text-warning-emphasis"><i className="bi bi-exclamation-circle me-1" />{contactReason(order)}</span></td>
                  <td><span className="badge text-bg-warning">Pending Contact</span></td>
                  <td className="text-end"><button className="btn btn-sm btn-outline-primary" onClick={() => setSelected(order)}>View</button></td>
                </tr>;
              })}
              {!filtered.length && !loading && <tr><td colSpan={7} className="text-center text-muted py-5"><i className="bi bi-check2-circle fs-2 d-block mb-2" />No customer-contact cases found.</td></tr>}
              {loading && <tr><td colSpan={7} className="text-center py-5"><span className="spinner-border spinner-border-sm me-2" />Loading customer-contact cases...</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {selected && <ContactCaseDetails order={selected} customer={customerMap.get(selected.customerId)} onClose={() => setSelected(null)} />}
    </div>
  </AdminPage>;
}

function ContactCaseDetails({ order, customer, onClose }: { order: ContactOrder; customer?: Customer; onClose: () => void }) {
  const requested = Number(order.availabilityRequestedGrams ?? 0);
  const available = Number(order.availabilityAvailableGrams ?? 0);
  const shortage = Number(order.availabilityShortageGrams ?? 0);
  const address = order.deliveryAddress || customer?.addresses?.[0];

  return <div className="modal d-block" tabIndex={-1} role="dialog" aria-modal="true" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable"><div className="modal-content">
      <div className="modal-header"><div><h2 className="modal-title h5 mb-1">{order.orderNumber || order.id}</h2><div className="small text-muted">Customer Contact Required</div></div><button className="btn-close" aria-label="Close" onClick={onClose} /></div>
      <div className="modal-body">
        <div className="alert alert-warning d-flex gap-2 align-items-start"><i className="bi bi-exclamation-triangle-fill mt-1" /><div><strong>Customer contact is required.</strong><div className="small">{contactReason(order)}. Please contact the customer before fulfilment and confirm how to proceed.</div></div></div>
        <div className="row g-3">
          <div className="col-md-6"><div className="border rounded p-3 h-100"><h3 className="h6">Customer</h3><dl className="row mb-0 small"><dt className="col-5">Name</dt><dd className="col-7">{order.customerName || customer?.name || "Unnamed"}</dd><dt className="col-5">Mobile</dt><dd className="col-7">{order.customerMobile || customer?.mobileNumber || "—"}</dd><dt className="col-5">Email</dt><dd className="col-7 text-break">{customer?.email || "—"}</dd></dl></div></div>
          <div className="col-md-6"><div className="border rounded p-3 h-100"><h3 className="h6">Order</h3><dl className="row mb-0 small"><dt className="col-5">Type</dt><dd className="col-7">{order.orderType === "subscription" ? "Subscription" : "One-time"}</dd><dt className="col-5">Order date</dt><dd className="col-7">{dateValue(order.createdAt)}</dd><dt className="col-5">Delivery date</dt><dd className="col-7">{dateOnly(order.scheduledDeliveryDate || order.deliveryDate)}</dd><dt className="col-5">Total</dt><dd className="col-7"><strong>{money(order.total)}</strong></dd><dt className="col-5">Status</dt><dd className="col-7"><span className="badge text-bg-light">{formatOrderStatus(order.status)}</span></dd></dl></div></div>
        </div>
        <div className="border rounded p-3 mt-3"><h3 className="h6">Quantity / Availability</h3>{requested || available || shortage ? <div className="row g-3 small"><div className="col-sm-4"><span className="text-muted d-block">Requested</span><strong>{requested.toLocaleString()} gms</strong></div><div className="col-sm-4"><span className="text-muted d-block">Available</span><strong>{available.toLocaleString()} gms</strong></div><div className="col-sm-4"><span className="text-muted d-block">Shortage</span><strong className="text-danger">{shortage.toLocaleString()} gms</strong></div>{order.orderType === "subscription" && <div className="col-sm-6"><span className="text-muted d-block">Carry forward</span><strong>{Number(order.carryForwardQuantityGrams ?? 0).toLocaleString()} gms</strong></div>}<div className="col-sm-6"><span className="text-muted d-block">Customer decision</span><strong>{order.availabilityDecision === "contact" ? "Contact me" : order.availabilityDecision || "—"}</strong></div></div> : <div className="text-muted small">No availability snapshot was stored on this order.</div>}</div>
        <div className="border rounded p-3 mt-3"><h3 className="h6">Delivery Address</h3><div className="small">{address ? formatAddressLines(address as any).map((line, index) => <div key={index}>{line}</div>) : <span className="text-muted">No delivery address stored.</span>}</div></div>
        <div className="border rounded p-3 mt-3"><h3 className="h6">Items</h3><div className="table-responsive"><table className="table table-sm mb-0"><thead><tr><th>Product</th><th>Qty</th><th>Price</th><th className="text-end">Total</th></tr></thead><tbody>{order.items.map((item, index) => <tr key={index}><td>{item.productName}</td><td>{item.quantity}</td><td>{money(item.unitPrice)}</td><td className="text-end">{money(item.lineTotal)}</td></tr>)}</tbody></table></div></div>
      </div>
      <div className="modal-footer"><button className="btn btn-secondary" onClick={onClose}>Close</button></div>
    </div></div>
  </div>;
}
