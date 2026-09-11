"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminPage } from "@/components/admin/AdminPage";
import { listCollection, updateRecord } from "@/lib/firestore";
import type { Customer, CustomerStatus } from "@/types/customer";
import { formatAddress } from "@/lib/address";
import {confirmAction} from "@/lib/alerts";

function customerName(customer: Customer) {
  return customer.name?.trim() || "Unnamed customer";
}
function customerPhone(customer: Customer) {
  return customer.mobileNumber || customer.phone || "—";
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Customer | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      setCustomers(await listCollection<Customer>("customers"));
      setError("");
    } catch {
      setError("Unable to load customers. Check the customers collection and Firestore rules.");
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return customers;
    return customers.filter(c =>
      [customerName(c), customerPhone(c), c.email, c.id].filter(Boolean).join(" ").toLowerCase().includes(term)
    );
  }, [customers, search]);

  async function changeStatus(customer: Customer, status: CustomerStatus) {
    const action = status === "blocked" ? "block" : "activate";
    if (!(await confirmAction({title:`${action === "block" ? "Block" : "Activate"} ${customerName(customer)}?`,text:`This will ${action} this customer account.`,confirmText:action === "block" ? "Yes, block" : "Yes, activate"}))) return;
    try {
      await updateRecord("customers", customer.id, { status });
      const updated = { ...customer, status };
      setCustomers(prev => prev.map(c => c.id === customer.id ? updated : c));
      setSelected(updated);
    } catch {
      setError("Unable to update customer status.");
    }
  }

  return (
    <AdminPage>
      <div className="container-fluid py-3">
        <div className="d-flex flex-wrap justify-content-between align-items-end gap-3 mb-3">
          <div>
            <h1 className="h3 seedlings-brand mb-1">Customers</h1>
            <p className="text-muted mb-0">Manage customer accounts, contact information and account status.</p>
          </div>
          <div className="input-group" style={{ maxWidth: 380 }}>
            <span className="input-group-text"><i className="bi bi-search" /></span>
            <input className="form-control" placeholder="Search name, mobile or email..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>

        {error && <div className="alert alert-danger">{error}</div>}

        <div className="card">
          <div className="card-header d-flex justify-content-between align-items-center">
            <h3 className="card-title mb-0">Customer Accounts</h3>
            <span className="text-muted small">{filtered.length} of {customers.length} customers</span>
          </div>
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead>
                <tr>
                  <th>Customer</th><th>Mobile</th><th>Email</th><th>Addresses</th><th>Status</th><th className="text-end">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(customer => (
                  <tr key={customer.id}>
                    <td>
                      <strong>{customerName(customer)}</strong>
                      <div className="small text-muted">{customer.id}</div>
                    </td>
                    <td>{customerPhone(customer)}</td>
                    <td>{customer.email || "—"}</td>
                    <td>{customer.addresses?.length ?? 0}</td>
                    <td>
                      <span className={`badge text-bg-${customer.status === "blocked" ? "danger" : "success"}`}>
                        {customer.status || "active"}
                      </span>
                    </td>
                    <td className="text-end">
                      <button className="btn btn-sm btn-outline-primary" onClick={() => setSelected(customer)}>
                        <i className="bi bi-eye me-1" /> View
                      </button>
                    </td>
                  </tr>
                ))}
                {!loading && filtered.length === 0 && (
                  <tr><td colSpan={6} className="text-center text-muted py-5">
                    <i className="bi bi-people fs-2 d-block mb-2" />
                    {customers.length ? "No customers match your search." : "No customer accounts yet."}
                  </td></tr>
                )}
                {loading && <tr><td colSpan={6} className="text-center py-5"><span className="spinner-border spinner-border-sm me-2" />Loading customers...</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        {selected && (
          <div className="modal d-block" tabIndex={-1} role="dialog" aria-modal="true" onMouseDown={e => { if (e.target === e.currentTarget) setSelected(null); }}>
            <div className="modal-dialog modal-lg modal-dialog-centered">
              <div className="modal-content">
                <div className="modal-header">
                  <div>
                    <h2 className="modal-title h5 mb-1">{customerName(selected)}</h2>
                    <div className="small text-muted">{customerPhone(selected)}{selected.email ? ` • ${selected.email}` : ""}</div>
                  </div>
                  <button className="btn-close" aria-label="Close" onClick={() => setSelected(null)} />
                </div>
                <div className="modal-body">
                  <div className="row g-3">
                    <div className="col-md-6">
                      <div className="border rounded p-3 h-100">
                        <h3 className="h6">Account</h3>
                        <dl className="row mb-0">
                          <dt className="col-5">Name</dt><dd className="col-7">{customerName(selected)}</dd>
                          <dt className="col-5">Mobile</dt><dd className="col-7">{customerPhone(selected)}</dd>
                          <dt className="col-5">Email</dt><dd className="col-7 text-break">{selected.email || "—"}</dd>
                          <dt className="col-5">Status</dt><dd className="col-7"><span className={`badge text-bg-${selected.status === "blocked" ? "danger" : "success"}`}>{selected.status || "active"}</span></dd>
                        </dl>
                      </div>
                    </div>
                    <div className="col-md-6">
                      <div className="border rounded p-3 h-100">
                        <h3 className="h6">Addresses</h3>
                        {selected.addresses?.length ? (
                          <div className="small">{selected.addresses.map((address, i) => <div className="border-bottom py-2" key={i}>{formatAddress(address)}</div>)}</div>
                        ) : <div className="text-muted">No saved addresses.</div>}
                      </div>
                    </div>
                  </div>
                  <div className="alert alert-light border mt-3 mb-0 small">
                    Customer ID: <span className="font-monospace">{selected.id}</span>
                  </div>
                </div>
                <div className="modal-footer">
                  {selected.status === "blocked" ? (
                    <button className="btn btn-success" onClick={() => void changeStatus(selected, "active")}>
                      <i className="bi bi-person-check me-1" /> Activate Customer
                    </button>
                  ) : (
                    <button className="btn btn-outline-danger" onClick={() => void changeStatus(selected, "blocked")}>
                      <i className="bi bi-person-x me-1" /> Block Customer
                    </button>
                  )}
                  <button className="btn btn-secondary" onClick={() => setSelected(null)}>Close</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminPage>
  );
}
