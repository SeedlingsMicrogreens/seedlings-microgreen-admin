"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminPage } from "@/components/admin/AdminPage";
import { confirmAction, showSuccess } from "@/lib/alerts";
import { createOffer, deleteOffer, updateOffer } from "@/lib/offerService";
import { listCollection } from "@/lib/firestore";
import type { Product } from "@/types/catalog";
import type { Packaging } from "@/types/packaging";
import { packagingDisplay } from "@/types/packaging";
import type { Geolocation } from "@/types/geolocation";
import type { Offer, OfferDiscountType, OfferLocationType, OfferType } from "@/types/offer";

const emptyForm = {
  name: "",
  locationType: "all" as OfferLocationType,
  pincodeIds: [] as string[],
  type: "price" as OfferType,
  startDate: "",
  endDate: "",
  active: true,
  discountType: "percentage" as OfferDiscountType,
  discountValue: 0,
  buyProductId: "",
  buyPackaging: "",
  getProductId: "",
  getPackaging: "",
};

type OfferForm = typeof emptyForm;
type OfferRecord = Offer & { id: string };

function formatLocation(item: Geolocation) {
  return item.locationName ? `${item.locationName} (${item.pincode})` : item.pincode;
}

function formatDiscount(item: OfferRecord) {
  if (item.type === "quantity") {
    const rule = item.quantityRule;
    return rule ? `Buy ${rule.buyProductName} ${packagingDisplay(Number(rule.buyPackaging))} → Get ${rule.getProductName} ${packagingDisplay(Number(rule.getPackaging))}` : "—";
  }
  return `${Number(item.discountValue ?? 0)}${item.discountType === "percentage" ? "%" : " ₹"}`;
}

export default function OffersPage() {
  const [offers, setOffers] = useState<OfferRecord[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [packaging, setPackaging] = useState<Packaging[]>([]);
  const [pincodes, setPincodes] = useState<Geolocation[]>([]);
  const [form, setForm] = useState<OfferForm>({ ...emptyForm });
  const [editing, setEditing] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    try {
      const [offerRows, productRows, packagingRows, pincodeRows] = await Promise.all([
        listCollection<Offer>("offers"),
        listCollection<Product>("products"),
        listCollection<Packaging>("packagingMaster", "size"),
        listCollection<Geolocation>("geolocations"),
      ]);
      setOffers(offerRows);
      setProducts(productRows.filter(p => p.status === "active"));
      setPackaging(packagingRows.filter(p => p.active !== false).sort((a, b) => Number(a.size) - Number(b.size)));
      setPincodes(pincodeRows.filter(p => p.active !== false));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load Offers Master.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return offers.filter(item =>
      !q ||
      item.name.toLowerCase().includes(q) ||
      item.type.toLowerCase().includes(q)
    );
  }, [offers, search]);

  function openCreate() {
    setEditing(null);
    setForm({ ...emptyForm });
    setShowForm(true);
    setError("");
  }

  function openEdit(item: OfferRecord) {
    const rule = item.quantityRule;
    setEditing(item.id);
    setForm({
      name: item.name ?? "",
      locationType: item.locationType ?? "all",
      pincodeIds: item.pincodeIds ?? [],
      type: item.type ?? "price",
      startDate: item.startDate ?? "",
      endDate: item.endDate ?? "",
      active: item.active !== false,
      discountType: item.discountType ?? "percentage",
      discountValue: Number(item.discountValue ?? 0),
      buyProductId: rule?.buyProductId ?? "",
      buyPackaging: rule ? String(rule.buyPackaging) : "",
      getProductId: rule?.getProductId ?? "",
      getPackaging: rule ? String(rule.getPackaging) : "",
    });
    setShowForm(true);
    setError("");
  }

  function closeForm() {
    if (saving) return;
    setShowForm(false);
    setEditing(null);
    setForm({ ...emptyForm });
    setError("");
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const name = form.name.trim();
    if (!name) return setError("Offer name is required.");
    if (!form.startDate || !form.endDate) return setError("Offer start date and end date are required.");
    if (form.startDate > form.endDate) return setError("End date cannot be before start date.");
    if (form.locationType === "pincode" && !form.pincodeIds.length) return setError("Select at least one pincode.");

    const data: Omit<Offer, "id" | "createdAt" | "updatedAt"> = {
      name,
      locationType: form.locationType,
      pincodeIds: form.locationType === "pincode" ? form.pincodeIds : [],
      pincodeLabels: form.locationType === "pincode"
        ? form.pincodeIds.map(id => {
            const item = pincodes.find(p => p.id === id);
            return item ? formatLocation(item) : id;
          })
        : [],
      type: form.type,
      startDate: form.startDate,
      endDate: form.endDate,
      active: form.active,
    };

    if (form.type === "price" || form.type === "deliveryCharge") {
      data.discountType = form.discountType;
      data.discountValue = Number(form.discountValue);
      if (!Number.isFinite(data.discountValue) || data.discountValue < 0) return setError("Discount value must be 0 or more.");
      if (form.discountType === "percentage" && data.discountValue > 100) return setError("Percentage discount cannot exceed 100%.");
    }

    if (form.type === "quantity") {
      const buyProduct = products.find(p => p.id === form.buyProductId);
      const getProduct = products.find(p => p.id === form.getProductId);
      const buyPackaging = Number(form.buyPackaging);
      const getPackaging = Number(form.getPackaging);
      if (!buyProduct || !getProduct) return setError("Select both Buy Product and Get Product.");
      if (!buyPackaging || !getPackaging) return setError("Select both Buy Packaging and Get Packaging.");
      data.quantityRule = {
        buyProductId: buyProduct.id,
        buyProductName: buyProduct.name,
        buyPackaging,
        getProductId: getProduct.id,
        getProductName: getProduct.name,
        getPackaging,
      };
    }

    setSaving(true);
    try {
      if (editing) {
        await updateOffer(editing, data);
        await showSuccess("Offer updated successfully.");
      } else {
        await createOffer(data);
        await showSuccess("Offer created successfully.");
      }
      await load();
      closeForm();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save offer.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(item: OfferRecord) {
    if (!(await confirmAction({
      title: `Delete ${item.name}?`,
      text: "This action cannot be undone. The offer will be permanently deleted.",
      confirmText: "Yes, delete",
    }))) return;
    try {
      await deleteOffer(item.id);
      await load();
      await showSuccess("Offer deleted.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to delete offer.");
    }
  }

  const typeLabel = (type: OfferType) =>
    type === "price" ? "Price" : type === "deliveryCharge" ? "Delivery Charge" : "Quantity";

  return (
    <AdminPage>
      <div className="container-fluid py-3">
        <div className="d-flex flex-wrap justify-content-between align-items-end gap-3 mb-3">
          <div>
            <h1 className="h3 seedlings-brand mb-1">Offers Master</h1>
            <p className="text-muted mb-0">Manage price, delivery charge and quantity offers.</p>
          </div>
          <div className="d-flex gap-2">
            <button className="btn btn-outline-secondary" onClick={() => void load()} disabled={loading} title="Refresh"><i className="bi bi-arrow-clockwise" /></button>
            <button className="btn btn-success" onClick={openCreate}><i className="bi bi-plus-lg me-1" /> Add Offer</button>
          </div>
        </div>

        {error && <div className="alert alert-danger">{error}</div>}

        {showForm && (
          <div className="card border-success mb-3">
            <div className="card-header"><strong>{editing ? "Edit Offer" : "Add Offer"}</strong></div>
            <form onSubmit={save}>
              <div className="card-body">
                <div className="row g-3">
                  <div className="col-md-6">
                    <label className="form-label">Offer Name *</label>
                    <input className="form-control" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Summer Special" required />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label">Offer Location *</label>
                    <select className="form-select" value={form.locationType} onChange={e => setForm({ ...form, locationType: e.target.value as OfferLocationType, pincodeIds: [] })}>
                      <option value="all">All Pincodes</option>
                      <option value="pincode">Pincode</option>
                    </select>
                  </div>

                  {form.locationType === "pincode" && (
                    <div className="col-12">
                      <label className="form-label">Pincode *</label>
                      <select
                        className="form-select"
                        multiple
                        size={Math.min(6, Math.max(3, pincodes.length))}
                        value={form.pincodeIds}
                        onChange={e => setForm({ ...form, pincodeIds: Array.from(e.target.selectedOptions).map(option => option.value) })}
                      >
                        {pincodes.map(item => <option key={item.id} value={item.id}>{formatLocation(item)}</option>)}
                      </select>
                      <div className="form-text">Hold Ctrl/Cmd to select multiple pincodes.</div>
                    </div>
                  )}

                  <div className="col-md-4">
                    <label className="form-label">Offer Type *</label>
                    <select className="form-select" value={form.type} onChange={e => setForm({ ...form, type: e.target.value as OfferType })}>
                      <option value="price">Price</option>
                      <option value="deliveryCharge">Delivery Charge</option>
                      <option value="quantity">Quantity</option>
                    </select>
                  </div>
                  <div className="col-md-4">
                    <label className="form-label">Start Date *</label>
                    <input className="form-control" type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} required />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label">End Date *</label>
                    <input className="form-control" type="date" value={form.endDate} min={form.startDate || undefined} onChange={e => setForm({ ...form, endDate: e.target.value })} required />
                  </div>

                  {(form.type === "price" || form.type === "deliveryCharge") && (
                    <>
                      <div className="col-md-4">
                        <label className="form-label">Discount Type *</label>
                        <select className="form-select" value={form.discountType} onChange={e => setForm({ ...form, discountType: e.target.value as OfferDiscountType })}>
                          <option value="percentage">Percentage</option>
                          <option value="flat">Flat</option>
                        </select>
                      </div>
                      <div className="col-md-4">
                        <label className="form-label">Discount Value *</label>
                        <div className="input-group">
                          <input className="form-control" type="number" min="0" max={form.discountType === "percentage" ? 100 : undefined} step="0.01" value={form.discountValue} onChange={e => setForm({ ...form, discountValue: Number(e.target.value) })} required />
                          <span className="input-group-text">{form.discountType === "percentage" ? "%" : "₹"}</span>
                        </div>
                      </div>
                    </>
                  )}

                  {form.type === "quantity" && (
                    <div className="col-12">
                      <div className="card bg-light border">
                        <div className="card-header"><strong>Quantity Offer</strong><div className="small text-muted">Buy a Product with one packaging size and get another Product with one packaging size free.</div></div>
                        <div className="card-body">
                          <div className="row g-3">
                            <div className="col-md-3">
                              <label className="form-label">Buy Product *</label>
                              <select className="form-select" value={form.buyProductId} onChange={e => setForm({ ...form, buyProductId: e.target.value })} required>
                                <option value="">Select Product</option>
                                {products.map(p => <option key={p.id} value={p.id}>{p.name}{p.sku ? ` (${p.sku})` : ""}</option>)}
                              </select>
                            </div>
                            <div className="col-md-3">
                              <label className="form-label">Buy Packaging *</label>
                              <select className="form-select" value={form.buyPackaging} onChange={e => setForm({ ...form, buyPackaging: e.target.value })} required>
                                <option value="">Select Packaging</option>
                                {packaging.map(p => <option key={p.id} value={p.size}>{packagingDisplay(Number(p.size))}</option>)}
                              </select>
                            </div>
                            <div className="col-md-3">
                              <label className="form-label">Get Product *</label>
                              <select className="form-select" value={form.getProductId} onChange={e => setForm({ ...form, getProductId: e.target.value })} required>
                                <option value="">Select Product</option>
                                {products.map(p => <option key={p.id} value={p.id}>{p.name}{p.sku ? ` (${p.sku})` : ""}</option>)}
                              </select>
                            </div>
                            <div className="col-md-3">
                              <label className="form-label">Get Packaging *</label>
                              <select className="form-select" value={form.getPackaging} onChange={e => setForm({ ...form, getPackaging: e.target.value })} required>
                                <option value="">Select Packaging</option>
                                {packaging.map(p => <option key={p.id} value={p.size}>{packagingDisplay(Number(p.size))}</option>)}
                              </select>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="col-12">
                    <div className="form-check">
                      <input className="form-check-input" type="checkbox" id="offer-active" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} />
                      <label className="form-check-label" htmlFor="offer-active">Active</label>
                    </div>
                  </div>
                </div>
              </div>
              <div className="card-footer d-flex justify-content-end gap-2">
                <button type="button" className="btn btn-secondary" onClick={closeForm} disabled={saving}>Cancel</button>
                <button className="btn btn-success" disabled={saving}>{saving ? "Saving..." : editing ? "Update Offer" : "Create Offer"}</button>
              </div>
            </form>
          </div>
        )}

        <div className="card">
          <div className="card-header">
            <div className="d-flex flex-wrap justify-content-between align-items-center gap-2">
              <div><strong>Offers</strong><div className="small text-muted">Current configured offers.</div></div>
              <div className="input-group" style={{ maxWidth: 360 }}>
                <span className="input-group-text"><i className="bi bi-search" /></span>
                <input className="form-control" placeholder="Search offers..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>
            </div>
          </div>
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead><tr><th>Offer Name</th><th>Location</th><th>Type</th><th>Offer</th><th>Period</th><th>Status</th><th className="text-end">Actions</th></tr></thead>
              <tbody>
                {loading && <tr><td colSpan={7} className="text-center py-5"><span className="spinner-border spinner-border-sm me-2" />Loading...</td></tr>}
                {!loading && filtered.map(item => (
                  <tr key={item.id}>
                    <td><strong>{item.name}</strong></td>
                    <td>{item.locationType === "all" ? "All Pincodes" : (item.pincodeLabels?.join(", ") || `${item.pincodeIds?.length ?? 0} Pincode(s)`)}</td>
                    <td>{typeLabel(item.type)}</td>
                    <td>{formatDiscount(item)}</td>
                    <td><div>{item.startDate}</div><div className="small text-muted">to {item.endDate}</div></td>
                    <td><span className={`badge text-bg-${item.active ? "success" : "secondary"}`}>{item.active ? "Active" : "Inactive"}</span></td>
                    <td className="text-end text-nowrap">
                      <button className="btn btn-sm btn-outline-primary me-1" onClick={() => openEdit(item)}><i className="bi bi-pencil me-1" />Edit</button>
                      <button className="btn btn-sm btn-outline-danger" onClick={() => void remove(item)}><i className="bi bi-trash me-1" />Delete</button>
                    </td>
                  </tr>
                ))}
                {!loading && !filtered.length && <tr><td colSpan={7} className="text-center text-muted py-5">No offers yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminPage>
  );
}
