"use client";

import { useEffect, useState } from "react";
import { AdminPage } from "@/components/admin/AdminPage";
import { confirmAction, showSuccess } from "@/lib/alerts";
import { deleteRecord, listCollection, setRecord } from "@/lib/firestore";
import type { Packaging } from "@/types/packaging";
import { packagingDisplay } from "@/types/packaging";

const COLLECTION = "packagingMaster";

type PackagingRecord = Packaging & { id: string };

export default function PackagingMastersPage() {
  const [packaging, setPackaging] = useState<PackagingRecord[]>([]);
  const [size, setSize] = useState("");
  const [editingSize, setEditingSize] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    try {
      const records = await listCollection<Packaging>(COLLECTION, "size");
      setPackaging([...records].sort((a, b) => Number(a.size) - Number(b.size)));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load packaging master.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function openCreate() {
    setEditingSize(null);
    setSize("");
    setShowForm(true);
    setError("");
  }

  function openEdit(item: PackagingRecord) {
    setEditingSize(Number(item.size));
    setSize(String(item.size));
    setShowForm(true);
    setError("");
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = Number(size);
    if (!Number.isInteger(value) || value <= 0) {
      setError("Size must be a positive whole number in grams.");
      return;
    }

    const duplicate = packaging.some(item => Number(item.size) === value && Number(item.size) !== editingSize);
    if (duplicate) {
      setError("This packaging size already exists.");
      return;
    }

    setSaving(true);
    try {
      // Packaging size is intentionally the Firestore document ID.
      // Editing a size therefore creates the new size document and removes the old one.
      const data = { size: value, active: true };
      await setRecord(COLLECTION, String(value), data, true);
      if (editingSize !== null && editingSize !== value) {
        await deleteRecord(COLLECTION, String(editingSize));
      }
      setShowForm(false);
      setEditingSize(null);
      setSize("");
      await load();
      showSuccess(editingSize === null ? "Packaging size created" : "Packaging size updated");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save packaging size.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(item: PackagingRecord) {
    if (!(await confirmAction({
      title: `Delete ${packagingDisplay(Number(item.size))}?`,
      text: "This action cannot be undone. The packaging size will be permanently deleted.",
      confirmText: "Yes, delete",
    }))) return;

    try {
      await deleteRecord(COLLECTION, String(item.size));
      await load();
      await showSuccess("Packaging size deleted");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to delete packaging size.");
    }
  }

  return (
    <AdminPage>
      <div className="container-fluid py-3">
        <div className="d-flex flex-wrap justify-content-between align-items-end gap-3 mb-3">
          <div>
            <h1 className="h3 seedlings-brand mb-1">Packaging Master</h1>
            <p className="text-muted mb-0">Manage packaging sizes in grams used across products and subscriptions.</p>
          </div>
          <div className="d-flex gap-2">
            <button className="btn btn-outline-secondary" onClick={() => void load()} disabled={loading} title="Refresh">
              <i className="bi bi-arrow-clockwise" />
            </button>
            <button className="btn btn-success" onClick={openCreate}>
              <i className="bi bi-plus-lg me-1" /> Add Packaging
            </button>
          </div>
        </div>

        {error && <div className="alert alert-danger">{error}</div>}

        {showForm && (
          <div className="card border-success mb-3">
            <div className="card-header"><strong>{editingSize !== null ? "Edit Packaging" : "Add Packaging"}</strong></div>
            <form onSubmit={save}>
              <div className="card-body">
                <div className="row g-3">
                  <div className="col-md-6">
                    <label className="form-label">Size (gms) *</label>
                    <div className="input-group">
                      <input
                        className="form-control"
                        type="number"
                        min="1"
                        step="1"
                        value={size}
                        onChange={e => setSize(e.target.value)}
                        placeholder="e.g. 100, 500, 1000"
                        required
                      />
                      <span className="input-group-text">gms</span>
                    </div>
                    <div className="form-text">Display: {size && Number.isInteger(Number(size)) && Number(size) > 0 ? packagingDisplay(Number(size)) : "—"}</div>
                  </div>
                </div>
              </div>
              <div className="card-footer d-flex justify-content-end gap-2">
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)} disabled={saving}>Cancel</button>
                <button className="btn btn-success" disabled={saving}>{saving ? "Saving..." : "Save Packaging"}</button>
              </div>
            </form>
          </div>
        )}

        <div className="card">
          <div className="card-header d-flex justify-content-between align-items-center">
            <div>
              <strong>Packaging Master</strong>
              <div className="small text-muted">Firestore document ID is the packaging size in grams.</div>
            </div>
            <span className="badge text-bg-secondary">{packaging.length}</span>
          </div>
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead>
                <tr><th>Size (gms)</th><th>Display</th><th>Status</th><th className="text-end">Actions</th></tr>
              </thead>
              <tbody>
                {packaging.map(item => (
                  <tr key={item.id}>
                    <td><strong>{item.size}</strong></td>
                    <td>{packagingDisplay(Number(item.size))}</td>
                    <td><span className={`badge text-bg-${item.active !== false ? "success" : "secondary"}`}>{item.active !== false ? "Active" : "Inactive"}</span></td>
                    <td className="text-end">
                      <button className="btn btn-sm btn-outline-primary me-1" onClick={() => openEdit(item)}>Edit</button>
                      <button className="btn btn-sm btn-outline-danger" onClick={() => void remove(item)}>Delete</button>
                    </td>
                  </tr>
                ))}
                {!packaging.length && !loading && <tr><td colSpan={4} className="text-center text-muted py-5">No packaging sizes defined.</td></tr>}
                {loading && <tr><td colSpan={4} className="text-center py-5"><span className="spinner-border spinner-border-sm me-2" />Loading...</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminPage>
  );
}
