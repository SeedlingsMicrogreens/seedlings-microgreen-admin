"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminPage } from "@/components/admin/AdminPage";
import { ImageGalleryUploader } from "@/components/ui/ImageGalleryUploader";
import { createSalesProduct, deleteSalesProduct, listSalesProducts, updateSalesProduct, validateSalesProduct } from "@/lib/salesProductService";
import { listCollection } from "@/lib/firestore";
import type { Product } from "@/types/catalog";
import type { SalesProduct, SalesProductComponent, SalesProductType } from "@/types/salesProduct";
import {confirmAction} from "@/lib/alerts";

const empty = {
  name: "", sku: "", slug: "", description: "", shortDescription: "", imageUrl: "",
  type: "single" as SalesProductType,
  components: [] as SalesProductComponent[], mrp: 0, sellingPrice: 0,
  oneTimePurchase: true, subscriptionPurchase: false, active: true, featured: false, sortOrder: 0
};

function slugify(v: string) { return v.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
function autoSku(v: string) { const base = v.toUpperCase().trim().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 18); return base ? `SP-${base}` : "SP-NEW"; }
function generatedSingleName(productName: string, quantityGrams: number) { return productName.trim() ? `${productName.trim()} ${quantityGrams || 0} gms` : ""; }
function typeLabel(v: SalesProductType) { return v === "single" ? "Single" : "Combo"; }

export default function SalesProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [salableProducts, setSalableProducts] = useState<SalesProduct[]>([]);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [tab, setTab] = useState<"list" | "form">("list");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [skuTouched, setSkuTouched] = useState(false);
  const [slugTouched, setSlugTouched] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [productionProducts, salable] = await Promise.all([
        listCollection<Product>("products"), listSalesProducts()
      ]);
      setProducts(productionProducts);
      setSalableProducts(salable);
      setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load salable products."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return salableProducts.filter(x => !q || x.name.toLowerCase().includes(q) || String(x.sku ?? "").toLowerCase().includes(q));
  }, [salableProducts, search]);

  function reset() { setEditing(null); setForm({ ...empty, components: [] }); setNameTouched(false); setSkuTouched(false); setSlugTouched(false); setError(""); setTab("list"); }
  function create() { setEditing(null); setForm({ ...empty, components: [] }); setNameTouched(false); setSkuTouched(false); setSlugTouched(false); setError(""); setTab("form"); }

  function edit(item: SalesProduct) {
    setEditing(item.id);
    setForm({
      ...empty, ...item,
      sku: item.sku ?? "", slug: item.slug ?? "", description: item.description ?? "", shortDescription: item.shortDescription ?? "",
      imageUrl: item.imageUrl ?? "", components: item.components ?? [], mrp: Number(item.mrp ?? item.sellingPrice ?? 0), sellingPrice: Number(item.sellingPrice ?? 0),
      oneTimePurchase: item.oneTimePurchase !== false, subscriptionPurchase: Boolean(item.subscriptionPurchase),
      active: item.active !== false, featured: Boolean(item.featured), sortOrder: Number(item.sortOrder ?? 0)
    });
    setNameTouched(true); setSkuTouched(true); setSlugTouched(true); setError(""); setTab("form");
  }

  function setType(type: SalesProductType) {
    if (type === "single") {
      const first = form.components[0];
      setForm(f => ({ ...f, type, components: first ? [first] : [], mrp: first ? Number(products.find(p => p.id === first.productId)?.price ?? f.mrp) : f.mrp, sellingPrice: first ? Number(products.find(p => p.id === first.productId)?.price ?? f.sellingPrice) : f.sellingPrice }));
    } else {
      setForm(f => ({ ...f, type, components: f.components.length >= 2 ? f.components : [] }));
    }
  }

  function selectSingleProduct(productId: string) {
    const p = products.find(x => x.id === productId);
    if (!p) {
      setForm(f => ({ ...f, components: [], sellingPrice: 0 }));
      return;
    }
    const quantityGrams = form.components[0]?.quantityGrams || 100;
    const generatedName = generatedSingleName(p.name, quantityGrams);
    setForm(f => ({
      ...f,
      components: [{ productId: p.id, productName: p.name, productSku: p.sku, quantityGrams }],
      mrp: Number(p.price ?? 0),
      sellingPrice: Number(p.price ?? 0),
      ...(skuTouched ? {} : { sku: autoSku(generatedName) }),
      ...(slugTouched ? {} : { slug: slugify(generatedName) }),
      ...(nameTouched ? {} : { name: generatedName }),
    }));
  }

  function addComponent() {
    const unused = products.find(p => !form.components.some(c => c.productId === p.id));
    if (!unused) return setError("All available production products are already selected.");
    setError("");
    setForm(f => ({ ...f, components: [...f.components, { productId: unused.id, productName: unused.name, productSku: unused.sku, quantityGrams: 100 }] }));
  }
  function updateComponent(index: number, patch: Partial<SalesProductComponent>) {
    setForm(f => ({ ...f, components: f.components.map((c, i) => i === index ? { ...c, ...patch } : c) }));
  }
  function selectComboProduct(index: number, productId: string) {
    const p = products.find(x => x.id === productId);
    if (!p) return;
    updateComponent(index, { productId: p.id, productName: p.name, productSku: p.sku });
  }
  function removeComponent(index: number) { setForm(f => ({ ...f, components: f.components.filter((_, i) => i !== index) })); }

  function changeName(name: string) {
    setNameTouched(true);
    setForm(f => ({
      ...f,
      name,
      ...(skuTouched ? {} : { sku: autoSku(name) }),
      ...(slugTouched ? {} : { slug: slugify(name) }),
    }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault(); setError("");
    const components = form.components.map(c => {
      const p = products.find(x => x.id === c.productId);
      return { ...c, productName: p?.name ?? c.productName, productSku: p?.sku ?? c.productSku, quantityGrams: Number(c.quantityGrams) };
    });
    try {
      validateSalesProduct({ ...form, components, mrp: Number(form.mrp), sellingPrice: Number(form.sellingPrice) });
      const sku = form.sku.trim();
      const duplicate = salableProducts.some(x => x.id !== editing && String(x.sku ?? "").trim().toLowerCase() === sku.toLowerCase() && Boolean(sku));
      if (duplicate) throw new Error("Salable Product SKU must be unique.");
      const data = {
        name: form.name.trim(), sku: sku || undefined, slug: form.slug.trim() || slugify(form.name),
        description: form.description.trim() || undefined, shortDescription: form.shortDescription.trim() || undefined,
        imageUrl: form.imageUrl || undefined, type: form.type, components,
        mrp: Number(form.mrp), sellingPrice: Number(form.sellingPrice), currency: "INR", oneTimePurchase: form.oneTimePurchase,
        subscriptionPurchase: form.subscriptionPurchase, active: form.active, featured: form.featured, sortOrder: Number(form.sortOrder)
      };
      setSaving(true);
      if (editing) await updateSalesProduct(editing, data); else await createSalesProduct(data);
      await load(); reset();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save salable product."); }
    finally { setSaving(false); }
  }

  async function remove(id: string) {
    if (!(await confirmAction({title:"Delete this Salable Product?",text:"Only delete it when it has no dependent orders or subscriptions.",confirmText:"Yes, delete"}))) return;
    try { await deleteSalesProduct(id); await load(); } catch (e) { setError(e instanceof Error ? e.message : "Unable to delete salable product."); }
  }

  const selectedSingle = form.type === "single" ? form.components[0]?.productId ?? "" : "";

  return <AdminPage><div className="container-fluid py-3">
    <div className="d-flex justify-content-between align-items-start gap-3 mb-3">
      <div><h1 className="h3 seedlings-brand mb-1">Salable Products</h1><p className="text-muted mb-0">Define what customers can buy using existing production products.</p></div>
      {tab === "list" && <button className="btn btn-success" onClick={create}><i className="bi bi-plus-lg me-1" />Add Salable Product</button>}
    </div>
    {error && <div className="alert alert-danger">{error}</div>}
    <div className="alert alert-info"><strong>Salable products are built from production products.</strong><div className="small">Inventory remains actual harvested usable grams. Packaging and fulfilment will consume those grams later.</div></div>
    <ul className="nav nav-tabs mb-3"><li className="nav-item"><button className={`nav-link ${tab === "list" ? "active" : ""}`} onClick={() => setTab("list")}>Salable Product Master</button></li><li className="nav-item"><button className={`nav-link ${tab === "form" ? "active" : ""}`} onClick={() => setTab("form")}>{editing ? "Edit Salable Product" : "Create Salable Product"}</button></li></ul>

    {tab === "list" ? <div className="card"><div className="card-header"><div className="row g-2 align-items-center"><div className="col-md-8"><div className="input-group"><span className="input-group-text"><i className="bi bi-search" /></span><input className="form-control" placeholder="Search salable product or SKU..." value={search} onChange={e => setSearch(e.target.value)} /></div></div><div className="col-md-4 text-md-end text-muted small">{filtered.length} of {salableProducts.length}</div></div></div>
      <div className="table-responsive"><table className="table table-hover align-middle mb-0"><thead><tr><th>Salable Product</th><th>Type</th><th>Products / Quantity</th><th>Pricing</th><th>Purchase</th><th>Status</th><th className="text-end">Actions</th></tr></thead><tbody>
        {loading ? <tr><td colSpan={7} className="text-center py-4 text-muted">Loading...</td></tr> : filtered.map(x => <tr key={x.id}><td><strong>{x.name}</strong><div className="small text-muted">{x.sku || "No SKU"}</div></td><td><span className="badge text-bg-light border">{typeLabel(x.type)}</span></td><td>{x.components.map(c => `${c.productName} ${c.quantityGrams} gms`).join(" + ")}</td><td><div className="text-decoration-line-through text-muted small">₹{Number(x.mrp ?? x.sellingPrice).toLocaleString("en-IN")}</div><strong>₹{Number(x.sellingPrice).toLocaleString("en-IN")}</strong>{Number(x.mrp ?? x.sellingPrice) > Number(x.sellingPrice) && <div className="small text-success">Save ₹{(Number(x.mrp ?? x.sellingPrice) - Number(x.sellingPrice)).toLocaleString("en-IN")}</div>}</td><td><div className="small">{x.oneTimePurchase ? "One-time" : "—"}</div><div className="small">{x.subscriptionPurchase ? "Subscription" : "—"}</div></td><td><span className={`badge text-bg-${x.active ? "success" : "secondary"}`}>{x.active ? "Active" : "Inactive"}</span></td><td className="text-end"><div className="btn-group btn-group-sm"><button className="btn btn-outline-secondary" onClick={() => edit(x)}><i className="bi bi-pencil" /></button><button className="btn btn-outline-danger" onClick={() => void remove(x.id)}><i className="bi bi-trash" /></button></div></td></tr>)}
        {!loading && !filtered.length && <tr><td colSpan={7} className="text-center py-4 text-muted">No salable products found.</td></tr>}
      </tbody></table></div></div> : <form onSubmit={save}><div className="card"><div className="card-body"><div className="row g-4"><div className="col-lg-7">
        <div className="card border"><div className="card-header"><strong>Salable Product Definition</strong></div><div className="card-body">
          <div className="mb-3"><label className="form-label">Type *</label><select className="form-select" value={form.type} onChange={e => setType(e.target.value as SalesProductType)}><option value="single">Single</option><option value="multiple">Combo</option></select><div className="form-text">Single uses one existing production product. Combo can contain multiple products.</div></div>
          {form.type === "single" ? <div className="row g-3 mb-3"><div className="col-md-8"><label className="form-label">Existing Product *</label><select className="form-select" value={selectedSingle} onChange={e => selectSingleProduct(e.target.value)} required><option value="">Select production product</option>{products.map(p => <option key={p.id} value={p.id}>{p.name}{p.sku ? ` (${p.sku})` : ""}</option>)}</select></div><div className="col-md-4"><label className="form-label">Quantity (gms) *</label><input className="form-control" type="number" min="1" step="1" value={form.components[0]?.quantityGrams ?? 100} onChange={e => {
              const quantityGrams = Number(e.target.value);
              if (!form.components[0]) return;
              const product = products.find(p => p.id === form.components[0].productId);
              const generatedName = product ? generatedSingleName(product.name, quantityGrams) : form.name;
              setForm(f => ({
                ...f,
                components: f.components.map((c, i) => i === 0 ? { ...c, quantityGrams } : c),
                ...(skuTouched ? {} : { sku: autoSku(generatedName) }),
                ...(slugTouched ? {} : { slug: slugify(generatedName) }),
                ...(nameTouched ? {} : { name: generatedName }),
              }));
            }} required /></div></div> : <div className="mb-3"><div className="d-flex justify-content-between align-items-center mb-2"><div><label className="form-label mb-0">Products *</label><div className="form-text mt-0">Add each existing production product and its quantity in grams.</div></div><button type="button" className="btn btn-sm btn-outline-success" onClick={addComponent}><i className="bi bi-plus-lg me-1" />Add Product</button></div>{!form.components.length && <div className="border rounded p-3 text-center text-muted">No products added. Click <strong>Add Product</strong> to add combo items.</div>}{form.components.map((c, i) => <div className="row g-2 align-items-end mb-2" key={`${c.productId}-${i}`}><div className="col-md-7"><select className="form-select" value={c.productId} onChange={e => selectComboProduct(i, e.target.value)} required><option value="">Select production product</option>{products.map(p => <option key={p.id} value={p.id} disabled={form.components.some((other,j) => j !== i && other.productId === p.id)}>{p.name}{p.sku ? ` (${p.sku})` : ""}</option>)}</select></div><div className="col-md-3"><input className="form-control" type="number" min="1" step="1" value={c.quantityGrams} onChange={e => updateComponent(i, { quantityGrams: Number(e.target.value) })} aria-label={`Quantity for product ${i + 1}`} required /></div><div className="col-md-2"><button type="button" className="btn btn-outline-danger w-100" onClick={() => removeComponent(i)} title="Remove product"><i className="bi bi-trash" /></button></div></div>)}</div>}

          <div className="row g-3"><div className="col-md-6"><label className="form-label">Salable Product Name *</label><input className="form-control" value={form.name} onChange={e => changeName(e.target.value)} required placeholder="e.g. Broccoli 200gms" /></div><div className="col-md-6"><label className="form-label">SKU / Code</label><input className="form-control" value={form.sku} onChange={e => { setSkuTouched(true); setForm({...form,sku:e.target.value}); }} placeholder="e.g. SP-BRO-200" /></div><div className="col-md-6"><label className="form-label">Slug</label><input className="form-control" value={form.slug} onChange={e => { setSlugTouched(true); setForm({...form,slug:e.target.value}); }} placeholder="Auto-generated if blank" /></div><div className="col-md-6"><label className="form-label">Short Description</label><input className="form-control" value={form.shortDescription} onChange={e => setForm({...form,shortDescription:e.target.value})} /></div><div className="col-12"><label className="form-label">Description</label><textarea className="form-control" rows={4} value={form.description} onChange={e => setForm({...form,description:e.target.value})} /></div></div>
        </div></div>
        <div className="card border mt-4"><div className="card-header"><strong>Salable Product Image</strong></div><div className="card-body"><ImageGalleryUploader value={form.imageUrl ? [form.imageUrl] : []} onChange={urls => setForm({...form,imageUrl:urls[0] ?? ""})} /></div></div>
      </div><div className="col-lg-5"><div className="card border"><div className="card-header"><strong>Price & Purchase</strong></div><div className="card-body"><div className="row g-3 mb-2"><div className="col-sm-6"><label className="form-label">MRP (₹) *</label><input className="form-control" type="number" min="0.01" step="0.01" value={form.mrp} onChange={e=>setForm({...form,mrp:Number(e.target.value)})}/><div className="form-text">Original/reference price shown to customers.</div></div><div className="col-sm-6"><label className="form-label">Selling Price (₹) *</label><input className="form-control" type="number" min="0.01" step="0.01" value={form.sellingPrice} onChange={e=>setForm({...form,sellingPrice:Number(e.target.value)})}/><div className="form-text">Actual price the customer pays.</div></div></div>{Number(form.mrp) > Number(form.sellingPrice) && Number(form.sellingPrice) > 0 && <div className="alert alert-success py-2 mb-3"><strong>Customer saving:</strong> ₹{(Number(form.mrp) - Number(form.sellingPrice)).toLocaleString("en-IN")}</div>}{form.type === "single" && form.components[0] && <div className="form-text mb-3">Default MRP and selling price are fetched from <strong>{form.components[0].productName}</strong>. You can change them for this salable product.</div>}{form.type === "multiple" && <div className="form-text mb-3">Set the selling price for this combo.</div>}<div className="form-check mb-2"><input className="form-check-input" type="checkbox" id="one-time" checked={form.oneTimePurchase} onChange={e=>setForm({...form,oneTimePurchase:e.target.checked})}/><label className="form-check-label" htmlFor="one-time">Available for one-time purchase</label></div><div className="form-check"><input className="form-check-input" type="checkbox" id="subscription" checked={form.subscriptionPurchase} onChange={e=>setForm({...form,subscriptionPurchase:e.target.checked})}/><label className="form-check-label" htmlFor="subscription">Available for subscription</label></div></div></div><div className="card border mt-4"><div className="card-header"><strong>Status</strong></div><div className="card-body"><div className="form-check mb-2"><input className="form-check-input" type="checkbox" id="active" checked={form.active} onChange={e=>setForm({...form,active:e.target.checked})}/><label className="form-check-label" htmlFor="active">Active and available</label></div><div className="form-check mb-3"><input className="form-check-input" type="checkbox" id="featured" checked={form.featured} onChange={e=>setForm({...form,featured:e.target.checked})}/><label className="form-check-label" htmlFor="featured">Featured</label></div><label className="form-label">Sort order</label><input className="form-control" type="number" step="1" value={form.sortOrder} onChange={e=>setForm({...form,sortOrder:Number(e.target.value)})}/></div></div></div></div></div><div className="card-footer d-flex justify-content-end gap-2"><button type="button" className="btn btn-secondary" onClick={reset}>Cancel</button><button className="btn btn-success" disabled={saving || loading}>{saving ? "Saving..." : editing ? "Update Salable Product" : "Create Salable Product"}</button></div></div></form>}
  </div></AdminPage>;
}
