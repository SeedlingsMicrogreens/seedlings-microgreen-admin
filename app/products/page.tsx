"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminPage } from "@/components/admin/AdminPage";
import { ImageGalleryUploader } from "@/components/ui/ImageGalleryUploader";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { createRecord, deleteRecord, listCollection, updateRecord } from "@/lib/firestore";
import type { Product, ProductStatus } from "@/types/catalog";
import {confirmAction} from "@/lib/alerts";

const emptyProduct: Omit<Product, "id"> = {
  name: "",
  sku: "",
  slug: "",
  description: "",
  shortDescription: "",
  category: "Microgreens",
  imageUrls: [],
  status: "active",
  featured: false,
  sortOrder: 0,
  // Current stock is never entered here. It comes from actual usable harvest.
  stockGrams: 0,
  lowStockThresholdGrams: 500,
  growingActive: true,
  growingCycleDays: 7,
  expectedYieldGramsPerTray: 200,
  minimumYieldGramsPerTray: 150,
  expectedLossGramsPerTray: 20,
  safetyStockGrams: 1000,
};

function stripHtml(value: string) {
  return value.replace(/<[^>]*>/g, "").trim();
}

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function stockValue(product: Product) {
  return Number(product.stockGrams ?? product.stock ?? 0) || 0;
}

function thresholdValue(product: Product) {
  return Number(product.lowStockThresholdGrams ?? product.lowStockThreshold ?? 0) || 0;
}

function statusLabel(status: ProductStatus) {
  return status.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function statusClass(status: ProductStatus) {
  if (status === "active") return "success";
  if (status === "out_of_stock") return "warning";
  if (status === "coming_soon") return "info";
  return "secondary";
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [form, setForm] = useState(emptyProduct);
  const [editing, setEditing] = useState<string | null>(null);
  const [tab, setTab] = useState<"list" | "form">("list");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | ProductStatus>("all");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setProducts(await listCollection<Product>("products"));
      setError("");
    } catch {
      setError("Unable to load products. Check Firestore rules/indexes.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((product) => {
      const matchesSearch = !q ||
        product.name.toLowerCase().includes(q) ||
        String(product.sku ?? "").toLowerCase().includes(q) ||
        String(product.category ?? "").toLowerCase().includes(q);
      const matchesStatus = statusFilter === "all" || product.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [products, search, statusFilter]);

  function openCreate() {
    setEditing(null);
    setForm({ ...emptyProduct, imageUrls: [] });
    setError("");
    setTab("form");
  }

  function openEdit(product: Product) {
    setEditing(product.id);
    setForm({
      ...emptyProduct,
      ...product,
      name: product.name ?? "",
      sku: product.sku ?? "",
      slug: product.slug ?? "",
      description: product.description ?? "",
      shortDescription: product.shortDescription ?? "",
      category: product.category ?? "Microgreens",
      imageUrls: Array.isArray(product.imageUrls) ? product.imageUrls : [],
      stockGrams: stockValue(product),
      lowStockThresholdGrams: thresholdValue(product),
      growingActive: product.growingActive !== false,
      growingCycleDays: Number(product.growingCycleDays ?? 0),
      expectedYieldGramsPerTray: Number(product.expectedYieldGramsPerTray ?? product.expectedYieldGramsPerBatch ?? 0),
      minimumYieldGramsPerTray: Number(product.minimumYieldGramsPerTray ?? product.minimumBatchYieldGrams ?? 0),
      expectedLossGramsPerTray: Number(product.expectedLossGramsPerTray ?? 0),
      safetyStockGrams: Number(product.safetyStockGrams ?? 0),
    });
    setError("");
    setTab("form");
  }

  function cancel() {
    setEditing(null);
    setForm({ ...emptyProduct, imageUrls: [] });
    setError("");
    setTab("list");
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError("");

    const cycle = Number(form.growingCycleDays);
    const expected = Number(form.expectedYieldGramsPerTray);
    const minimum = Number(form.minimumYieldGramsPerTray);
    const loss = Number(form.expectedLossGramsPerTray);
    const safety = Number(form.safetyStockGrams);
    const threshold = Number(form.lowStockThresholdGrams);

    if (!form.name.trim()) return setError("Product name is required.");
    if (!form.sku?.trim()) return setError("SKU / product code is required.");
    if (!stripHtml(form.shortDescription)) return setError("Short description is required.");
    if (!stripHtml(form.description)) return setError("Description is required.");
    if (!Number.isInteger(cycle) || cycle <= 0) return setError("Growing cycle must be at least 1 whole day.");
    if (!Number.isInteger(expected) || expected <= 0) return setError("Expected yield per tray must be greater than 0.");
    if (!Number.isInteger(minimum) || minimum < 0) return setError("Minimum yield per tray cannot be negative.");
    if (minimum > expected) return setError("Minimum yield per tray cannot be greater than expected yield.");
    if (!Number.isInteger(loss) || loss < 0) return setError("Expected loss per tray cannot be negative.");
    if (!Number.isInteger(safety) || safety < 0) return setError("Safety stock cannot be negative.");
    if (!Number.isInteger(threshold) || threshold < 0) return setError("Low-stock threshold cannot be negative.");

    const duplicateSku = products.some((product) =>
      product.id !== editing && String(product.sku ?? "").trim().toLowerCase() === form.sku!.trim().toLowerCase()
    );
    if (duplicateSku) return setError("SKU / product code must be unique.");

    const normalized = {
      name: form.name.trim(),
      sku: form.sku!.trim(),
      slug: form.slug?.trim() || slugify(form.name),
      description: form.description,
      shortDescription: form.shortDescription,
      category: form.category.trim() || "Microgreens",
      imageUrls: form.imageUrls.filter(Boolean),
      status: form.status,
      featured: Boolean(form.featured),
      sortOrder: Number(form.sortOrder ?? 0),

      // Preserve the existing stock value during an edit, but never expose it
      // as an editable field. New products start at zero until harvested.
      stockGrams: Number(form.stockGrams ?? 0),
      lowStockThresholdGrams: threshold,

      growingActive: form.growingActive !== false,
      growingCycleDays: cycle,
      expectedYieldGramsPerTray: expected,
      minimumYieldGramsPerTray: minimum,
      expectedLossGramsPerTray: loss,
      safetyStockGrams: safety,
    };

    setSaving(true);
    try {
      if (editing) {
        await updateRecord("products", editing, normalized);
      } else {
        await createRecord("products", normalized);
      }
      await load();
      cancel();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save product.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!(await confirmAction({title:"Delete this production product?",text:"Only delete a product when it has no dependent production or sales records.",confirmText:"Yes, delete"}))) return;
    try {
      await deleteRecord("products", id);
      await load();
    } catch {
      setError("Unable to delete product.");
    }
  }

  return (
    <AdminPage>
      <div className="container-fluid py-3">
        <div className="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-3">
          <div>
            <h1 className="h3 seedlings-brand mb-1">Products</h1>
            <p className="text-muted mb-0">Production Product Master — manage what Seedlings grows.</p>
          </div>
          {tab === "list" && (
            <button className="btn btn-success" onClick={openCreate}>
              <i className="bi bi-plus-lg me-1" />Add Product
            </button>
          )}
        </div>

        {error && <div className="alert alert-danger">{error}</div>}

        <div className="alert alert-info d-flex gap-2 align-items-start">
          <i className="bi bi-info-circle mt-1" />
          <div>
            <strong>Stock is actual harvested usable quantity.</strong>
            <div className="small">Expected production is used for planning/forecasting. It is not counted as current stock.</div>
          </div>
        </div>

        <ul className="nav nav-tabs mb-3">
          <li className="nav-item">
            <button className={`nav-link ${tab === "list" ? "active" : ""}`} onClick={() => setTab("list")}>
              <i className="bi bi-grid-3x3-gap me-1" />Product Master
            </button>
          </li>
          <li className="nav-item">
            <button className={`nav-link ${tab === "form" ? "active" : ""}`} onClick={() => setTab("form")}>
              <i className={`bi ${editing ? "bi-pencil-square" : "bi-plus-square"} me-1`} />
              {editing ? "Edit Product" : "Create Product"}
            </button>
          </li>
        </ul>

        {tab === "list" ? (
          <div className="card">
            <div className="card-header">
              <div className="row g-2 align-items-center">
                <div className="col-md-7">
                  <div className="input-group">
                    <span className="input-group-text"><i className="bi bi-search" /></span>
                    <input className="form-control" placeholder="Search by product, SKU or category..." value={search} onChange={(e) => setSearch(e.target.value)} />
                  </div>
                </div>
                <div className="col-md-3">
                  <select className="form-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}>
                    <option value="all">All statuses</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="out_of_stock">Out of stock</option>
                    <option value="coming_soon">Coming soon</option>
                  </select>
                </div>
                <div className="col-md-2 text-md-end text-muted small">{filtered.length} of {products.length}</div>
              </div>
            </div>

            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>SKU</th>
                    <th>Cycle</th>
                    <th>Expected / Tray</th>
                    <th>Expected Loss / Tray</th>
                    <th>Actual Stock</th>
                    <th>Status</th>
                    <th className="text-end">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={8} className="text-center text-muted py-4">Loading products...</td></tr>
                  ) : filtered.map((product) => {
                    const stock = stockValue(product);
                    const threshold = thresholdValue(product);
                    return (
                      <tr key={product.id}>
                        <td>
                          <div className="d-flex align-items-center gap-2">
                            {product.imageUrls?.[0] ? (
                              <img src={product.imageUrls[0]} alt="" style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 6 }} />
                            ) : (
                              <div className="border rounded d-flex align-items-center justify-content-center text-muted" style={{ width: 48, height: 48 }}><i className="bi bi-seedling" /></div>
                            )}
                            <div><strong>{product.name}</strong><div className="small text-muted">{product.category}</div></div>
                          </div>
                        </td>
                        <td>{product.sku || "—"}</td>
                        <td>{Number(product.growingCycleDays ?? 0)} days</td>
                        <td>{Number(product.expectedYieldGramsPerTray ?? 0).toLocaleString()} gms</td>
                        <td>{Number(product.expectedLossGramsPerTray ?? 0).toLocaleString()} gms</td>
                        <td className={stock <= threshold ? "text-danger fw-bold" : "fw-semibold"}>{stock.toLocaleString()} gms</td>
                        <td><span className={`badge text-bg-${statusClass(product.status)}`}>{statusLabel(product.status)}</span></td>
                        <td className="text-end">
                          <div className="btn-group btn-group-sm">
                            <button className="btn btn-outline-secondary" onClick={() => openEdit(product)} title="Edit"><i className="bi bi-pencil" /></button>
                            <button className="btn btn-outline-danger" onClick={() => void remove(product.id)} title="Delete"><i className="bi bi-trash" /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {!loading && !filtered.length && <tr><td colSpan={8} className="text-center text-muted py-4">No production products found.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <form onSubmit={save}>
            <div className="card">
              <div className="card-body">
                <div className="row g-4">
                  <div className="col-lg-7">
                    <div className="card border">
                      <div className="card-header"><strong>Basic Information</strong></div>
                      <div className="card-body">
                        <div className="row g-3">
                          <div className="col-md-8">
                            <label className="form-label">Product name *</label>
                            <input className="form-control" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                          </div>
                          <div className="col-md-4">
                            <label className="form-label">SKU / Code *</label>
                            <input className="form-control" value={form.sku ?? ""} onChange={(e) => setForm({ ...form, sku: e.target.value })} placeholder="e.g. BR-001" required />
                          </div>
                          <div className="col-md-8">
                            <label className="form-label">Category</label>
                            <input className="form-control" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
                          </div>
                          <div className="col-md-4">
                            <label className="form-label">Slug</label>
                            <input className="form-control" value={form.slug ?? ""} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="Auto-generated if empty" />
                          </div>
                        </div>
                        <div className="mt-3">
                          <label className="form-label">Short description *</label>
                          <RichTextEditor value={form.shortDescription} onChange={(html) => setForm({ ...form, shortDescription: html })} placeholder="Short product description..." minHeight={100} />
                        </div>
                        <div className="mt-3">
                          <label className="form-label">Description *</label>
                          <RichTextEditor value={form.description} onChange={(html) => setForm({ ...form, description: html })} placeholder="Detailed product description..." minHeight={180} />
                        </div>
                      </div>
                    </div>

                    <div className="card border mt-4">
                      <div className="card-header"><strong>Product Images</strong></div>
                      <div className="card-body">
                        <ImageGalleryUploader value={form.imageUrls} onChange={(imageUrls) => setForm({ ...form, imageUrls })} />
                      </div>
                    </div>
                  </div>

                  <div className="col-lg-5">
                    <div className="card border">
                      <div className="card-header"><strong>Production Configuration</strong></div>
                      <div className="card-body">
                        <p className="small text-muted">These values drive Growing Batches and future forecasting. Expected values never become current inventory.</p>

                        <label className="form-label">Growing cycle (days) *</label>
                        <input className="form-control mb-3" type="number" min="1" step="1" value={form.growingCycleDays} onChange={(e) => setForm({ ...form, growingCycleDays: Number(e.target.value) })} />

                        <label className="form-label">Expected usable yield / tray (gms) *</label>
                        <input className="form-control mb-3" type="number" min="1" step="1" value={form.expectedYieldGramsPerTray} onChange={(e) => setForm({ ...form, expectedYieldGramsPerTray: Number(e.target.value) })} />

                        <label className="form-label">Minimum yield / tray (gms) *</label>
                        <input className="form-control mb-3" type="number" min="0" step="1" value={form.minimumYieldGramsPerTray} onChange={(e) => setForm({ ...form, minimumYieldGramsPerTray: Number(e.target.value) })} />

                        <label className="form-label">Expected loss / tray (gms) *</label>
                        <input className="form-control mb-3" type="number" min="0" step="1" value={form.expectedLossGramsPerTray} onChange={(e) => setForm({ ...form, expectedLossGramsPerTray: Number(e.target.value) })} />

                        <label className="form-label">Safety stock (gms) *</label>
                        <input className="form-control mb-3" type="number" min="0" step="1" value={form.safetyStockGrams} onChange={(e) => setForm({ ...form, safetyStockGrams: Number(e.target.value) })} />

                        <div className="form-check">
                          <input className="form-check-input" id="growing-active" type="checkbox" checked={form.growingActive} onChange={(e) => setForm({ ...form, growingActive: e.target.checked })} />
                          <label className="form-check-label" htmlFor="growing-active">Available for growing</label>
                        </div>
                      </div>
                    </div>

                    <div className="card border mt-4">
                      <div className="card-header"><strong>Current Inventory</strong></div>
                      <div className="card-body">
                        <div className="alert alert-light border mb-3">
                          <div className="small text-muted">Actual usable stock</div>
                          <div className="h4 mb-1">{stockValue(form as Product).toLocaleString()} gms</div>
                          <div className="small">This value is updated by actual harvest. It cannot be edited from Product Master.</div>
                        </div>
                        <label className="form-label">Low-stock threshold (gms) *</label>
                        <input className="form-control" type="number" min="0" step="1" value={form.lowStockThresholdGrams} onChange={(e) => setForm({ ...form, lowStockThresholdGrams: Number(e.target.value) })} />
                      </div>
                    </div>

                    <div className="card border mt-4">
                      <div className="card-header"><strong>Status</strong></div>
                      <div className="card-body">
                        <label className="form-label">Product status</label>
                        <select className="form-select mb-3" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ProductStatus })}>
                          <option value="active">Active</option>
                          <option value="inactive">Inactive</option>
                          <option value="out_of_stock">Out of stock</option>
                          <option value="coming_soon">Coming soon</option>
                        </select>
                        <div className="form-check">
                          <input className="form-check-input" id="featured-product" type="checkbox" checked={Boolean(form.featured)} onChange={(e) => setForm({ ...form, featured: e.target.checked })} />
                          <label className="form-check-label" htmlFor="featured-product">Featured</label>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="card-footer d-flex justify-content-end gap-2">
                <button type="button" className="btn btn-secondary" onClick={cancel}>Cancel</button>
                <button className="btn btn-success" disabled={saving || loading}>{saving ? "Saving..." : editing ? "Update Product" : "Create Product"}</button>
              </div>
            </div>
          </form>
        )}
      </div>
    </AdminPage>
  );
}
