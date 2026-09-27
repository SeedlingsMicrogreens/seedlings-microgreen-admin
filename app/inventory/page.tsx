"use client";

import { useEffect, useState } from "react";
import { AdminPage } from "@/components/admin/AdminPage";
import { listCollection } from "@/lib/firestore";
import { closeGrowingBatchFromInventory, updateGrowingBatchSoldQuantity } from "@/lib/growingBatchService";
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
  const [wasteQuantities, setWasteQuantities] = useState<Record<string, number>>({});
  const [savingBatch, setSavingBatch] = useState(false);
  const [closingBatch, setClosingBatch] = useState(false);
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
    (batch.items ?? []).some(item => item.status === "completed_harvested" || item.status === "failed")
  );
  const selectedBatch = eligibleBatches.find(batch => batch.id === selectedBatchId) ?? null;
  const selectedBatchItems = (selectedBatch?.items ?? []).filter(item => item.status === "completed_harvested" || item.status === "failed");
  const selectedBatchAdjustments = selectedBatchId
    ? adjustments.filter(adjustment => adjustment.growingBatchId === selectedBatchId)
    : adjustments;
  function batchStatusLabel(status: GrowingBatch["status"]) {
    return status.replaceAll("_", " ").replace(/\b\w/g, value => value.toUpperCase());
  }
  function selectBatch(id: string) {
    setSelectedBatchId(id);
    const batch = eligibleBatches.find(item => item.id === id);
    if (!batch) { setWasteQuantities({}); return; }
    setWasteQuantities(Object.fromEntries((batch.items ?? [])
      .filter(item => item.status === "completed_harvested" || item.status === "failed")
      .map(item => [item.id, 0])));
  }
  async function saveReconciliation() {
    if (!user || !selectedBatch) return;
    const confirmed = await confirmAction({
      title: "Update batch reconciliation?",
      text: `This will deduct the entered Waste from Product stock and batch Stock, record an Adjustment History entry, and refresh the reconciliation. Sold Quantity is calculated from completed fulfilment and cannot be edited here.`,
      confirmText: "Update Reconciliation",
    });
    if (!confirmed) return;
    setSavingBatch(true); setError("");
    try {
      await updateGrowingBatchSoldQuantity(selectedBatch, user.uid, user.email ?? undefined, wasteQuantities);
      showToast(`${selectedBatch.batchNumber} reconciliation updated successfully.`);
      await load();
      const refreshed = (await listCollection<GrowingBatch>("growingBatches")).find(batch => batch.id === selectedBatch.id);
      if (refreshed) {
        setSelectedBatchId(refreshed.id);
        setWasteQuantities(Object.fromEntries((refreshed.items ?? [])
          .filter(item => item.status === "completed_harvested" || item.status === "failed")
          .map(item => [item.id, 0])));
      }
    } catch (e) {
      console.error("[WASTE-DEBUG] UI UPDATE FAILED", {
        batchId: selectedBatch.id,
        batchNumber: selectedBatch.batchNumber,
        wasteQuantities,
        error: e,
        errorMessage: e instanceof Error ? e.message : String(e),
        errorStack: e instanceof Error ? e.stack : undefined,
      });
      const detail = e instanceof Error ? e.message : String(e);
      await showError(e, `Unable to update batch reconciliation.

${detail}`);
    }
    finally { setSavingBatch(false); }
  }

  async function closeBatch() {
    if (!user || !selectedBatch) return;
    const confirmed = await confirmAction({
      title: "Close Batch — Irreversible Action",
      text: "Any remaining Stock for all harvested microgreens will be automatically adjusted as Waste, Product stock will be reduced accordingly, and the batch will be closed. Once closed, this batch will no longer be available for selling. This action is irreversible. Are you sure you want to continue?",
      confirmText: "Close Batch",
      cancelText: "Cancel",
      icon: "warning",
    });
    if (!confirmed) return;
    setClosingBatch(true); setError("");
    try {
      await closeGrowingBatchFromInventory(selectedBatch, user.uid, user.email ?? undefined, wasteQuantities);
      showToast(`${selectedBatch.batchNumber} closed successfully.`);
      setSelectedBatchId("");
      setWasteQuantities({});
      await load();
    } catch (e) { await showError(e, "Unable to close batch."); }
    finally { setClosingBatch(false); }
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
                {eligibleBatches.map(batch => <option key={batch.id} value={batch.id}>{batch.batchNumber} · {batch.locationName || "No location"} ({batchStatusLabel(batch.status)})</option>)}
              </select>
              <div className="form-text">Batches already adjusted or marked delivered are automatically hidden.</div>
            </div>
          </div>
          {selectedBatch && <div className="mt-4">
            <div className="alert alert-info small mb-3"><strong>{selectedBatch.batchNumber}</strong> · Started {selectedBatch.startDate} · {selectedBatch.locationName || "No location"}. <strong>Harvested</strong> is the usable harvest after production loss. Sold Quantity, Stock and Total Waste are read-only; Waste Adjustment is the only editable reconciliation value. Waste Adjustment starts at 0g. Waste is an incremental adjustment: each Update deducts the entered Waste from Stock and Product stock. A batch can be closed when <strong>Stock reaches 0</strong>.</div>
            <div className="table-responsive"><table className="table table-sm align-middle mb-3"><thead><tr><th>Microgreen</th><th>Harvested</th><th>Loss</th><th>Stock</th><th style={{width:180}}>Sold quantity (gms)</th><th style={{width:160}}>Waste adjustment (gms)</th><th style={{width:140}}>Total Waste (gms)</th></tr></thead><tbody>
              {selectedBatchItems.map(item => {
                const harvested = Math.max(0, Number(item.actualYieldGrams ?? 0));
                const batchStock = Math.max(0, Number(item.batchStockGrams ?? harvested - Number(item.soldQuantityGrams ?? 0)));
                const sold = Math.max(0, Number(item.soldQuantityGrams ?? 0));
                const waste = Math.max(0, Number(wasteQuantities[item.id] ?? 0));
                const wasteAdjustments = selectedBatchAdjustments.filter(adjustment =>
                  adjustment.type === "batch_waste" &&
                  (adjustment.isWaste === true || adjustment.type === "batch_waste") &&
                  adjustment.productId === item.productId
                );
                const hasWasteAdjustment = wasteAdjustments.length > 0;
                const totalWaste = hasWasteAdjustment
                  ? wasteAdjustments.reduce((sum, adjustment) => sum + Math.max(0, Number(adjustment.quantity ?? 0)), 0)
                  : batchStock;
                return <tr key={item.id}>
                  <td><strong>{item.productName}</strong></td>
                  <td>{harvested.toLocaleString()} gms</td>
                  <td>{Number(item.wastageGrams ?? 0).toLocaleString()} gms</td>
                  <td><strong>{batchStock.toLocaleString()} gms</strong></td>
                  <td><input className="form-control form-control-sm" type="number" value={sold} readOnly aria-label={`Sold quantity for ${item.productName}`}/></td>
                  <td><input className="form-control form-control-sm" type="number" min="0" max={batchStock} step="1" value={waste} onChange={e => setWasteQuantities(v => ({...v, [item.id]: Math.max(0, Number(e.target.value) || 0)}))}/></td>
                  <td><input className="form-control form-control-sm" type="number" value={totalWaste} readOnly aria-label={`Total waste for ${item.productName}`}/></td>
                </tr>;
              })}
            </tbody></table></div>
            <div className="d-flex justify-content-end gap-2">
              <button type="button" className="btn btn-outline-primary" disabled={savingBatch || closingBatch} onClick={() => void saveReconciliation()}>{savingBatch ? "Updating..." : "Update Reconciliation"}</button>
              <button type="button" className="btn btn-danger" disabled={savingBatch || closingBatch} onClick={() => void closeBatch()}>{closingBatch ? "Closing..." : "Close Batch"}</button>
            </div>
          </div>}
          {!eligibleBatches.length && <div className="text-muted mt-3">No harvested batches are waiting for sold-quantity adjustment.</div>}
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
                {!products.length && <tr><td colSpan={4} className="text-center text-muted py-4">No microgreens.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="col-12">
          <div className="card">
            <div className="card-header"><h3 className="card-title">Adjustment history{selectedBatch ? ` · ${selectedBatch.batchNumber}` : ""}</h3></div>
            <div className="card-body table-responsive p-0">
              <table className="table table-sm table-hover mb-0">
                <thead><tr><th>Product</th><th>Type</th><th>Qty (gms)</th><th>Before (gms)</th><th>After (gms)</th><th>Reason</th><th>Created by</th></tr></thead>
                <tbody>{selectedBatchAdjustments.map(a => <tr key={a.id}>
                  <td>{a.productName}</td><td>{a.type}</td><td>{Number(a.quantity ?? 0).toLocaleString()} gms</td><td>{Number(a.previousStock ?? 0).toLocaleString()} gms</td><td>{Number(a.newStock ?? 0).toLocaleString()} gms</td>
                  <td>{a.reason}</td><td>{a.createdByEmail || a.createdByUid}</td>
                </tr>)}
                {!selectedBatchAdjustments.length && <tr><td colSpan={7} className="text-center text-muted py-4">{selectedBatchId ? "No adjustments for this batch yet." : "No adjustments yet."}</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  </AdminPage>;
}