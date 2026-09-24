"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminPage } from "@/components/admin/AdminPage";
import { listCollection } from "@/lib/firestore";
import { buildForecast } from "@/lib/forecastService";
import type { Product } from "@/types/catalog";
import type { GrowingBatch } from "@/types/growingBatch";
import type { Order } from "@/types/order";
import type { ForecastRow } from "@/types/forecast";
import type { Subscription } from "@/types/subscription";
import type { SalesProduct } from "@/types/salesProduct";
import { listSalesProducts } from "@/lib/salesProductService";

export default function ForecastingPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [batches, setBatches] = useState<GrowingBatch[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [salesProducts, setSalesProducts] = useState<SalesProduct[]>([]);
  const [search, setSearch] = useState("");
  const [onlyNeed, setOnlyNeed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    try {
      const [p, o, b, subData, salable] = await Promise.all([
        listCollection<Product>("products"),
        listCollection<Order>("orders", "createdAt"),
        listCollection<GrowingBatch>("growingBatches", "startDate"),
        listCollection<Subscription>("subscriptions"),
        listSalesProducts(),
      ]);
      setProducts(p);
      setOrders(o);
      setBatches(b);
      setSubscriptions(subData);
      setSalesProducts(salable);
      setError("");
    } catch (err) {
      console.error("Unable to load production planning data:", err);
      setError("Unable to load production planning data. Check Firestore rules/indexes.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const result = useMemo(() => {
    try {
      return { rows: buildForecast(products, orders, batches, 30, new Date(), subscriptions, salesProducts), error: "" };
    } catch (err) {
      console.error("Production planning calculation failed:", err);
      return {
        rows: [] as ForecastRow[],
        error: "Unable to calculate the production plan. Please refresh and try again.",
      };
    }
  }, [products, orders, batches, subscriptions, salesProducts]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return result.rows.filter(row =>
      (!q || row.productName.toLowerCase().includes(q)) &&
      (!onlyNeed || row.needToGrowGrams > 0),
    );
  }, [result.rows, search, onlyNeed]);

  const totalNeed = result.rows.reduce((sum, row) => sum + row.needToGrowGrams, 0);

  return <AdminPage>
    <div className="container-fluid py-3">
      <div className="d-flex flex-wrap justify-content-between align-items-end gap-3 mb-3">
        <div>
          <h1 className="h3 seedlings-brand mb-1">Production Forecast</h1>
          <p className="text-muted mb-0">A simple view of what we have, what is coming, and what we still need to grow.</p>
        </div>
        <button className="btn btn-outline-secondary" onClick={() => void load()} disabled={loading}>
          <i className="bi bi-arrow-clockwise me-1" />Refresh
        </button>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}
      {result.error && <div className="alert alert-danger">{result.error}</div>}

      <div className="alert alert-info">
        <strong>How to read this:</strong> Need to grow = Current requirement − Current stock − In-production batch expected. A negative result is shown as 0.
        <span className="ms-1">Current requirement includes active subscriptions and open orders.</span>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="row g-2 align-items-center">
            <div className="col-lg-7">
              <div className="input-group">
                <span className="input-group-text"><i className="bi bi-search" /></span>
                <input
                  className="form-control"
                  placeholder="Search product..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
            </div>
            <div className="col-lg-5 d-flex justify-content-lg-end align-items-center gap-3">
              <div className="form-check">
                <input
                  className="form-check-input"
                  type="checkbox"
                  id="only-need"
                  checked={onlyNeed}
                  onChange={e => setOnlyNeed(e.target.checked)}
                />
                <label className="form-check-label" htmlFor="only-need">Only show products to grow</label>
              </div>
              <span className="small text-muted">{filtered.length} products</span>
            </div>
          </div>
        </div>

        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0">
            <thead>
              <tr>
                <th>Product</th>
                <th>Cycle</th>
                <th>Current stock<br /><small className="text-muted fw-normal">remaining</small></th>
                <th>In production batch<br /><small className="text-muted fw-normal">ongoing batch expected</small></th>
                <th>Current requirement<br /><small className="text-muted fw-normal">subscriptions + open orders</small></th>
                <th>Need to grow<br /><small className="text-muted fw-normal">additional quantity</small></th>
                <th>Trays to grow<br /><small className="text-muted fw-normal">based on expected yield</small></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(row => <ForecastTableRow key={row.productId} row={row} />)}
              {!filtered.length && !loading && (
                <tr>
                  <td colSpan={7} className="text-center text-muted py-5">
                    <i className="bi bi-bar-chart-line fs-2 d-block mb-2" />
                    {onlyNeed ? "No microgreens currently need additional growing." : "No microgreen production planning data available yet."}
                  </td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td colSpan={7} className="text-center py-5">
                    <span className="spinner-border spinner-border-sm me-2" />Loading production plan...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="card-footer d-flex flex-wrap justify-content-between gap-2 small text-muted">
          <span>Open orders exclude delivered and cancelled orders.</span>
          <span>Total quantity still to grow: <strong>{totalNeed.toLocaleString()} gms</strong></span>
        </div>
      </div>
    </div>
  </AdminPage>;
}

function ForecastTableRow({ row }: { row: ForecastRow }) {
  const needs = row.needToGrowGrams > 0;

  return <tr>
    <td><strong>{row.productName}</strong></td>
    <td>{row.cycleDays} days</td>
    <td>{row.currentStockGrams.toLocaleString()} gms</td>
    <td>{row.inProductionGrams.toLocaleString()} gms</td>
    <td>{row.currentRequirementGrams.toLocaleString()} gms</td>
    <td className={needs ? "fw-bold text-danger" : "fw-semibold text-success"}>
      {row.needToGrowGrams.toLocaleString()} gms
    </td>
    <td className={needs ? "fw-bold" : "text-muted"}>
      {needs && row.expectedYieldGramsPerTray > 0
        ? `${row.traysToGrow.toLocaleString()} trays`
        : "0 trays"}
    </td>
  </tr>;
}
