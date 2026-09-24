"use client";

import { useEffect, useState } from "react";
import { AdminPage } from "@/components/admin/AdminPage";
import { confirmAction, showSuccess, showToast } from "@/lib/alerts";
import { createRecord, deleteRecord, listCollection, updateRecord } from "@/lib/firestore";
import type { Geolocation } from "@/types/geolocation";

const emptyForm = { locationName: "", pincode: "", deliveryCharge: 0, active: true };
type GeolocationForm = typeof emptyForm;

function money(value: number) { return `₹${Number(value || 0).toFixed(2)}`; }

export default function GeolocationsPage() {
  const [locations, setLocations] = useState<Geolocation[]>([]);
  const [form, setForm] = useState<GeolocationForm>(emptyForm);
  const [editing, setEditing] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    try { setLocations(await listCollection<Geolocation>("geolocations")); setError(""); }
    catch { setError("Unable to load geolocation master. Check Firestore rules/indexes."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  function openCreate() { setEditing(null); setForm({ ...emptyForm }); setShowForm(true); setError(""); }
  function openEdit(location: Geolocation) {
    setEditing(location.id);
    setForm({
      locationName: location.locationName ?? "",
      pincode: location.pincode ?? "",
      deliveryCharge: Number(location.deliveryCharge ?? 0),
      active: location.active !== false,
    });
    setShowForm(true); setError("");
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const locationName = form.locationName.trim();
    const pincode = form.pincode.trim();
    const deliveryCharge = Number(form.deliveryCharge);
    if (!locationName) return setError("Location name is required.");
    if (!pincode) return setError("Pincode is required.");
    if (!Number.isFinite(deliveryCharge) || deliveryCharge < 0) return setError("Delivery charge must be 0 or more.");
    setSaving(true);
    try {
      const data = { locationName, pincode, deliveryCharge, active: form.active };
      if (editing) { await updateRecord("geolocations", editing, data); showToast("Pincode updated successfully."); }
      else { await createRecord("geolocations", data); showToast("Pincode created successfully."); }
      setShowForm(false); setEditing(null); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save pincode."); }
    finally { setSaving(false); }
  }

  async function remove(location: Geolocation) {
    if (!(await confirmAction({ title: `Delete ${location.locationName || location.pincode}?`, text: "This action cannot be undone. The pincode will be permanently deleted.", confirmText: "Yes, delete" }))) return;
    try { await deleteRecord("geolocations", location.id); await load(); await showSuccess("Pincode deleted"); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to delete pincode."); }
  }

  return <AdminPage><div className="container-fluid py-3">
    <div className="d-flex flex-wrap justify-content-between align-items-end gap-3 mb-3">
      <div><h1 className="h3 seedlings-brand mb-1">Pincode Master</h1><p className="text-muted mb-0">Manage pincode-wise delivery locations and delivery charge.</p></div>
      <div className="d-flex gap-2"><button className="btn btn-outline-secondary" onClick={() => void load()} disabled={loading} title="Refresh"><i className="bi bi-arrow-clockwise" /></button><button className="btn btn-success" onClick={openCreate}><i className="bi bi-plus-lg me-1" /> Add Pincode</button></div>
    </div>
    {error && <div className="alert alert-danger">{error}</div>}

    {showForm && <div className="card border-success mb-3"><div className="card-header"><strong>{editing ? "Edit Pincode" : "Add Pincode"}</strong></div><form onSubmit={save}>
      <div className="card-body"><div className="row g-3">
        <div className="col-md-6"><label className="form-label">Location Name *</label><input className="form-control" value={form.locationName} onChange={e => setForm({ ...form, locationName: e.target.value })} placeholder="e.g. Baner" required /></div>
        <div className="col-md-6"><label className="form-label">Pincode *</label><input className="form-control" value={form.pincode} onChange={e => setForm({ ...form, pincode: e.target.value })} placeholder="e.g. 411041" inputMode="numeric" required /></div>
        <div className="col-md-6"><label className="form-label">Delivery Charge</label><div className="input-group"><span className="input-group-text">₹</span><input className="form-control" type="number" min="0" step="0.01" value={form.deliveryCharge} onChange={e => setForm({ ...form, deliveryCharge: Number(e.target.value) })} /></div></div>
        <div className="col-12"><div className="form-check"><input className="form-check-input" type="checkbox" id="geolocation-active" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} /><label className="form-check-label" htmlFor="geolocation-active">Active</label></div></div>
      </div></div>
      <div className="card-footer d-flex justify-content-end gap-2"><button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)} disabled={saving}>Cancel</button><button className="btn btn-success" disabled={saving}>{saving ? "Saving..." : editing ? "Update Pincode" : "Create Pincode"}</button></div>
    </form></div>}

    <div className="card"><div className="card-header d-flex justify-content-between align-items-center"><div><strong>Pincode Master</strong><div className="small text-muted">Pincode, location name and delivery charge.</div></div><span className="badge text-bg-secondary">{locations.length}</span></div>
      <div className="table-responsive"><table className="table table-hover align-middle mb-0"><thead><tr><th>Location Name</th><th>Pincode</th><th>Delivery Charge</th><th>Status</th><th className="text-end">Actions</th></tr></thead><tbody>
        {locations.map(location => <tr key={location.id}><td><strong>{location.locationName || "—"}</strong></td><td>{location.pincode || "—"}</td><td>{money(location.deliveryCharge)}</td><td><span className={`badge text-bg-${location.active ? "success" : "secondary"}`}>{location.active ? "Active" : "Inactive"}</span></td><td className="text-end text-nowrap"><button className="btn btn-sm btn-outline-primary me-1" onClick={() => openEdit(location)}><i className="bi bi-pencil me-1" /> Edit</button><button className="btn btn-sm btn-outline-danger" onClick={() => void remove(location)}><i className="bi bi-trash me-1" /> Delete</button></td></tr>)}
        {!locations.length && !loading && <tr><td colSpan={5} className="text-center text-muted py-5">No pincodes yet.</td></tr>}
        {loading && <tr><td colSpan={5} className="text-center py-5"><span className="spinner-border spinner-border-sm me-2" />Loading...</td></tr>}
      </tbody></table></div>
    </div>
  </div></AdminPage>;
}
