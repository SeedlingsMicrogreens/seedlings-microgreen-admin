"use client";
import { useEffect, useState } from "react";
import { AdminPage } from "@/components/admin/AdminPage";
import { ImageGalleryUploader } from "@/components/ui/ImageGalleryUploader";
import { createRecord, deleteRecord, listCollection, updateRecord } from "@/lib/firestore";
import { confirmAction, showError, showSuccess } from "@/lib/alerts";
import type { SeedlingsFeedback, SeedlingsFeedbackType } from "@/types/seedlings-feedback";

const empty: Omit<SeedlingsFeedback, "id"> = { type: "text", text: "", imageUrl: "", videoId: "", status: "draft", sortOrder: 1 };

function extractYouTubeId(value: string): string | null {
  const input = value.trim();
  if (!input) return null;
  try {
    const url = new URL(input);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    let id = "";
    if (host === "youtube.com" || host === "m.youtube.com") {
      if (url.pathname.startsWith("/shorts/")) id = url.pathname.split("/")[2] || "";
      else id = url.searchParams.get("v") || "";
    } else if (host === "youtu.be") {
      id = url.pathname.split("/").filter(Boolean)[0] || "";
    }
    return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  } catch { return null; }
}

export default function SeedlingsFeedbackPage() {
  const [items, setItems] = useState<(SeedlingsFeedback & { id: string })[]>([]);
  const [form, setForm] = useState<Omit<SeedlingsFeedback, "id">>(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() { try { setItems(await listCollection<SeedlingsFeedback>("seedlingsFeedback", "sortOrder")); setError(""); } catch { setError("Unable to load Seedlings feedback."); } }
  useEffect(() => { void load(); }, []);
  function reset() { setEditing(null); setForm({ ...empty }); setVideoUrl(""); setError(""); }
  function changeType(type: SeedlingsFeedbackType) { setForm(c => ({ ...c, type, text: type === "text" ? c.text : "", imageUrl: type === "video" ? "" : c.imageUrl, videoId: type === "video" ? c.videoId : "" })); if (type !== "video") setVideoUrl(""); }

  async function save(e: React.FormEvent) {
    e.preventDefault(); setError("");
    if (form.type === "text" && !form.text?.trim()) { setError("Feedback text is required."); return; }
    if (form.type === "image" && !form.imageUrl) { setError("Feedback image is required."); return; }
    const payload = { ...form };
    if (form.type === "video") { const id = extractYouTubeId(videoUrl); if (!id) { setError("Please enter a valid YouTube video URL."); return; } payload.videoId = id; }
    if (form.type !== "text") payload.text = "";
    if (form.type === "video") payload.imageUrl = "";
    setSaving(true);
    try { if (editing) await updateRecord("seedlingsFeedback", editing, payload); else await createRecord("seedlingsFeedback", payload); await load(); await showSuccess(editing ? "Feedback updated" : "Feedback added"); reset(); }
    catch (e) { await showError(e, "Unable to save feedback."); } finally { setSaving(false); }
  }

  function edit(item: SeedlingsFeedback & { id: string }) { setEditing(item.id); setForm({ type: item.type, text: item.text || "", imageUrl: item.imageUrl || "", videoId: item.videoId || "", status: item.status, sortOrder: item.sortOrder || 1 }); setVideoUrl(item.videoId ? `https://www.youtube.com/watch?v=${item.videoId}` : ""); setError(""); }

  return <AdminPage><div className="container-fluid py-3">
    <h1 className="h3 seedlings-brand">Seedlings Feedback</h1>
    <p className="text-muted">Manage Seedlings feedback displayed in the Feedback section of the website Journey page.</p>
    {error && <div className="alert alert-danger">{error}</div>}
    <div className="row">
      <div className="col-xl-4 mb-3"><div className="card"><form onSubmit={save}>
        <div className="card-header"><strong>{editing ? "Edit Feedback" : "Add Feedback"}</strong></div><div className="card-body">
          <label className="form-label">Feedback Type *</label>
          <select className="form-select mb-3" value={form.type} onChange={e => changeType(e.target.value as SeedlingsFeedbackType)}><option value="text">Text + Image (Image optional)</option><option value="image">Image</option><option value="video">YouTube Video</option></select>
          {form.type === "text" && <><label className="form-label">Feedback Text *</label><textarea className="form-control mb-3" rows={5} value={form.text || ""} onChange={e => setForm({ ...form, text: e.target.value })}/><ImageGalleryUploader value={form.imageUrl ? [form.imageUrl] : []} onChange={urls => setForm({ ...form, imageUrl: urls[0] || "" })} label="Image (Optional)" validation={{ aspectRatio: 3 / 2, aspectRatioTolerance: 0.01, minWidth: 900, minHeight: 600, maxBytes: 1024 * 1024, allowedTypes: ["image/png", "image/jpeg"] }} guidance={<><strong>Optional image.</strong> Landscape 3:2. Minimum 900×600 px; recommended 1200×800 px. PNG/JPG/JPEG. Ideal file size: 150–500 KB. Up to ~700 KB recommended; above 1 MB is not accepted. Images are not cropped automatically.</>}/></>}
          {form.type === "image" && <ImageGalleryUploader value={form.imageUrl ? [form.imageUrl] : []} onChange={urls => setForm({ ...form, imageUrl: urls[0] || "" })} label="Feedback Image *" validation={{ aspectRatio: 3 / 2, aspectRatioTolerance: 0.01, minWidth: 900, minHeight: 600, maxBytes: 1024 * 1024, allowedTypes: ["image/png", "image/jpeg"] }} guidance={<><strong>Required image.</strong> Landscape 3:2. Minimum 900×600 px; recommended 1200×800 px. PNG/JPG/JPEG. Ideal file size: 150–500 KB. Up to ~700 KB recommended; above 1 MB is not accepted. Images are not cropped automatically.</>}/>} 
          {form.type === "video" && <><label className="form-label">YouTube Video URL *</label><input className="form-control" value={videoUrl} placeholder="https://www.youtube.com/watch?v=XXXXXXXXXXX" onChange={e => setVideoUrl(e.target.value)}/><div className="form-text mb-3">Paste the normal YouTube video URL. Do not enter iframe/embed code.</div>{form.videoId && <div className="ratio ratio-16x9 mb-3"><iframe src={`https://www.youtube.com/embed/${form.videoId}`} title="YouTube video preview" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen/></div>}</>}
          <label className="form-label">Display Order</label><input className="form-control mb-3" type="number" min="1" value={form.sortOrder} onChange={e => setForm({ ...form, sortOrder: Number(e.target.value) || 1 })}/>
          <label className="form-label">Status</label><select className="form-select" value={form.status} onChange={e => setForm({ ...form, status: e.target.value as "draft" | "published" })}><option value="draft">Draft</option><option value="published">Published</option></select>
        </div><div className="card-footer"><button className="btn btn-success me-2" disabled={saving}>{saving ? "Saving…" : editing ? "Update Feedback" : "Add Feedback"}</button>{editing && <button type="button" className="btn btn-secondary" onClick={reset} disabled={saving}>Cancel</button>}</div>
      </form></div></div>
      <div className="col-xl-8"><div className="card"><div className="card-header"><strong>Seedlings Feedback</strong></div><div className="card-body table-responsive p-0"><table className="table table-hover mb-0"><thead><tr><th>Order</th><th>Type</th><th>Content</th><th>Status</th><th>Actions</th></tr></thead><tbody>
        {items.map(item => <tr key={item.id}><td>{item.sortOrder}</td><td>{item.type === "video" ? "YouTube Video" : item.type === "image" ? "Image" : "Text + Image"}</td><td style={{ maxWidth: 320 }}>{item.type === "video" ? `YouTube: ${item.videoId}` : item.type === "image" ? <img src={item.imageUrl} alt="Feedback" style={{ width: 70, height: 70, objectFit: "cover" }}/> : <span>{item.text}</span>}</td><td>{item.status}</td><td className="text-nowrap"><button className="btn btn-sm btn-outline-primary me-1" onClick={() => edit(item)}>Edit</button><button className="btn btn-sm btn-outline-danger" onClick={async () => { if (!(await confirmAction({ title: "Delete this feedback?", text: "This action cannot be undone. The record will be permanently deleted.", confirmText: "Yes, delete" }))) return; try { await deleteRecord("seedlingsFeedback", item.id); await load(); await showSuccess("Deleted successfully"); } catch (e) { await showError(e, "Unable to delete feedback."); } }}>Delete</button></td></tr>)}
        {!items.length && <tr><td colSpan={5} className="text-center text-muted py-4">No feedback yet.</td></tr>}
      </tbody></table></div></div></div>
    </div>
  </div></AdminPage>;
}
