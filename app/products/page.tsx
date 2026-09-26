"use client";

import { useEffect, useMemo, useState } from "react";
import { deleteField } from "firebase/firestore";
import { AdminPage } from "@/components/admin/AdminPage";
import { createRecord, listCollection, updateRecord } from "@/lib/firestore";
import { deleteOrDeactivateProduct } from "@/lib/productService";
import type { GrowingPhase, Product, ProductStatus } from "@/types/catalog";
import {confirmAction} from "@/lib/alerts";

const FIXED_GROWING_PHASES: GrowingPhase[] = [
  { phase: "Soaking", noOfDays: 0 },
  { phase: "Dark Period", noOfDays: 3 },
  { phase: "Light Period", noOfDays: 4 },
];
const DEFAULT_GROWING_CYCLE_DAYS = FIXED_GROWING_PHASES.reduce((sum, item) => sum + item.noOfDays, 0);

function normalizeGrowingPhases(phases?: GrowingPhase[], soakingRequired = false) {
  return FIXED_GROWING_PHASES.map((fixedPhase) => {
    const existing = phases?.find((phase) => phase.phase === fixedPhase.phase);

    if (fixedPhase.phase === "Soaking") {
      return { phase: fixedPhase.phase, noOfDays: soakingRequired ? 1 : 0 };
    }

    const days = Number(existing?.noOfDays ?? fixedPhase.noOfDays);
    const maxDays = fixedPhase.phase === "Light Period" ? 15 : 5;
    return { phase: fixedPhase.phase, noOfDays: Math.min(maxDays, Math.max(0, Number.isFinite(days) ? days : fixedPhase.noOfDays)) };
  });
}

function growingCycleDays(phases: GrowingPhase[]) {
  return phases.reduce((sum, phase) => sum + Number(phase.noOfDays || 0), 0);
}

const emptyProduct: Omit<Product, "id"> = {
  name: "",
  sku: "",
  slug: "",
  category: "Microgreens",
  status: "active",
  featured: false,
  sortOrder: 0,
  // Current stock is never entered here. It comes from actual usable harvest.
  stockGrams: 0,
  lowStockThresholdGrams: 500,
  growingActive: true,
  growingPhases: normalizeGrowingPhases(),
  soakingRequired: false,
  growingCycleDays: DEFAULT_GROWING_CYCLE_DAYS,
  expectedYieldGramsPerTray: 200,
  minimumYieldGramsPerTray: 150,
  expectedLossGramsPerTray: 20,
  safetyStockGrams: 1000,
};

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z_-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

function sanitizeSlug(value: string) {
  return value.toLowerCase().replace(/[^a-z_-]/g, "");
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
      const productRows = await listCollection<Product>("products");
      setProducts(productRows);
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
    setForm({ ...emptyProduct });
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
      category: product.category ?? "Microgreens",
      stockGrams: stockValue(product),
      lowStockThresholdGrams: thresholdValue(product),
      growingActive: product.growingActive !== false,
      soakingRequired: product.soakingRequired === undefined ? true : product.soakingRequired === true,
      growingPhases: normalizeGrowingPhases(product.growingPhases, product.soakingRequired === undefined ? true : product.soakingRequired === true),
      growingCycleDays: growingCycleDays(normalizeGrowingPhases(product.growingPhases, product.soakingRequired === undefined ? true : product.soakingRequired === true)),
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
    setForm({ ...emptyProduct });
    setError("");
    setTab("list");
  }


  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError("");

    const soakingRequired = form.soakingRequired === true;
    const phases = normalizeGrowingPhases(form.growingPhases, soakingRequired);
    const cycle = growingCycleDays(phases);
    const expected = Number(form.expectedYieldGramsPerTray);
    const minimum = Number(form.minimumYieldGramsPerTray);
    const loss = Number(form.expectedLossGramsPerTray);
    const safety = Number(form.safetyStockGrams);
    const threshold = Number(form.lowStockThresholdGrams);

    if (!form.name.trim()) return setError("Product name is required.");
    if (!form.sku?.trim()) return setError("SKU / product code is required.");
    const darkPeriodDays = Number(phases.find((phase) => phase.phase === "Dark Period")?.noOfDays ?? 0);
    const lightPeriodDays = Number(phases.find((phase) => phase.phase === "Light Period")?.noOfDays ?? 0);
    const soakingDays = Number(phases.find((phase) => phase.phase === "Soaking")?.noOfDays ?? 0);
    if (soakingDays !== (soakingRequired ? 1 : 0)) return setError("Soaking days are controlled by Soaking required?.");
    if (!Number.isInteger(darkPeriodDays) || darkPeriodDays < 0 || darkPeriodDays > 5) return setError("Dark Period must be between 0 and 5 days.");
    if (!Number.isInteger(lightPeriodDays) || lightPeriodDays < 0 || lightPeriodDays > 15) return setError("Light Period must be between 0 and 15 days.");
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
      slug: sanitizeSlug(form.slug?.trim() ?? "") || slugify(form.name),
      category: form.category.trim() || "Microgreens",
      status: form.status,
      featured: Boolean(form.featured),
      sortOrder: Number(form.sortOrder ?? 0),

      // Preserve the existing stock value during an edit, but never expose it
      // as an editable field. New products start at zero until harvested.
      stockGrams: Number(form.stockGrams ?? 0),
      lowStockThresholdGrams: threshold,

      growingActive: form.growingActive !== false,
      growingPhases: phases,
      soakingRequired,
      growingCycleDays: cycle,
      expectedYieldGramsPerTray: expected,
      minimumYieldGramsPerTray: minimum,
      expectedLossGramsPerTray: loss,
      safetyStockGrams: safety,
    };

    setSaving(true);
    try {
      if (editing) {
        await updateRecord("products", editing, { ...normalized, sellingOptions: deleteField(), description: deleteField(), shortDescription: deleteField(), imageUrls: deleteField() });
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
    if (!(await confirmAction({
      title:"Delete this Microgreen?",
      text:"This action cannot be undone. If this product is referenced by a growing batch, it will be retained and deactivated instead of being permanently deleted.",
      confirmText:"Yes, delete",
    }))) return;
    try {
      const result = await deleteOrDeactivateProduct(id);
      await load();
      setError(result.action === "deactivated"
        ? "Product is referenced by a growing batch, so it was deactivated instead of deleted."
        : "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to delete product.");
    }
  }

  return (
    <AdminPage>
      <div className="container-fluid py-3">
        <div className="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-3">
          <div>
            <h1 className="h3 seedlings-brand mb-1">Microgreen</h1>
            <p className="text-muted mb-0">Microgreen Master — manage what Seedlings grows.</p>
          </div>
          {tab === "list" && (
            <button className="btn btn-success" onClick={openCreate}>
              <i className="bi bi-plus-lg me-1" />Add Microgreen
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
              <i className="bi bi-grid-3x3-gap me-1" />Microgreen
            </button>
          </li>
          <li className="nav-item">
            <button className={`nav-link ${tab === "form" ? "active" : ""}`} onClick={() => setTab("form")}>
              <i className={`bi ${editing ? "bi-pencil-square" : "bi-plus-square"} me-1`} />
              {editing ? "Edit Microgreen" : "Create Microgreen"}
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
                          <div><strong>{product.name}</strong><div className="small text-muted">{product.category}</div></div>
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
                  {!loading && !filtered.length && <tr><td colSpan={8} className="text-center text-muted py-4">No microgreens found.</td></tr>}
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
                            <input className="form-control" value={form.slug ?? ""} onChange={(e) => setForm({ ...form, slug: sanitizeSlug(e.target.value) })} placeholder="e.g. broccoli-microgreens" inputMode="text" autoCapitalize="none" spellCheck={false} /><div className="form-text">Lowercase letters, hyphen (-) and underscore (_) only. Spaces and other characters are not allowed.</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="col-lg-5">
                    <div className="card border">
                      <div className="card-header"><strong>Production Configuration</strong></div>
                      <div className="card-body">
                        <p className="small text-muted">These values drive Growing Batches and future forecasting. Expected values never become current inventory.</p>

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


                  </div>

                  <div className="col-lg-7">
                    <div className="card border">
                      <div className="card-header"><strong>Growing Phases</strong></div>
                      <div className="card-body">
                        <div className="row g-3">
                          {FIXED_GROWING_PHASES.map((phase) => {
                            const current = form.growingPhases?.find((item) => item.phase === phase.phase)?.noOfDays ?? phase.noOfDays;
                            const isSoaking = phase.phase === "Soaking";
                            const maxDays = phase.phase === "Light Period" ? 15 : 5;
                            return (
                              <div className="col-md-4" key={phase.phase}>
                                <label className="form-label">{phase.phase} (days) *</label>
                                <input
                                  className="form-control"
                                  type="number"
                                  min="0"
                                  max={maxDays}
                                  step="1"
                                  value={current}
                                  readOnly={isSoaking}
                                  onChange={(e) => {
                                    if (isSoaking) return;
                                    const value = Math.min(maxDays, Math.max(0, Number(e.target.value) || 0));
                                    const next = normalizeGrowingPhases(form.growingPhases, form.soakingRequired === true).map((item) => item.phase === phase.phase ? { ...item, noOfDays: value } : item);
                                    setForm({ ...form, growingPhases: next, growingCycleDays: growingCycleDays(next) });
                                  }}
                                  required
                                />
                                <div className="form-text">{isSoaking ? "Controlled by Soaking required?" : `Maximum ${maxDays} days.`}</div>
                              </div>
                            );
                          })}
                          <div className="col-md-4">
                            <label className="form-label">Growing cycle (days)</label>
                            <input className="form-control" type="number" value={growingCycleDays(normalizeGrowingPhases(form.growingPhases, form.soakingRequired === true))} readOnly />
                            <div className="form-text">Automatically calculated from the three phases.</div>
                          </div>
                          <div className="col-md-4 d-flex align-items-end">
                            <div className="form-check mb-2">
                              <input className="form-check-input" id="soaking-required" type="checkbox" checked={form.soakingRequired === true} onChange={(e) => {
                                const soakingRequired = e.target.checked;
                                const next = normalizeGrowingPhases(form.growingPhases, soakingRequired);
                                setForm({ ...form, soakingRequired, growingPhases: next, growingCycleDays: growingCycleDays(next) });
                              }} />
                              <label className="form-check-label" htmlFor="soaking-required">Soaking required?</label>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="col-lg-5">
                    <div className="card border mt-4">
                      <div className="card-header"><strong>Current Inventory</strong></div>
                      <div className="card-body">
                        <div className="alert alert-light border mb-3">
                          <div className="small text-muted">Actual usable stock</div>
                          <div className="h4 mb-1">{stockValue(form as Product).toLocaleString()} gms</div>
                          <div className="small">This value is updated by actual harvest. It cannot be edited from Microgreen.</div>
                        </div>
                        <label className="form-label">Low-stock threshold (gms) *</label>
                        <input className="form-control" type="number" min="0" step="1" value={form.lowStockThresholdGrams} onChange={(e) => setForm({ ...form, lowStockThresholdGrams: Number(e.target.value) })} />
                      </div>
                    </div>


                  </div>

                  <div className="col-12">
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
                <button className="btn btn-success" disabled={saving || loading}>{saving ? "Saving..." : editing ? "Update Microgreen" : "Create Microgreen"}</button>
              </div>
            </div>
          </form>
        )}
      </div>
    </AdminPage>
  );
}
