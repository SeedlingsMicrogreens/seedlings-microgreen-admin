"use client";
import { useEffect, useState } from "react";
import { AdminPage } from "@/components/admin/AdminPage";
import { createRecord, listCollectionByField, updateRecord } from "@/lib/firestore";
import { showSuccess } from "@/lib/alerts";

const FIXED = [
  ["fresh", "Fresh to order"],
  ["seed", "Non-GMO seeds"],
  ["water", "Less water"],
  ["ordering", "Easy ordering"],
] as const;

type Trust = { id: string; itemKey: string; title: string; text: string; status: "draft" | "published" };

export default function TrustPointsPage() {
  const [items, setItems] = useState<Trust[]>([]);
  const [forms, setForms] = useState<Record<string, Partial<Trust>>>({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState<string | null>(null);

  async function load() {
    try {
      const all: Trust[] = [];
      for (const [key, label] of FIXED) {
        const r = await listCollectionByField<Trust>("websiteTrustPoints", "itemKey", key);
        all.push(r[0] ?? { id: "", itemKey: key, title: label, text: "", status: "published" });
      }
      setItems(all);
      setForms(Object.fromEntries(all.map(x => [x.itemKey, x])));
      setError("");
    } catch {
      setError("Unable to load Trust Points.");
    }
  }

  useEffect(() => { void load(); }, []);

  async function save(key: string) {
    const form = forms[key];
    if (!form) return;
    setSaving(key);
    try {
      const payload = { itemKey: key, title: form.title ?? "", text: form.text ?? "", status: form.status ?? "published" };
      if (form.id) await updateRecord("websiteTrustPoints", form.id, payload);
      else await createRecord("websiteTrustPoints", payload);
      await load();
      await showSuccess("Trust Point saved");
    } catch {
      setError("Unable to save Trust Point.");
    } finally {
      setSaving(null);
    }
  }

  return <AdminPage>
    <div className="container-fluid py-3">
      <h1 className="h3 seedlings-brand">Trust Points</h1>
      <p className="text-muted">Edit the four fixed trust points shown on the Seedlings homepage. You cannot add, delete or reorder them.</p>
      {error && <div className="alert alert-danger">{error}</div>}
      <div className="row">
        {FIXED.map(([key, label]) => {
          const f = forms[key] ?? {};
          return <div className="col-md-6 mb-3" key={key}>
            <div className="card h-100">
              <div className="card-header"><strong>{label}</strong></div>
              <div className="card-body">
                <label className="form-label">Title</label>
                <input className="form-control mb-3" value={String(f.title ?? "")} onChange={e => setForms(x => ({ ...x, [key]: { ...x[key], title: e.target.value } }))} />
                <label className="form-label">Description</label>
                <textarea className="form-control mb-3" rows={3} value={String(f.text ?? "")} onChange={e => setForms(x => ({ ...x, [key]: { ...x[key], text: e.target.value } }))} />
                <label className="form-label">Status</label>
                <select className="form-select" value={String(f.status ?? "published")} onChange={e => setForms(x => ({ ...x, [key]: { ...x[key], status: e.target.value as Trust["status"] } }))}>
                  <option value="draft">Draft</option><option value="published">Published</option>
                </select>
              </div>
              <div className="card-footer"><button className="btn btn-success" disabled={saving === key} onClick={() => void save(key)}>{saving === key ? "Saving…" : "Save"}</button></div>
            </div>
          </div>;
        })}
      </div>
    </div>
  </AdminPage>;
}
