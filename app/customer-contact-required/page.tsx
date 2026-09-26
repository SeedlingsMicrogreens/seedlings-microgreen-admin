"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminPage } from "@/components/admin/AdminPage";
import { listCollection } from "@/lib/firestore";

type Enquiry = {
  id: string;
  name?: string;
  mobile?: string;
  email?: string;
  customerId?: string;
  productName?: string;
  message?: string;
  source?: "customer_checkout" | "contact_page";
  status?: "open" | "closed";
  createdAt?: unknown;
  updatedAt?: unknown;
};

function dateValue(value: unknown) {
  if (!value) return "—";
  if (typeof value === "object" && value && "toDate" in value && typeof (value as any).toDate === "function") {
    return (value as any).toDate().toLocaleString();
  }
  const date = new Date(value as any);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

export default function CustomerContactRequiredPage() {
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [selected, setSelected] = useState<Enquiry | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    try {
      const data = await listCollection<Enquiry>("enquiries", "createdAt");
      setEnquiries(data.filter((item) => item.status !== "closed"));
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load enquiries.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return enquiries;
    return enquiries.filter((enquiry) => [
      enquiry.id,
      enquiry.name,
      enquiry.mobile,
      enquiry.email,
      enquiry.customerId,
      enquiry.productName,
      enquiry.message,
      enquiry.source,
    ].filter(Boolean).join(" ").toLowerCase().includes(term));
  }, [enquiries, search]);

  return <AdminPage>
    <div className="container-fluid py-3">
      <div className="d-flex flex-wrap justify-content-between align-items-end gap-3 mb-3">
        <div>
          <h1 className="h3 seedlings-brand mb-1">Enquiries</h1>
          <p className="text-muted mb-0">Customer enquiries and availability requests. Enquiries are maintained separately from orders.</p>
        </div>
        <div className="d-flex align-items-center gap-2">
          <span className="badge text-bg-warning fs-6">{enquiries.length} open</span>
          <button className="btn btn-outline-secondary" onClick={() => void load()} title="Refresh"><i className="bi bi-arrow-clockwise" /></button>
        </div>
      </div>

      {error && <div className="alert alert-danger"><i className="bi bi-exclamation-triangle me-2" />{error}</div>}

      <div className="card">
        <div className="card-header">
          <div className="row g-2 align-items-center">
            <div className="col-md-7"><input className="form-control" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, mobile, email or product..." /></div>
            <div className="col-md-5 text-md-end small text-muted">Showing {filtered.length} of {enquiries.length} open enquiries</div>
          </div>
        </div>
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0">
            <thead>
              <tr>
                <th>Name</th>
                <th>Mobile / Email</th>
                <th>Product</th>
                <th>Source</th>
                <th>Created</th>
                <th className="text-end">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((enquiry) => <tr key={enquiry.id}>
                <td><strong>{enquiry.name || "Unnamed"}</strong>{enquiry.customerId && <div className="small text-muted">Customer ID: {enquiry.customerId}</div>}</td>
                <td><div>{enquiry.mobile || "—"}</div><div className="small text-muted text-break">{enquiry.email || "—"}</div></td>
                <td>{enquiry.productName || "—"}</td>
                <td>{enquiry.source === "customer_checkout" ? <span className="badge text-bg-warning">Shortage</span> : <span className="badge text-bg-light">Contact</span>}</td>
                <td>{dateValue(enquiry.createdAt)}</td>
                <td className="text-end"><button className="btn btn-sm btn-outline-primary" onClick={() => setSelected(enquiry)}>View</button></td>
              </tr>)}
              {!filtered.length && !loading && <tr><td colSpan={6} className="text-center text-muted py-5"><i className="bi bi-check2-circle fs-2 d-block mb-2" />No open enquiries found.</td></tr>}
              {loading && <tr><td colSpan={6} className="text-center py-5"><span className="spinner-border spinner-border-sm me-2" />Loading enquiries...</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {selected && <EnquiryDetails enquiry={selected} onClose={() => setSelected(null)} />}
    </div>
  </AdminPage>;
}

function EnquiryDetails({ enquiry, onClose }: { enquiry: Enquiry; onClose: () => void }) {
  return <div className="modal d-block" tabIndex={-1} role="dialog" aria-modal="true" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable"><div className="modal-content">
      <div className="modal-header"><div><h2 className="modal-title h5 mb-1">Enquiry</h2><div className="small text-muted">{enquiry.source === "customer_checkout" ? "Availability shortage" : "Contact page"}</div></div><button className="btn-close" aria-label="Close" onClick={onClose} /></div>
      <div className="modal-body">
        <div className="row g-3">
          <div className="col-md-6"><div className="border rounded p-3 h-100"><h3 className="h6">Customer</h3><dl className="row mb-0 small"><dt className="col-5">Name</dt><dd className="col-7">{enquiry.name || "—"}</dd><dt className="col-5">Mobile</dt><dd className="col-7">{enquiry.mobile || "—"}</dd><dt className="col-5">Email</dt><dd className="col-7 text-break">{enquiry.email || "—"}</dd><dt className="col-5">Customer ID</dt><dd className="col-7 text-break">{enquiry.customerId || "—"}</dd></dl></div></div>
          <div className="col-md-6"><div className="border rounded p-3 h-100"><h3 className="h6">Enquiry</h3><dl className="row mb-0 small"><dt className="col-5">Product</dt><dd className="col-7">{enquiry.productName || "—"}</dd><dt className="col-5">Source</dt><dd className="col-7">{enquiry.source === "customer_checkout" ? "Shortage" : "Contact page"}</dd><dt className="col-5">Status</dt><dd className="col-7"><span className="badge text-bg-warning">{enquiry.status || "open"}</span></dd><dt className="col-5">Created</dt><dd className="col-7">{dateValue(enquiry.createdAt)}</dd></dl></div></div>
        </div>
        <div className="border rounded p-3 mt-3"><h3 className="h6">Message</h3><p className="mb-0" style={{ whiteSpace: "pre-wrap" }}>{enquiry.message || "—"}</p></div>
      </div>
      <div className="modal-footer"><button className="btn btn-secondary" onClick={onClose}>Close</button></div>
    </div></div>
  </div>;
}
