"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminPage } from "@/components/admin/AdminPage";
import { ImageGalleryUploader } from "@/components/ui/ImageGalleryUploader";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { createSalesProduct, deleteOrDeactivateSalesProduct, isSalesProductReferencedByOrder, listSalesProducts, updateSalesProduct, validateSalesProduct } from "@/lib/salesProductService";
import { listCollection } from "@/lib/firestore";
import type { Product } from "@/types/catalog";
import type { Packaging } from "@/types/packaging";
import { packagingDisplay } from "@/types/packaging";
import type { SalesProduct, SalesProductComponent, SalesProductSellingOption, SalesProductType } from "@/types/salesProduct";
import {confirmAction} from "@/lib/alerts";

const empty = {
  name: "", sku: "", slug: "", description: "", shortDescription: "", imageUrl: "",
  type: "single" as SalesProductType,
  components: [] as SalesProductComponent[], mrp: 0, sellingPrice: 0,
  oneTimePurchase: true, subscriptionPurchase: false, active: true, featured: false, sortOrder: 0, sellingOptions: [] as SalesProductSellingOption[]
};

function slugify(v: string) { return v.toLowerCase().trim().replace(/[^a-z_-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, ""); }
function sanitizeSlug(v: string) { return v.toLowerCase().replace(/[^a-z_-]/g, ""); }
function autoSku(v: string) { const base = v.toUpperCase().trim().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 18); return base ? `SP-${base}` : "SP-NEW"; }
function generatedSingleName(productName: string, quantityGrams: number) { return productName.trim() ? `${productName.trim()} ${quantityGrams || 0} gms` : ""; }
function typeLabel(v: SalesProductType) { return v === "single" ? "Single" : "Combo"; }

export default function SalesProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [salableProducts, setSalableProducts] = useState<SalesProduct[]>([]);
  const [packaging, setPackaging] = useState<Packaging[]>([]);
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
      const [productionProducts, salable, packagingRows] = await Promise.all([
        listCollection<Product>("products"), listSalesProducts(), listCollection<Packaging>("packagingMaster", "size")
      ]);
      setProducts(productionProducts);
      setSalableProducts(salable);
      setPackaging(packagingRows.filter(item => item.active !== false).sort((a, b) => Number(a.size) - Number(b.size)));
      setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load products."); }
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
      imageUrl: item.imageUrl ?? "", components: item.type === "multiple"
        ? (() => { const components = item.components ?? []; const totalGrams = components.reduce((sum, c) => sum + Number(c.quantityGrams ?? 0), 0); if (components.some(c => c.percentage != null)) return components.map(c => ({ ...c, percentage: Number(c.percentage ?? 0) })); const percentages = components.map(c => totalGrams > 0 ? Math.round((Number(c.quantityGrams ?? 0) / totalGrams) * 100) : 0); if (percentages.length) percentages[percentages.length - 1] += 100 - percentages.reduce((sum, value) => sum + value, 0); return components.map((c, i) => ({ ...c, percentage: percentages[i] })); })()
        : (item.components ?? []), mrp: Number(item.mrp ?? item.sellingPrice ?? 0), sellingPrice: Number(item.sellingPrice ?? 0),
      oneTimePurchase: item.oneTimePurchase !== false, subscriptionPurchase: Boolean(item.subscriptionPurchase),
      active: item.active !== false, featured: Boolean(item.featured), sortOrder: Number(item.sortOrder ?? 0),
      sellingOptions: (item.sellingOptions ?? []).map(option => ({ ...option, id: option.id || crypto.randomUUID(), weightGrams: Number(option.weightGrams ?? 0), mrp: Number(option.mrp ?? option.price ?? 0), price: Number(option.price ?? 0), active: option.active !== false }))
    });
    setNameTouched(true); setSkuTouched(true); setSlugTouched(true); setError(""); setTab("form");
  }

  function setType(type: SalesProductType) {
    if (type === "single") {
      const first = form.components[0];
      setForm(f => ({ ...f, type, components: first ? [first] : [], mrp: first ? Number(products.find(p => p.id === first.productId)?.price ?? f.mrp) : f.mrp, sellingPrice: first ? Number(products.find(p => p.id === first.productId)?.price ?? f.sellingPrice) : f.sellingPrice }));
    } else {
      setForm(f => ({ ...f, type, components: f.components.length ? f.components.map((c, i) => ({ ...c, percentage: i === 0 ? 100 : 0, quantityGrams: 0 })) : [] }));
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
    if (!unused) return setError("All available microgreens are already selected.");
    setError("");
    setForm(f => ({ ...f, components: [...f.components, { productId: unused.id, productName: unused.name, productSku: unused.sku, quantityGrams: 0, percentage: f.components.length === 0 ? 100 : 0 }] }));
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

  function addSellingOption() {
    const used = new Set((form.sellingOptions ?? []).map(option => Number(option.weightGrams)));
    const firstPackaging = packaging.find(item => !used.has(Number(item.size)));
    if (!firstPackaging) return setError("All available packaging sizes are already added.");
    setError("");
    setForm(f => ({ ...f, sellingOptions: [...(f.sellingOptions ?? []), { id: crypto.randomUUID(), weightGrams: Number(firstPackaging.size), mrp: 0, price: 0, active: true }] }));
  }
  function updateSellingOption(index: number, patch: Partial<SalesProductSellingOption>) {
    setForm(f => ({ ...f, sellingOptions: (f.sellingOptions ?? []).map((option, i) => i === index ? { ...option, ...patch } : option) }));
  }
  function removeSellingOption(index: number) {
    setForm(f => ({ ...f, sellingOptions: (f.sellingOptions ?? []).filter((_, i) => i !== index) }));
  }

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
      return form.type === "multiple"
        ? { ...c, productName: p?.name ?? c.productName, productSku: p?.sku ?? c.productSku, percentage: Number(c.percentage ?? 0), quantityGrams: 0 }
        : { ...c, productName: p?.name ?? c.productName, productSku: p?.sku ?? c.productSku, quantityGrams: Number(c.quantityGrams) };
    });
    const sellingOptions = (form.sellingOptions ?? []).map(option => ({ ...option, weightGrams: Number(option.weightGrams), mrp: Number(option.mrp), price: Number(option.price), active: option.active !== false }));
    if (sellingOptions.some(option => !option.weightGrams || option.weightGrams <= 0)) return setError("Select a packaging size for every salable option.");
    if (sellingOptions.some(option => option.mrp <= 0 || option.price <= 0)) return setError("MRP and selling price must be greater than 0 for every salable option.");
    if (sellingOptions.some(option => option.price > option.mrp)) return setError("Selling price cannot be greater than MRP.");
    if (new Set(sellingOptions.map(option => option.weightGrams)).size !== sellingOptions.length) return setError("Each packaging size can be added only once.");
    try {
      validateSalesProduct({ ...form, imageUrl: form.imageUrl, components, mrp: Number(form.mrp), sellingPrice: Number(form.sellingPrice) });
      const sku = form.sku.trim();
      const duplicate = salableProducts.some(x => x.id !== editing && String(x.sku ?? "").trim().toLowerCase() === sku.toLowerCase() && Boolean(sku));
      if (duplicate) throw new Error("Product SKU must be unique.");
      const data = {
        name: form.name.trim(), sku: sku || undefined, slug: sanitizeSlug(form.slug.trim()) || slugify(form.name),
        description: form.description.trim() || undefined, shortDescription: form.shortDescription.trim() || undefined,
        imageUrl: form.imageUrl.trim(), type: form.type, components,
        mrp: Number(form.mrp), sellingPrice: Number(form.sellingPrice), currency: "INR", oneTimePurchase: form.oneTimePurchase,
        subscriptionPurchase: form.subscriptionPurchase, active: form.active, featured: form.featured, sortOrder: Number(form.sortOrder), sellingOptions
      };
      setSaving(true);
      if (editing) await updateSalesProduct(editing, data); else await createSalesProduct(data);
      await load(); reset();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save product."); }
    finally { setSaving(false); }
  }

  async function remove(id: string) {
    try {
      if (await isSalesProductReferencedByOrder(id)) {
        setError("Product cannot be deleted because it is referenced by one or more orders.");
        return;
      }
      if (!(await confirmAction({
        title:"Delete this Product?",
        text:"This action cannot be undone. The Product is not referenced by any order and will be permanently deleted.",
        confirmText:"Yes, delete",
      }))) return;
      const result = await deleteOrDeactivateSalesProduct(id);
      await load();
      setError(result.action === "deactivated"
        ? "Product has existing references, so it was deactivated instead of deleted."
        : "");
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to delete product."); }
  }

  const selectedSingle = form.type === "single" ? form.components[0]?.productId ?? "" : "";

  return <AdminPage><div className="container-fluid py-3">
    <div className="d-flex justify-content-between align-items-start gap-3 mb-3">
      <div><h1 className="h3 seedlings-brand mb-1">Products</h1><p className="text-muted mb-0">Define what customers can buy using existing microgreens.</p></div>
      {tab === "list" && <button className="btn btn-success" onClick={create}><i className="bi bi-plus-lg me-1" />Add Product</button>}
    </div>
    {error && <div className="alert alert-danger">{error}</div>}
    <div className="alert alert-info"><strong>Products are built from microgreens.</strong><div className="small">Inventory remains actual harvested usable grams. Packaging and fulfilment will consume those grams later.</div></div>
    <ul className="nav nav-tabs mb-3"><li className="nav-item"><button className={`nav-link ${tab === "list" ? "active" : ""}`} onClick={() => setTab("list")}>Product Master</button></li><li className="nav-item"><button className={`nav-link ${tab === "form" ? "active" : ""}`} onClick={() => setTab("form")}>{editing ? "Edit Product" : "Create Product"}</button></li></ul>

    {tab === "list" ? <div className="card"><div className="card-header"><div className="row g-2 align-items-center"><div className="col-md-8"><div className="input-group"><span className="input-group-text"><i className="bi bi-search" /></span><input className="form-control" placeholder="Search product or SKU..." value={search} onChange={e => setSearch(e.target.value)} /></div></div><div className="col-md-4 text-md-end text-muted small">{filtered.length} of {salableProducts.length}</div></div></div>
      <div className="table-responsive"><table className="table table-hover align-middle mb-0"><thead><tr><th>Product</th><th>Type</th><th>Products / Quantity</th><th>Pricing</th><th>Purchase</th><th>Status</th><th className="text-end">Actions</th></tr></thead><tbody>
        {loading ? <tr><td colSpan={7} className="text-center py-4 text-muted">Loading...</td></tr> : filtered.map(x => <tr key={x.id}><td><strong>{x.name}</strong><div className="small text-muted">{x.sku || "No SKU"}</div></td><td><span className="badge text-bg-light border">{typeLabel(x.type)}</span></td><td>{x.components.map(c => x.type === "multiple" ? `${c.productName} ${Number(c.percentage ?? 0)}%` : `${c.productName} ${c.quantityGrams} gms`).join(" + ")}</td><td><div className="text-decoration-line-through text-muted small">₹{Number(x.mrp ?? x.sellingPrice).toLocaleString("en-IN")}</div><strong>₹{Number(x.sellingPrice).toLocaleString("en-IN")}</strong>{Number(x.mrp ?? x.sellingPrice) > Number(x.sellingPrice) && <div className="small text-success">Save ₹{(Number(x.mrp ?? x.sellingPrice) - Number(x.sellingPrice)).toLocaleString("en-IN")}</div>}</td><td><div className="small">{x.oneTimePurchase ? "One-time" : "—"}</div><div className="small">{x.subscriptionPurchase ? "Subscription" : "—"}</div></td><td><span className={`badge text-bg-${x.active ? "success" : "secondary"}`}>{x.active ? "Active" : "Inactive"}</span></td><td className="text-end"><div className="btn-group btn-group-sm"><button className="btn btn-outline-secondary" onClick={() => edit(x)}><i className="bi bi-pencil" /></button><button className="btn btn-outline-danger" onClick={() => void remove(x.id)}><i className="bi bi-trash" /></button></div></td></tr>)}
        {!loading && !filtered.length && <tr><td colSpan={7} className="text-center py-4 text-muted">No products found.</td></tr>}
      </tbody></table></div></div> : <form onSubmit={save}><div className="card"><div className="card-body"><div className="row g-4"><div className="col-lg-7">
        <div className="card border"><div className="card-header"><strong>Product Definition</strong></div><div className="card-body">
          <div className="mb-3"><label className="form-label">Type *</label><select className="form-select" value={form.type} onChange={e => setType(e.target.value as SalesProductType)}><option value="single">Single</option><option value="multiple">Combo</option></select><div className="form-text">Single uses one existing microgreen. Combo can contain multiple microgreens.</div></div>
          {form.type === "single" ? <div className="row g-3 mb-3"><div className="col-md-8"><label className="form-label">Existing Microgreen *</label><select className="form-select" value={selectedSingle} onChange={e => selectSingleProduct(e.target.value)} required><option value="">Select microgreen</option>{products.map(p => <option key={p.id} value={p.id}>{p.name}{p.sku ? ` (${p.sku})` : ""}</option>)}</select></div><div className="col-md-4"><label className="form-label">Quantity (gms) *</label><input className="form-control" type="number" min="1" step="1" value={form.components[0]?.quantityGrams ?? 100} onChange={e => {
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
            }} required /></div></div> : <div className="mb-3"><div className="d-flex justify-content-between align-items-center mb-2"><div><label className="form-label mb-0">Microgreens *</label><div className="form-text mt-0">Add each microgreen and define its percentage of the total Product. The total must be exactly 100%.</div></div><button type="button" className="btn btn-sm btn-outline-success" onClick={addComponent}><i className="bi bi-plus-lg me-1" />Add Microgreen</button></div>{!form.components.length && <div className="border rounded p-3 text-center text-muted">No microgreens added. Click <strong>Add Microgreen</strong> to add combo items.</div>}{form.components.map((c, i) => { const total = form.components.reduce((sum, item) => sum + Number(item.percentage ?? 0), 0); const otherTotal = total - Number(c.percentage ?? 0); const remaining = Math.max(0, 100 - otherTotal); return <div className="row g-2 align-items-end mb-2" key={`${c.productId}-${i}`}><div className="col-md-7"><select className="form-select" value={c.productId} onChange={e => selectComboProduct(i, e.target.value)} required><option value="">Select microgreen</option>{products.map(p => <option key={p.id} value={p.id} disabled={form.components.some((other,j) => j !== i && other.productId === p.id)}>{p.name}{p.sku ? ` (${p.sku})` : ""}</option>)}</select></div><div className="col-md-3"><label className="form-label small mb-1">Percentage (%)</label><input className="form-control" type="number" min="1" max={remaining} step="1" value={c.percentage ?? 0} onChange={e => updateComponent(i, { percentage: Math.min(remaining, Math.max(0, Number(e.target.value))), quantityGrams: 0 })} aria-label={`Percentage for microgreen ${i + 1}`} required /></div><div className="col-md-2"><button type="button" className="btn btn-outline-danger w-100" onClick={() => removeComponent(i)} title="Remove microgreen"><i className="bi bi-trash" /></button></div></div>})}<div className={`small fw-semibold mt-2 ${form.components.reduce((sum, item) => sum + Number(item.percentage ?? 0), 0) === 100 ? "text-success" : "text-danger"}`}>Total: {form.components.reduce((sum, item) => sum + Number(item.percentage ?? 0), 0)}% / 100%</div></div>}

          <div className="row g-3"><div className="col-md-6"><label className="form-label">Product Name *</label><input className="form-control" value={form.name} onChange={e => changeName(e.target.value)} required placeholder="e.g. Broccoli 200gms" /></div><div className="col-md-6"><label className="form-label">SKU / Code</label><input className="form-control" value={form.sku} onChange={e => { setSkuTouched(true); setForm({...form,sku:e.target.value}); }} placeholder="e.g. SP-BRO-200" /></div><div className="col-md-6"><label className="form-label">Slug</label><input className="form-control" value={form.slug} onChange={e => { setSlugTouched(true); setForm({...form,slug:sanitizeSlug(e.target.value)}); }} placeholder="e.g. broccoli-microgreens" inputMode="text" autoCapitalize="none" spellCheck={false} /><div className="form-text">Lowercase letters, hyphen (-) and underscore (_) only. Spaces and other characters are not allowed.</div></div><div className="col-12"><label className="form-label">Short Description</label><RichTextEditor value={form.shortDescription} onChange={(html) => setForm({...form, shortDescription: html})} placeholder="Short product description..." minHeight={100} /></div><div className="col-12"><label className="form-label">Description</label><RichTextEditor value={form.description} onChange={(html) => setForm({...form, description: html})} placeholder="Detailed product description..." minHeight={180} /></div></div>
        </div></div>
        <div className="card border mt-4"><div className="card-header"><strong>Product Image *</strong></div><div className="card-body"><ImageGalleryUploader value={form.imageUrl ? [form.imageUrl] : []} onChange={urls => setForm({...form,imageUrl:urls[0] ?? ""})} validation={{ exactWidth: 1200, exactHeight: 1200, maxBytes: 1024 * 1024, allowedTypes: ["image/png", "image/jpeg"] }} guidance={<><strong>Required image.</strong> <span className="text-danger">A Product cannot be saved without a product image.</span><br/><strong>Image Requirements:</strong> 1200 × 1200 px (1:1) square image, PNG/JPG/JPEG. Ideal file size: 150–400 KB. Up to ~700 KB is recommended; images above 1 MB are not accepted.</>} /></div></div>
      </div><div className="col-lg-5"><div className="card border"><div className="card-header"><strong>Price & Purchase</strong></div><div className="card-body"><div className="row g-3 mb-2"><div className="col-sm-6"><label className="form-label">MRP (₹) *</label><input className="form-control" type="number" min="0.01" step="0.01" value={form.mrp} onChange={e=>setForm({...form,mrp:Number(e.target.value)})}/><div className="form-text">Original/reference price shown to customers.</div></div><div className="col-sm-6"><label className="form-label">Selling Price (₹) *</label><input className="form-control" type="number" min="0.01" step="0.01" value={form.sellingPrice} onChange={e=>setForm({...form,sellingPrice:Number(e.target.value)})}/><div className="form-text">Actual price the customer pays.</div></div></div>{Number(form.mrp) > Number(form.sellingPrice) && Number(form.sellingPrice) > 0 && <div className="alert alert-success py-2 mb-3"><strong>Customer saving:</strong> ₹{(Number(form.mrp) - Number(form.sellingPrice)).toLocaleString("en-IN")}</div>}{form.type === "single" && form.components[0] && <div className="form-text mb-3">Default MRP and selling price are fetched from <strong>{form.components[0].productName}</strong>. You can change them for this Product.</div>}{form.type === "multiple" && <div className="form-text mb-3">Set the selling price for this combo.</div>}<div className="form-check mb-2"><input className="form-check-input" type="checkbox" id="one-time" checked={form.oneTimePurchase} onChange={e=>setForm({...form,oneTimePurchase:e.target.checked})}/><label className="form-check-label" htmlFor="one-time">Available for one-time purchase</label></div><div className="form-check"><input className="form-check-input" type="checkbox" id="subscription" checked={form.subscriptionPurchase} onChange={e=>setForm({...form,subscriptionPurchase:e.target.checked})}/><label className="form-check-label" htmlFor="subscription">Available for subscription</label></div></div></div><div className="card border mt-4"><div className="card-header"><strong>Status</strong></div><div className="card-body"><div className="form-check mb-2"><input className="form-check-input" type="checkbox" id="active" checked={form.active} onChange={e=>setForm({...form,active:e.target.checked})}/><label className="form-check-label" htmlFor="active">Active and available</label></div><div className="form-check mb-3"><input className="form-check-input" type="checkbox" id="featured" checked={form.featured} onChange={e=>setForm({...form,featured:e.target.checked})}/><label className="form-check-label" htmlFor="featured">Featured</label></div><label className="form-label">Sort order</label><input className="form-control" type="number" step="1" value={form.sortOrder} onChange={e=>setForm({...form,sortOrder:Number(e.target.value)})}/></div></div></div><div className="col-12"><div className="card border mt-4"><div className="card-header d-flex justify-content-between align-items-center"><strong>Salable Options</strong><button type="button" className="btn btn-sm btn-outline-success" onClick={addSellingOption}><i className="bi bi-plus-lg me-1" />Add More</button></div><div className="card-body"><div className="small text-muted mb-3">Add one or more packaging options with their MRP and selling price.</div>{!form.sellingOptions?.length && <div className="border rounded p-3 text-center text-muted">No salable options added. Click <strong>Add More</strong> to add one.</div>}{form.sellingOptions?.map((option, index) => <div className="row g-3 align-items-end mb-3" key={option.id || index}><div className="col-md-4"><label className="form-label">Packing *</label><select className="form-select" value={Number(option.weightGrams) || ""} onChange={e => updateSellingOption(index, { weightGrams: Number(e.target.value) })} required><option value="">Select packing</option>{packaging.map(item => <option key={item.id} value={item.size} disabled={form.sellingOptions?.some((other, otherIndex) => otherIndex !== index && Number(other.weightGrams) === Number(item.size))}>{packagingDisplay(Number(item.size))}</option>)}</select></div><div className="col-md-3"><label className="form-label">MRP (₹) *</label><input className="form-control" type="number" min="0.01" step="0.01" value={Number(option.mrp ?? 0)} onChange={e => updateSellingOption(index, { mrp: Number(e.target.value) })} required /></div><div className="col-md-3"><label className="form-label">Selling Price (₹) *</label><input className="form-control" type="number" min="0.01" step="0.01" value={Number(option.price ?? 0)} onChange={e => updateSellingOption(index, { price: Number(e.target.value) })} required /></div><div className="col-md-2"><button type="button" className="btn btn-outline-danger w-100" onClick={() => removeSellingOption(index)}><i className="bi bi-trash me-1" />Remove</button></div></div>)}</div></div></div>
        </div></div><div className="card-footer d-flex justify-content-end gap-2"><button type="button" className="btn btn-secondary" onClick={reset}>Cancel</button><button className="btn btn-success" disabled={saving || loading}>{saving ? "Saving..." : editing ? "Update Product" : "Create Product"}</button></div></div></form>}
  </div></AdminPage>;
}
