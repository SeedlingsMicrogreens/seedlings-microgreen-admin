"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminPage } from "@/components/admin/AdminPage";
import { useAuth } from "@/components/auth/AuthProvider";
import { listCollection } from "@/lib/firestore";
import {
  completeGrowingBatchItemPhase,
  harvestGrowingBatch,
  startGrowingBatchItemPhase,
  buildBatchItem,
  calculateGrowingPhaseDates,
  createGrowingBatch,
  harvestGrowingBatchItem,
  markGrowingBatchDelivered,
} from "@/lib/growingBatchService";
import { confirmAction, showError, showSuccess } from "@/lib/alerts";
import type { Product } from "@/types/catalog";
import type { GrowingBatch, GrowingBatchItem, GrowingBatchPhaseStatus } from "@/types/growingBatch";
import type { Location } from "@/types/location";
import type { Order } from "@/types/order";
import type { SalesProduct } from "@/types/salesProduct";
import type { Subscription } from "@/types/subscription";

function today() { return new Date().toISOString().slice(0, 10); }
function formatDate(v?: string) {
  if (!v) return "—";
  const d = new Date(`${v}T00:00:00`);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
function statusLabel(v: string) {
  return v.replaceAll("_", " ").replace(/\b\w/g, c => c.toUpperCase());
}
function batchStatusClass(v: string) {
  return v === "completed_harvested" ? "success" : v === "in_progress" ? "warning" : v === "closed" ? "secondary" : "danger";
}
function phaseCircleClass(status: GrowingBatchPhaseStatus) {
  if (status === "completed") return "bg-success";
  if (status === "in_progress") return "bg-warning";
  if (status === "na") return "bg-secondary";
  return "bg-danger";
}
function phaseStatusLabel(status: GrowingBatchPhaseStatus) {
  if (status === "na") return "NA";
  if (status === "not_started") return "Not Started";
  if (status === "in_progress") return "In Progress";
  return "Completed";
}

function normalizeLegacyBatch(batch: GrowingBatch): GrowingBatch {
  return {
    ...batch,
    status:
      (batch.status as string) === "completed" ? "completed_harvested" :
      (batch.status as string) === "partially_harvested" || (batch.status as string) === "growing" ? "in_progress" :
      (batch.status as string) === "planned" ? "not_started" : batch.status,
    items: (batch.items ?? []).map(item => {
      if ((item.status as string) === "harvested") {
        const gross = Number(item.actualHarvestGrams ?? item.actualYieldGrams ?? 0);
        const loss = Number(item.wastageGrams ?? 0);
        return {
          ...item,
          actualHarvestGrams: gross,
          actualYieldGrams: Math.max(0, gross - loss),
          status: "completed_harvested",
          phases: item.phases ?? {
            soaking: { status: "not_started" },
            darkPeriod: { status: "not_started" },
            lightPeriod: { status: "completed" },
          },
        };
      }
      return {
        ...item,
        status: (item.status as string) === "growing" || (item.status as string) === "ready" ? "in_progress" : item.status,
      };
    }),
  };
}

function salesProductDemandGrams(
  salesProduct: SalesProduct | undefined,
  requestedWeightGrams: number | undefined,
  quantity: number,
) {
  if (!salesProduct) return [];
  const components = salesProduct.components ?? [];
  if (!components.length) return [];

  // Order items carry the actual selected package weight. Scale combo component
  // shares to that package when available.
  const baseTotal = components.reduce((sum, c) => sum + Number(c.quantityGrams || 0), 0);
  const selectedWeight = Number(requestedWeightGrams || baseTotal);
  return components.map(component => ({
    productId: component.productId,
    grams: baseTotal > 0
      ? (selectedWeight * Number(component.quantityGrams || 0) / baseTotal) * quantity
      : 0,
  }));
}

function calculateDemand(
  harvestDate: string,
  orders: Order[],
  subscriptions: Subscription[],
  salesProducts: SalesProduct[],
) {
  const demand = new Map<string, number>();
  const salesMap = new Map(salesProducts.map(p => [p.id, p]));

  const selectedOrders = orders.filter(order =>
    order.scheduledDeliveryDate === harvestDate &&
    (order.paymentStatus === "paid" || order.paymentStatus === "partially_paid") &&
    order.status !== "cancelled" &&
    !order.requiresCustomerContact
  );

  const subscriptionOrderIds = new Set(
    selectedOrders
      .filter(order => order.orderType === "subscription" && order.sourceSubscriptionId)
      .map(order => order.sourceSubscriptionId as string)
  );

  for (const order of selectedOrders) {
    for (const item of order.items ?? []) {
      const salesProduct = salesMap.get(item.salableProductId || item.productId);
      const parts = salesProductDemandGrams(salesProduct, item.weightGrams, Number(item.quantity || 0));
      if (parts.length) {
        for (const part of parts) demand.set(part.productId, (demand.get(part.productId) ?? 0) + part.grams);
      } else if (item.weightGrams) {
        demand.set(item.productId, (demand.get(item.productId) ?? 0) + Number(item.weightGrams) * Number(item.quantity || 0));
      }
    }
  }

  // Some future subscription deliveries may not yet have generated an order.
  // Include those active subscriptions only when there is no corresponding
  // subscription order already counted for this date.
  for (const subscription of subscriptions) {
    if (subscription.status !== "active" || subscription.nextDeliveryDate !== harvestDate) continue;
    if (subscriptionOrderIds.has(subscription.id)) continue;

    const salesProduct = salesMap.get(subscription.productId);
    const parts = salesProductDemandGrams(salesProduct, subscription.weightGrams, Number(subscription.quantity || 0));
    if (parts.length) {
      for (const part of parts) demand.set(part.productId, (demand.get(part.productId) ?? 0) + part.grams);
    }
  }

  return demand;
}

export default function GrowingBatchesPage() {
  const { user } = useAuth();
  const [batches, setBatches] = useState<GrowingBatch[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [salesProducts, setSalesProducts] = useState<SalesProduct[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [tab, setTab] = useState<"list" | "create" | "view">("list");
  const [selected, setSelected] = useState<GrowingBatch | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [b, p, l, o, sp, sub] = await Promise.all([
        listCollection<GrowingBatch>("growingBatches"),
        listCollection<Product>("products"),
        listCollection<Location>("locations"),
        listCollection<Order>("orders"),
        listCollection<SalesProduct>("salesProducts"),
        listCollection<Subscription>("subscriptions"),
      ]);
      setBatches(b.map(normalizeLegacyBatch));
      setProducts(p);
      setLocations(l);
      setOrders(o);
      setSalesProducts(sp);
      setSubscriptions(sub);
      setError("");
    } catch {
      setError("Unable to load growing batches. Check Firestore rules/indexes.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  function openView(batch: GrowingBatch) {
    setSelected(normalizeLegacyBatch(batch));
    setError("");
    setTab("view");
  }

  return <AdminPage><div className="container-fluid py-3">
    <div className="d-flex flex-wrap justify-content-between align-items-end gap-3 mb-3">
      <div>
        <h1 className="h3 seedlings-brand mb-1">Growing Batches</h1>
        <p className="text-muted mb-0">Plan production from the selected harvest date and track every microgreen through Soaking, Dark Period, Light Period and Harvest.</p>
      </div>
      {tab === "list" && <button className="btn btn-success" onClick={() => { setError(""); setTab("create"); }}>
        <i className="bi bi-plus-lg me-1" />New Batch
      </button>}
    </div>

    {error && <div className="alert alert-danger">{error}</div>}

    <ul className="nav nav-tabs mb-3">
      <li className="nav-item">
        <button className={`nav-link ${tab === "list" ? "active" : ""}`} onClick={() => setTab("list")}>
          <i className="bi bi-list-ul me-1" />Batches
        </button>
      </li>
      {tab !== "list" && <li className="nav-item">
        <button className="nav-link active">
          <i className="bi bi-seedling me-1" />{tab === "create" ? "New Batch" : selected?.batchNumber}
        </button>
      </li>}
    </ul>

    {tab === "list" && <BatchList batches={batches} loading={loading} onView={openView} />}
    {tab === "create" && user && <CreateBatch
      products={products}
      locations={locations}
      orders={orders}
      subscriptions={subscriptions}
      salesProducts={salesProducts}
      uid={user.uid}
      email={user.email ?? undefined}
      onCancel={() => setTab("list")}
      onCreated={async () => { await load(); setTab("list"); }}
      onError={setError}
    />}
    {tab === "view" && selected && user && <BatchDetails
      batch={selected}
      uid={user.uid}
      email={user.email ?? undefined}
      onBack={() => setTab("list")}
      onSaved={async () => {
        await load();
        const fresh = (await listCollection<GrowingBatch>("growingBatches")).find(b => b.id === selected.id);
        setSelected(fresh ? normalizeLegacyBatch(fresh) : selected);
      }}
      onError={setError}
    />}
  </div></AdminPage>;
}

function BatchList({ batches, loading, onView }: {
  batches: GrowingBatch[];
  loading: boolean;
  onView: (b: GrowingBatch) => void;
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return batches.filter(b =>
      (status === "all" || b.status === status) &&
      (!q || [b.batchNumber, b.locationName, ...b.items.map(i => i.productName)].join(" ").toLowerCase().includes(q))
    );
  }, [batches, search, status]);

  return <div className="card">
    <div className="card-header">
      <div className="row g-2 align-items-center">
        <div className="col-md-7">
          <div className="input-group">
            <span className="input-group-text"><i className="bi bi-search" /></span>
            <input className="form-control" placeholder="Search batch, microgreen or location..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
        <div className="col-md-3">
          <select className="form-select" value={status} onChange={e => setStatus(e.target.value)}>
            <option value="all">All statuses</option>
            <option value="not_started">Not Started</option>
            <option value="in_progress">In Progress</option>
            <option value="completed_harvested">Completed/Harvested</option>
            <option value="closed">Closed</option>
          </select>
        </div>
        <div className="col-md-2 text-md-end small text-muted">{filtered.length} batches</div>
      </div>
    </div>
    <div className="table-responsive"><table className="table table-hover align-middle mb-0">
      <thead><tr>
        <th>Batch</th><th>Microgreens</th><th>Location</th><th>Harvest Date</th><th>Expected</th><th>Harvested</th><th>Status</th><th className="text-end">Action</th>
      </tr></thead>
      <tbody>
        {filtered.map(batch => {
          const expected = batch.items.reduce((n, i) => n + i.expectedYieldGrams, 0);
          const harvested = batch.items.reduce((n, i) => n + (i.actualYieldGrams ?? 0), 0);
          return <tr key={batch.id}>
            <td><strong>{batch.batchNumber}</strong></td>
            <td>{batch.items.map(i => <span className="badge text-bg-light me-1" key={i.id}>{i.productName} · {i.trayCount} trays</span>)}</td>
            <td>{batch.locationName || "—"}</td>
            <td>{formatDate(batch.harvestDate || batch.startDate)}</td>
            <td>{expected.toLocaleString()} gms</td>
            <td>{harvested.toLocaleString()} gms</td>
            <td><span className={`badge text-bg-${batchStatusClass(batch.status)}`}>{statusLabel(batch.status)}</span></td>
            <td className="text-end"><button className="btn btn-sm btn-outline-primary" onClick={() => onView(batch)}>
              <i className="bi bi-eye me-1" />View Status
            </button></td>
          </tr>;
        })}
        {!filtered.length && !loading && <tr><td colSpan={8} className="text-center text-muted py-5"><i className="bi bi-seedling fs-2 d-block mb-2" />No growing batches found.</td></tr>}
        {loading && <tr><td colSpan={8} className="text-center py-5"><span className="spinner-border spinner-border-sm me-2" />Loading...</td></tr>}
      </tbody>
    </table></div>
  </div>;
}

function CreateBatch({
  products, locations, orders, subscriptions, salesProducts, uid, email, onCancel, onCreated, onError,
}: {
  products: Product[];
  locations: Location[];
  orders: Order[];
  subscriptions: Subscription[];
  salesProducts: SalesProduct[];
  uid: string;
  email?: string;
  onCancel: () => void;
  onCreated: () => Promise<void>;
  onError: (x: string) => void;
}) {
  const [harvestDate, setHarvestDate] = useState(today());
  const [locationId, setLocationId] = useState("");
  const [trayCounts, setTrayCounts] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  const activeProducts = products.filter(p =>
    p.status !== "inactive" &&
    p.growingActive !== false &&
    Number(p.growingCycleDays ?? 0) > 0 &&
    Number(p.expectedYieldGramsPerTray ?? p.expectedYieldGramsPerBatch ?? 0) > 0
  );
  const activeLocations = locations.filter(l => l.active);
  const demand = useMemo(
    () => calculateDemand(harvestDate, orders, subscriptions, salesProducts),
    [harvestDate, orders, subscriptions, salesProducts]
  );

  const rows = useMemo(() => activeProducts.map(product => {
    const required = Math.ceil(demand.get(product.id) ?? 0);
    const expectedYield = Math.max(1, Number(product.expectedYieldGramsPerTray ?? 0));
    const calculatedTrays = required > 0 ? Math.ceil(required / expectedYield) : 0;
    const trays = trayCounts[product.id] ?? calculatedTrays;
    return { product, required, calculatedTrays, trays };
  }), [activeProducts, demand, trayCounts]);

  const selectedProducts = rows.filter(row => row.trays > 0);

  function updateTray(productId: string, value: number) {
    setTrayCounts(current => ({ ...current, [productId]: Math.max(0, Math.round(value || 0)) }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    onError("");
    if (!selectedProducts.length) return onError("No trays are planned. Select at least one microgreen or wait for delivery demand to calculate.");
    if (!locationId) return onError("Select a growing location.");
    setSaving(true);
    try {
      const location = locations.find(l => l.id === locationId);
      const items = selectedProducts.map(row => buildBatchItem(row.product, harvestDate, row.trays));
      const batchNumber = `B-${new Date().getTime().toString().slice(-6)}`;
      await createGrowingBatch({
        batchNumber,
        harvestDate,
        startDate: items.map(item => item.startDate).sort()[0],
        locationId,
        locationName: location?.name,
        items,
        uid,
        email,
      });
      await onCreated();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Unable to create batch.");
    } finally {
      setSaving(false);
    }
  }

  return <form onSubmit={save}>
    <div className="card">
      <div className="card-header"><h3 className="card-title mb-0">Create Growing Batch</h3></div>
      <div className="card-body">
        <div className="row g-4">
          <div className="col-lg-8">
            <div className="card border h-100">
              <div className="card-header"><strong>Growing Information</strong></div>
              <div className="card-body">
                <div className="row g-3">
                  <div className="col-md-6">
                    <label className="form-label">Harvest date *</label>
                    <input className="form-control" type="date" value={harvestDate} onChange={e => setHarvestDate(e.target.value)} required />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label">Growing location *</label>
                    <select className="form-select" value={locationId} onChange={e => setLocationId(e.target.value)} required>
                      <option value="">Select location...</option>
                      {activeLocations.map(l => <option key={l.id} value={l.id}>{l.name} · {statusLabel(l.type)}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="col-lg-4">
            <div className="card border h-100">
              <div className="card-header"><strong>Production Summary</strong></div>
              <div className="card-body">
                <div className="small text-muted mb-2">Calculated from active one-time orders and subscription deliveries for {formatDate(harvestDate)}.</div>
                {selectedProducts.length
                  ? selectedProducts.map(row => <div className="border-bottom py-2" key={row.product.id}>
                      <div className="d-flex justify-content-between"><strong>{row.product.name}</strong><span>{row.trays} trays</span></div>
                      <div className="small text-muted">Required {row.required.toLocaleString()} gms · Planned { (row.trays * Number(row.product.expectedYieldGramsPerTray || 0)).toLocaleString()} gms</div>
                    </div>)
                  : <div className="text-muted">No trays selected.</div>}
                <div className="pt-3"><strong>Start date</strong><div>{selectedProducts.length ? formatDate(selectedProducts.map(row => calculateGrowingPhaseDates(row.product, harvestDate).startDate).sort()[0]) : "—"}</div></div>
              </div>
            </div>
          </div>

          <div className="col-12">
            <div className="card border">
              <div className="card-header d-flex justify-content-between align-items-center">
                <strong>Microgreens</strong>
                <span className="small text-muted">100%</span>
              </div>
              <div className="card-body">
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <label className="form-label mb-0">Microgreens and trays *</label>
                  <span className="small text-muted">Trays are calculated from delivery demand; you can change them.</span>
                </div>
                <div className="border rounded overflow-hidden">
                  <div className="table-responsive"><table className="table table-sm align-middle mb-0">
                    <thead><tr><th>Microgreen</th><th>Cycle</th><th>Required</th><th>Expected / tray</th><th>Soaking</th><th>Dark</th><th>Light</th><th style={{ width: 110 }}>Trays</th></tr></thead>
                    <tbody>
                      {rows.map(({ product, required, calculatedTrays, trays }) => {
                        const phases = calculateGrowingPhaseDates(product, harvestDate);
                        return <tr key={product.id}>
                          <td><strong>{product.name}</strong></td>
                          <td>{product.growingCycleDays} days</td>
                          <td>{required.toLocaleString()} gms{calculatedTrays > 0 && <div className="small text-muted">{calculatedTrays} trays</div>}</td>
                          <td>{Number(product.expectedYieldGramsPerTray).toLocaleString()} gms</td>
                          <td>{formatDate(phases.soaking.date)}{phases.soaking.status === "na" && <div className="small text-muted">NA</div>}</td>
                          <td>{formatDate(phases.darkPeriod.date)}</td>
                          <td>{formatDate(phases.lightPeriod.date)}</td>
                          <td><input className="form-control form-control-sm" type="number" min="0" step="1" value={trays} onChange={e => updateTray(product.id, Number(e.target.value))} /></td>
                        </tr>;
                      })}
                      {!rows.length && <tr><td colSpan={8} className="text-center text-muted py-4">No microgreens are ready for growing. Configure Growing Phases and Expected Yield per tray in Microgreen first.</td></tr>}
                    </tbody>
                  </table></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="card-footer d-flex justify-content-end gap-2">
        <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
        <button className="btn btn-success" disabled={saving}>{saving ? "Creating..." : "Create Batch"}</button>
      </div>
    </div>
  </form>;
}

function phaseActualDate(value?: string) {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : formatDate(d.toISOString().slice(0, 10));
}

function PhaseCell({
  phase,
  canStart,
  onStart,
  onEnd,
  disabled,
}: {
  phase?: { status: GrowingBatchPhaseStatus; date?: string; startedAt?: string; endedAt?: string };
  canStart: boolean;
  onStart: () => void;
  onEnd: () => void;
  disabled?: boolean;
}) {
  const status = phase?.status ?? "not_started";
  if (status === "na") return <div className="text-center"><span className="small text-muted">—</span></div>;

  return <div className="text-center">
    <div className="fw-semibold">{phaseStatusLabel(status)}</div>
    {status === "not_started" && <div className="small text-muted">Planned {formatDate(phase?.date)}</div>}
    {status === "in_progress" && <div className="small text-muted">Start {phaseActualDate(phase?.startedAt)}</div>}
    {status === "completed" && <div className="small text-muted">Start {phaseActualDate(phase?.startedAt)} · End {phaseActualDate(phase?.endedAt)}</div>}
    <span className={`rounded-circle d-inline-block mt-1 ${phaseCircleClass(status)}`} style={{ width: 12, height: 12 }} title={phaseStatusLabel(status)} />
    {status === "not_started" && canStart && <div className="mt-1">
      <button type="button" className="btn btn-sm btn-primary" disabled={disabled} onClick={onStart}>Start</button>
    </div>}
    {status === "in_progress" && <div className="mt-1">
      <button type="button" className="btn btn-sm btn-success" disabled={disabled} onClick={onEnd}>End</button>
    </div>}
  </div>;
}

function BatchDetails({ batch, uid, email, onBack, onSaved, onError }: {
  batch: GrowingBatch;
  uid: string;
  email?: string;
  onBack: () => void;
  onSaved: () => Promise<void>;
  onError: (x: string) => void;
}) {
  const [harvestValues, setHarvestValues] = useState<Record<string, number>>({});
  const [harvesting, setHarvesting] = useState(false);
  const [savingPhase, setSavingPhase] = useState<string | null>(null);

  const expected = batch.items.reduce((n, i) => n + i.expectedYieldGrams, 0);
  const actual = batch.items.reduce((n, i) => n + (i.actualYieldGrams ?? 0), 0);
  const allPhasesCompleted = batch.items.length > 0 && batch.items.every(item => {
    const phases = item.phases;
    return Boolean(phases) &&
      (phases?.soaking?.status === "na" || phases?.soaking?.status === "completed") &&
      phases?.darkPeriod?.status === "completed" &&
      phases?.lightPeriod?.status === "completed";
  });

  function phaseCanStart(item: GrowingBatchItem, key: "soaking" | "darkPeriod" | "lightPeriod") {
    const phase = item.phases?.[key];
    if (!phase || phase.status !== "not_started") return false;
    if (key === "soaking") return true;
    if (key === "darkPeriod") return item.phases?.soaking?.status === "na" || item.phases?.soaking?.status === "completed";
    return item.phases?.darkPeriod?.status === "completed";
  }

  async function updatePhase(item: GrowingBatchItem, key: "soaking" | "darkPeriod" | "lightPeriod", action: "start" | "end") {
    onError("");
    setSavingPhase(`${item.id}:${key}`);
    try {
      if (action === "start") {
        await startGrowingBatchItemPhase(batch, item.id, key, uid, email);
        await showSuccess(`${item.productName}: ${key === "darkPeriod" ? "Dark Period" : key === "lightPeriod" ? "Light Period" : "Soaking"} started.`);
      } else {
        await completeGrowingBatchItemPhase(batch, item.id, key, uid, email);
        await showSuccess(`${item.productName}: ${key === "darkPeriod" ? "Dark Period" : key === "lightPeriod" ? "Light Period" : "Soaking"} completed.`);
      }
      await onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Unable to update phase.");
    } finally {
      setSavingPhase(null);
    }
  }

  function openHarvest() {
    const values: Record<string, number> = {};
    for (const item of batch.items) {
      const expected = Number(item.expectedYieldGrams ?? 0);
      const expectedLoss = Number(item.expectedLossGrams ?? 0);
      // Expected is the planned quantity before loss. Pre-fill Actual Harvested
      // using the existing expected loss calculation.
      values[item.id] = Math.max(0, expected - expectedLoss);
    }
    setHarvestValues(values);
  }

  async function completeHarvest() {
    onError("");
    setHarvesting(true);
    try {
      await harvestGrowingBatch(batch, harvestValues, uid, email);
      setHarvestValues({});
      await showSuccess(`Harvest completed for ${batch.batchNumber}.`);
      await onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Unable to complete harvest.");
    } finally {
      setHarvesting(false);
    }
  }

  const harvestingOpen = Object.keys(harvestValues).length > 0;

  return <>
    <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
      <div>
        <h2 className="h4 mb-1">{batch.batchNumber}</h2>
        <div className="text-muted">Harvest {formatDate(batch.harvestDate || batch.startDate)} · Start {formatDate(batch.startDate)} · {batch.locationName || "No location"}</div>
        <div className="mt-2"><span className={`badge text-bg-${batchStatusClass(batch.status)}`}>{statusLabel(batch.status)}</span></div>
      </div>
      <div className="d-flex gap-2">
        <button className="btn btn-outline-secondary" onClick={onBack}><i className="bi bi-arrow-left me-1" />Back to batches</button>
        {batch.status === "completed_harvested" && !batch.delivered && <button className="btn btn-outline-primary" onClick={async () => {
          const ok = await confirmAction({ title: "Close batch?", text: `${batch.batchNumber} will be marked Closed.`, confirmText: "Close Batch" });
          if (!ok) return;
          try {
            await markGrowingBatchDelivered(batch, uid, email);
            await showSuccess("Batch closed");
            await onSaved();
          } catch (err) {
            await showError(err, "Unable to close batch.");
          }
        }}><i className="bi bi-check2-circle me-1" />Close Batch</button>}
      </div>
    </div>

    <div className="row g-3 mb-3">
      <div className="col-md-4"><div className="card seedlings-kpi-card h-100"><div className="card-body"><div className="text-muted small">Expected</div><div className="h4 mb-0">{expected.toLocaleString()} gms</div></div></div></div>
      <div className="col-md-4"><div className="card seedlings-kpi-card h-100"><div className="card-body"><div className="text-muted small">Actual harvested</div><div className="h4 mb-0">{actual.toLocaleString()} gms</div></div></div></div>
      <div className="col-md-4"><div className="card seedlings-kpi-card h-100"><div className="card-body"><div className="text-muted small">Batch status</div><div className="h4 mb-0">{statusLabel(batch.status)}</div></div></div></div>
    </div>

    <div className="card">
      <div className="card-header"><h3 className="card-title mb-0">Microgreens Status</h3></div>
      <div className="table-responsive"><table className="table table-hover align-middle mb-0">
        <thead><tr>
          <th>Microgreen</th><th>Trays</th><th>Soaking</th><th>Dark Period</th><th>Light Period</th><th>Expected</th><th>Actual Loss</th><th>Actual Harvested</th><th>Status</th>
        </tr></thead>
        <tbody>
          {batch.items.map(item => {
            const phase = item.phases;
            const loss = item.wastageGrams;
            return <tr key={item.id}>
              <td><strong>{item.productName}</strong></td>
              <td>{item.trayCount}</td>
              <td><PhaseCell phase={phase?.soaking} canStart={phaseCanStart(item, "soaking")} disabled={savingPhase !== null} onStart={() => updatePhase(item, "soaking", "start")} onEnd={() => updatePhase(item, "soaking", "end")} /></td>
              <td><PhaseCell phase={phase?.darkPeriod} canStart={phaseCanStart(item, "darkPeriod")} disabled={savingPhase !== null} onStart={() => updatePhase(item, "darkPeriod", "start")} onEnd={() => updatePhase(item, "darkPeriod", "end")} /></td>
              <td><PhaseCell phase={phase?.lightPeriod} canStart={phaseCanStart(item, "lightPeriod")} disabled={savingPhase !== null} onStart={() => updatePhase(item, "lightPeriod", "start")} onEnd={() => updatePhase(item, "lightPeriod", "end")} /></td>
              <td>{item.expectedYieldGrams.toLocaleString()} gms</td>
              <td>{loss == null ? "—" : `${loss.toLocaleString()} gms`}</td>
              <td>{item.actualYieldGrams == null ? "—" : `${item.actualYieldGrams.toLocaleString()} gms`}</td>
              <td><span className={`badge text-bg-${item.status === "completed_harvested" ? "success" : item.status === "in_progress" ? "warning" : "secondary"}`}>{item.status === "completed_harvested" ? "Completed/Harvested" : statusLabel(item.status)}</span></td>
            </tr>;
          })}
        </tbody>
      </table></div>
    </div>

    <div className="small text-muted mt-2">
      <span className="me-3"><span className="rounded-circle bg-secondary d-inline-block me-1" style={{ width: 10, height: 10 }} />NA</span>
      <span className="me-3"><span className="rounded-circle bg-danger d-inline-block me-1" style={{ width: 10, height: 10 }} />Not Started</span>
      <span className="me-3"><span className="rounded-circle bg-warning d-inline-block me-1" style={{ width: 10, height: 10 }} />In Progress</span>
      <span><span className="rounded-circle bg-success d-inline-block me-1" style={{ width: 10, height: 10 }} />Completed</span>
    </div>

    {allPhasesCompleted && !harvestingOpen && batch.status !== "completed_harvested" && <div className="d-flex justify-content-center mt-3">
      <button type="button" className="btn btn-success px-4" disabled={savingPhase !== null || harvesting} onClick={openHarvest}>
        <i className="bi bi-basket2 me-1" />Harvest
      </button>
    </div>}

    {harvestingOpen && <div className="card border-success mt-3">
      <div className="card-header"><h3 className="card-title mb-0">Harvest</h3></div>
      <div className="card-body">
        <div className="alert alert-info mb-3">Actual Harvested is pre-filled as <strong>Expected − Expected Loss</strong>. Change it only when the actual harvest differs; Loss is calculated automatically as <strong>Expected − Actual Harvested</strong>.</div>
        <div className="table-responsive">
          <table className="table table-sm align-middle mb-0">
            <thead><tr><th>Microgreen</th><th>Expected</th><th>Actual Harvested</th><th>Loss</th></tr></thead>
            <tbody>
              {batch.items.map(item => {
                const value = Number(harvestValues[item.id] ?? 0);
                const expected = Number(item.expectedYieldGrams ?? 0);
                const loss = Math.max(0, expected - value);
                return <tr key={item.id}>
                  <td><strong>{item.productName}</strong></td>
                  <td>{expected.toLocaleString()} gms</td>
                  <td style={{ maxWidth: 220 }}><input className="form-control" type="number" min="0" max={expected} step="1" value={value} onChange={e => setHarvestValues(prev => ({ ...prev, [item.id]: Number(e.target.value) }))} /></td>
                  <td>{loss.toLocaleString()} gms</td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
      </div>
      <div className="card-footer d-flex justify-content-end gap-2">
        <button type="button" className="btn btn-secondary" disabled={harvesting} onClick={() => setHarvestValues({})}>Cancel</button>
        <button type="button" className="btn btn-success" disabled={harvesting} onClick={completeHarvest}>{harvesting ? "Harvesting..." : "Complete Harvest"}</button>
      </div>
    </div>}
  </>;
}
