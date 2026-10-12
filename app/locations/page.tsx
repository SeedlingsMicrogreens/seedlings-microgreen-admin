"use client";

import { useEffect, useState } from "react";
import { AdminPage } from "@/components/admin/AdminPage";
import { createRecord, deleteRecord, listCollection, updateRecord } from "@/lib/firestore";
import { buildLocationRecordData, formatLocationThreshold, locationThresholdFormValues, type LocationFormData } from "@/lib/locationThreshold";
import type { Location, LocationThresholdUnit, LocationType } from "@/types/location";
import { confirmAction, showError, showSuccess } from "@/lib/alerts";

const empty: LocationFormData = {
  name: "",
  type: "rack",
  active: true,
  notes: "",
  thresholdValue: "",
  thresholdUnit: "gms",
};

export default function LocationsPage() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [form, setForm] = useState<LocationFormData>(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      setLocations(await listCollection<Location>("locations"));
      setError("");
    } catch {
      setError("Unable to load locations. Check Firestore rules/indexes.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  function openCreate() {
    setEditing(null);
    setForm(empty);
    setShowForm(true);
    setError("");
  }

  function openEdit(location: Location) {
    setEditing(location.id);
    setForm({
      name: location.name,
      type: location.type,
      active: location.active,
      notes: location.notes ?? "",
      ...locationThresholdFormValues(location),
    });
    setShowForm(true);
    setError("");
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    let data: ReturnType<typeof buildLocationRecordData>;
    try {
      data = buildLocationRecordData(form);
    } catch (validationError) {
      await showError(validationError, "Unable to validate rack location.");
      return;
    }

    try {
      if (editing) await updateRecord("locations", editing, data);
      else await createRecord("locations", data);
      setShowForm(false);
      setEditing(null);
      await load();
      await showSuccess(editing ? "Rack location updated" : "Rack location created");
    } catch (saveError) {
      await showError(saveError, "Unable to save rack location.");
    }
  }

  async function remove(id: string) {
    if (!(await confirmAction({
      title: "Delete this rack location?",
      text: "This action cannot be undone. The rack location will be permanently deleted.",
      confirmText: "Yes, delete",
    }))) return;
    try {
      await deleteRecord("locations", id);
      await load();
      await showSuccess("Rack location deleted");
    } catch {
      setError("Unable to delete rack location.");
    }
  }

  return <AdminPage><div className="container-fluid py-3">
    <div className="d-flex justify-content-between align-items-start mb-3">
      <div>
        <h1 className="h3 seedlings-brand mb-1">Rack Locations</h1>
        <p className="text-muted mb-0">Master list used when assigning growing batches to a rack, room or growing area.</p>
      </div>
      <button className="btn btn-success" onClick={openCreate}><i className="bi bi-plus-lg me-1" />Add Rack Location</button>
    </div>
    {error && <div className="alert alert-danger">{error}</div>}
    {showForm && <div className="card border-success mb-3">
      <div className="card-header"><strong>{editing ? "Edit Rack Location" : "Add Rack Location"}</strong></div>
      <form onSubmit={save} noValidate>
        <div className="card-body">
          <div className="row g-3">
            <div className="col-md-4">
              <label className="form-label">Rack location name *</label>
              <input className="form-control" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="e.g. Rack A" required />
            </div>
            <div className="col-md-3">
              <label className="form-label">Type</label>
              <select className="form-select" value={form.type} onChange={event => setForm({ ...form, type: event.target.value as LocationType })}>
                <option value="rack">Rack</option><option value="room">Room</option><option value="tray_area">Tray area</option><option value="storage">Storage</option><option value="other">Other</option>
              </select>
            </div>
            <div className="col-md-3">
              <label className="form-label">Threshold *</label>
              <input className="form-control" type="number" min="0" step="any" value={form.thresholdValue} onChange={event => setForm({ ...form, thresholdValue: event.target.value })} required />
            </div>
            <div className="col-md-2">
              <label className="form-label">Unit *</label>
              <select className="form-select" value={form.thresholdUnit} onChange={event => setForm({ ...form, thresholdUnit: event.target.value as LocationThresholdUnit | "" })} required>
                <option value="" disabled>Select unit</option>
                <option value="gms">gms</option><option value="kg">kg</option>
              </select>
            </div>
            <div className="col-md-8">
              <label className="form-label">Notes</label>
              <input className="form-control" value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} />
            </div>
            <div className="col-md-4 d-flex align-items-end">
              <div className="form-check mb-2">
                <input className="form-check-input" type="checkbox" id="loc-active" checked={form.active} onChange={event => setForm({ ...form, active: event.target.checked })} />
                <label className="form-check-label" htmlFor="loc-active">Active</label>
              </div>
            </div>
          </div>
        </div>
        <div className="card-footer d-flex justify-content-end gap-2">
          <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
          <button className="btn btn-success">{editing ? "Update Rack Location" : "Create Rack Location"}</button>
        </div>
      </form>
    </div>}
    <div className="card">
      <div className="card-header"><strong>Rack Locations Master</strong></div>
      <div className="table-responsive"><table className="table table-hover align-middle mb-0">
        <thead><tr><th>Location</th><th>Type</th><th>Threshold</th><th>Status</th><th>Notes</th><th className="text-end">Actions</th></tr></thead>
        <tbody>
          {locations.map(location => <tr key={location.id}>
            <td><strong>{location.name}</strong></td>
            <td className="text-capitalize">{location.type.replace("_", " ")}</td>
            <td>{formatLocationThreshold(location.thresholdValue, location.thresholdUnit)}</td>
            <td><span className={`badge text-bg-${location.active ? "success" : "secondary"}`}>{location.active ? "Active" : "Inactive"}</span></td>
            <td>{location.notes || "—"}</td>
            <td className="text-end">
              <button className="btn btn-sm btn-outline-primary me-1" onClick={() => openEdit(location)}>Edit</button>
              <button className="btn btn-sm btn-outline-danger" onClick={() => void remove(location.id)}>Delete</button>
            </td>
          </tr>)}
          {!locations.length && !loading && <tr><td colSpan={6} className="text-center text-muted py-5">No rack locations yet.</td></tr>}
          {loading && <tr><td colSpan={6} className="text-center py-5"><span className="spinner-border spinner-border-sm me-2" />Loading...</td></tr>}
        </tbody>
      </table></div>
    </div>
  </div></AdminPage>;
}
