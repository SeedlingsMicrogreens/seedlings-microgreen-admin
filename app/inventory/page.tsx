"use client";

import { useEffect, useState } from "react";
import { AdminPage } from "@/components/admin/AdminPage";
import { listCollection } from "@/lib/firestore";
import { adjustGrowingBatchStock } from "@/lib/growingBatchService";
import { confirmAction, showError, showToast } from "@/lib/alerts";
import { useAuth } from "@/components/auth/AuthProvider";
import type { InventoryAdjustment, Product } from "@/types/catalog";
import type { GrowingBatch } from "@/types/growingBatch";

export default function InventoryPage() {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [adjustments, setAdjustments] = useState<InventoryAdjustment[]>([]);
  const [batches, setBatches] = useState<GrowingBatch[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const [batchQuantities, setBatchQuantities] = useState<Record<string, number>>({});
  const [savingBatch, setSavingBatch] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    try {
      const [p, a, b] = await Promise.all([
        listCollection<Product>("products"),
        listCollection<InventoryAdjustment>("inventoryAdjustments", "createdAt"),
        listCollection<GrowingBatch>("growingBatches")
      ]);
      setProducts(p);
      setAdjustments(a);
      setBatches(b);
      setError("");
    } catch {
      setError("Unable to load inventory. Check Firestore rules/indexes.");
    }
  }

  useEffect(() => { void load(); }, []);

  const lowStock = products.filter(p => Number(p.stockGrams ?? p.stock ?? 0) <= Number(p.lowStockThresholdGrams ?? p.lowStockThreshold ?? 0) && p.status !== "inactive");
  const eligibleBatches = batches.filter(batch =>
    !batch.stockAdjusted &&
    !batch.delivered &&
    (batch.items ?? []).some(item => item.status === "harvested" || item.status === "failed")
  );
  const selectedBatch = eligibleBatches.find(batch => batch.id === selectedBatchId) ?? null;
  const selectedBatchItems = (selectedBatch?.items ?? []).filter(item => item.status === "harvested" || item.status === "failed");
  function selectBatch(id: string) {
    setSelectedBatchId(id);
    const batch = eligibleBatches.find(item => item.id === id);
    if (!batch) { setBatchQuantities({}); return; }
    setBatchQuantities(Object.fromEntries((batch.items ?? [])
      .filter(item => item.status === "harvested" || item.status === "failed")
      .map(item => [item.id, Number(item.actualYieldGrams ?? 0)])));
  }
  async function saveBatchStock() {
    if (!user || !selectedBatch) return;
    const confirmed = await confirmAction({
      title: "Save batch-wise stock?",
      text: `This will reconcile ${selectedBatch.batchNumber} and remove it from this selector.`,
      confirmText: "Save Stock",
    });
    if (!confirmed) return;
    setSavingBatch(true); setError("");
    try {
      await adjustGrowingBatchStock(selectedBatch, batchQuantities, user.uid, user.email ?? undefined);
      showToast(`${selectedBatch.batchNumber} stock saved successfully.`);
      setSelectedBatchId(""); setBatchQuantities({}); await load();
    } catch (e) { await showError(e, "Unable to save batch-wise stock."); }
    finally { setSavingBatch(false); }
  }

  return <AdminPage>
    <div className="container-fluid py-3">
      <div className="mb-3">
        <h1 className="h3 seedlings-brand">Inventory</h1>
        <p className="text-muted mb-0">Actual inventory in grams, low-stock warnings and adjustment history.</p>
      </div>
      {error && <div className="alert alert-danger">{error}</div>}

      <div className="card border-success mb-3">
        <div className="card-header d-flex justify-content-between align-items-center">
          <div><h3 className="card-title mb-1">Batch-wise Stock</h3><div className="small text-muted">Select a harvested batch and confirm the final stock quantity for each product.</div></div>
          <span className="badge text-bg-light">{eligibleBatches.length} pending</span>
        </div>
        <div className="card-body">
          <div className="row g-3 align-items-end">
            <div className="col-lg-6">
              <label className="form-label">Select batch *</label>
              <select className="form-select" value={selectedBatchId} onChange={e => selectBatch(e.target.value)}>
                <option value="">Select harvested batch...</option>
                {eligibleBatches.map(batch => <option key={batch.id} value={batch.id}>{batch.batchNumber} · {batch.locationName || "No location"}</option>)}
              </select>
              <div className="form-text">Batches already adjusted or marked delivered are automatically hidden.</div>
            </div>
          </div>
          {selectedBatch && <div className="mt-4">
            <div className="alert alert-info small mb-3"><strong>{selectedBatch.batchNumber}</strong> · Started {selectedBatch.startDate} · {selectedBatch.locationName || "No location"}. The quantity below starts from the actual usable harvest. Set it to <strong>0</strong> or enter the final quantity you want recorded for this batch.</div>
            <div className="table-responsive"><table className="table table-sm align-middle mb-3"><thead><tr><th>Product</th><th>Actual harvested</th><th>Actual loss</th><th>Actual usable</th><th style={{width:180}}>Batch stock (gms)</th></tr></thead><tbody>
              {selectedBatchItems.map(item => <tr key={item.id}>
                <td><strong>{item.productName}</strong></td>
                <td>{Number(item.actualHarvestGrams ?? 0).toLocaleString()} gms</td>
                <td>{Number(item.wastageGrams ?? 0).toLocaleString()} gms</td>
                <td>{Number(item.actualYieldGrams ?? 0).toLocaleString()} gms</td>
                <td><input className="form-control form-control-sm" type="number" min="0" step="1" value={batchQuantities[item.id] ?? 0} onChange={e => setBatchQuantities(v => ({...v, [item.id]: Math.max(0, Number(e.target.value) || 0)}))}/></td>
              </tr>)}
            </tbody></table></div>
            <div className="d-flex justify-content-end"><button type="button" className="btn btn-success" disabled={savingBatch} onClick={() => void saveBatchStock()}>{savingBatch ? "Saving..." : "Save Batch Stock"}</button></div>
          </div>}
          {!eligibleBatches.length && <div className="text-muted mt-3">No harvested batches are waiting for batch-wise stock adjustment.</div>}
        </div>
      </div>

      <div className="row">
        <div className="col-lg-4 mb-3">
          <div className="card">
            <div className="card-header"><h3 className="card-title">Low stock</h3></div>
            <div className="card-body p-0">
              {lowStock.length ? <div className="list-group list-group-flush">
                {lowStock.map(p => <div className="list-group-item d-flex justify-content-between" key={p.id}>
                  <span><strong>{p.name}</strong><br/><small className="text-muted">Threshold {Number(p.lowStockThresholdGrams ?? p.lowStockThreshold ?? 0).toLocaleString()}gms</small></span>
                  <span className="badge text-bg-warning align-self-center">{Number(p.stockGrams ?? p.stock ?? 0).toLocaleString()} gms</span>
                </div>)}
              </div> : <div className="p-3 text-muted">No low-stock products.</div>}
            </div>
          </div>
        </div>

        <div className="col-lg-8 mb-3">
          <div className="card">
            <div className="card-header"><h3 className="card-title">Current stock</h3></div>
            <div className="card-body table-responsive p-0">
              <table className="table table-hover mb-0">
                <thead><tr><th>Product</th><th>Available</th><th>Low-stock threshold</th><th>Status</th></tr></thead>
                <tbody>{products.map(p => <tr key={p.id}>
                  <td>{p.name}</td><td className={Number(p.stockGrams ?? p.stock ?? 0) <= Number(p.lowStockThresholdGrams ?? p.lowStockThreshold ?? 0) ? "text-danger fw-bold" : ""}>{Number(p.stockGrams ?? p.stock ?? 0).toLocaleString()} gms</td>
                  <td>{Number(p.lowStockThresholdGrams ?? p.lowStockThreshold ?? 0).toLocaleString()} gms</td><td>{p.status}</td>
                </tr>)}
                {!products.length && <tr><td colSpan={4} className="text-center text-muted py-4">No products.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="col-12">
          <div className="card">
            <div className="card-header"><h3 className="card-title">Adjustment history</h3></div>
            <div className="card-body table-responsive p-0">
              <table className="table table-sm table-hover mb-0">
                <thead><tr><th>Product</th><th>Type</th><th>Qty (gms)</th><th>Before (gms)</th><th>After (gms)</th><th>Reason</th><th>Created by</th></tr></thead>
                <tbody>{adjustments.map(a => <tr key={a.id}>
                  <td>{a.productName}</td><td>{a.type}</td><td>{Number(a.quantity ?? 0).toLocaleString()} gms</td><td>{Number(a.previousStock ?? 0).toLocaleString()} gms</td><td>{Number(a.newStock ?? 0).toLocaleString()} gms</td>
                  <td>{a.reason}</td><td>{a.createdByEmail || a.createdByUid}</td>
                </tr>)}
                {!adjustments.length && <tr><td colSpan={7} className="text-center text-muted py-4">No adjustments yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  </AdminPage>;
}