"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminPage } from "@/components/admin/AdminPage";
import { listCollection } from "@/lib/firestore";
import { buildBatchMetrics, buildProductionMetrics } from "@/lib/productionAnalyticsService";
import type { GrowingBatch } from "@/types/growingBatch";
import type { Product } from "@/types/catalog";

const ranges = [
  {key:"30",label:"Last 30 days",days:30},
  {key:"90",label:"Last 90 days",days:90},
  {key:"180",label:"Last 6 months",days:180},
  {key:"365",label:"Last 12 months",days:365},
  {key:"all",label:"All time",days:0},
];

function dateString(d: Date) { return d.toISOString().slice(0,10); }
function grams(v: number) { return `${Math.round(v).toLocaleString()} gms`; }
function pct(v: number | null) { return v == null ? "—" : `${v.toFixed(1)}%`; }

export default function ProductionAnalyticsPage() {
  const [products,setProducts]=useState<Product[]>([]);
  const [batches,setBatches]=useState<GrowingBatch[]>([]);
  const [range,setRange]=useState("90");
  const [tab,setTab]=useState<"products"|"batches">("products");
  const [search,setSearch]=useState("");
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");

  async function load() {
    setLoading(true);
    try {
      const [p,b]=await Promise.all([
        listCollection<Product>("products"),
        listCollection<GrowingBatch>("growingBatches","startDate"),
      ]);
      setProducts(p); setBatches(b); setError("");
    } catch {
      setError("Unable to load production analytics. Check Firestore rules/indexes.");
    } finally { setLoading(false); }
  }
  useEffect(()=>{void load();},[]);

  const selectedRange=ranges.find(x=>x.key===range) ?? ranges[1];
  const start=selectedRange.days ? dateString(new Date(Date.now()-selectedRange.days*86400000)) : undefined;
  const productRows=useMemo(()=>buildProductionMetrics(products,batches,start),[products,batches,start]);
  const batchRows=useMemo(()=>buildBatchMetrics(batches,start),[batches,start]);
  const filteredProducts=productRows.filter(r=>!search||r.productName.toLowerCase().includes(search.toLowerCase()));
  const filteredBatches=batchRows.filter(r=>!search||[r.batchNumber,r.locationName].join(" ").toLowerCase().includes(search.toLowerCase()));

  const totals=useMemo(()=>({
    batches:batchRows.length,
    trays:batchRows.reduce((s,r)=>s+r.trays,0),
    expected:batchRows.reduce((s,r)=>s+r.expectedUsableGrams,0),
    usable:batchRows.reduce((s,r)=>s+r.actualUsableGrams,0),
    harvested:batchRows.reduce((s,r)=>s+r.actualHarvestedGrams,0),
    loss:batchRows.reduce((s,r)=>s+r.actualLossGrams,0),
  }),[batchRows]);
  const achievement=totals.expected>0?totals.usable/totals.expected*100:null;
  const lossRate=totals.harvested>0?totals.loss/totals.harvested*100:null;

  return <AdminPage>
    <div className="container-fluid py-3">
      <div className="d-flex flex-wrap justify-content-between align-items-end gap-3 mb-3">
        <div><h1 className="h3 seedlings-brand mb-1">Production Analytics</h1><p className="text-muted mb-0">Compare planned production with actual harvest, usable yield and loss.</p></div>
        <button className="btn btn-outline-secondary" onClick={()=>void load()} disabled={loading}><i className="bi bi-arrow-clockwise me-1"/>Refresh</button>
      </div>
      {error&&<div className="alert alert-danger">{error}</div>}

      <div className="row g-3 mb-3">
        <Kpi label="Growing batches" value={totals.batches} icon="bi-layers"/>
        <Kpi label="Trays" value={totals.trays.toLocaleString()} icon="bi-grid-3x3-gap"/>
        <Kpi label="Expected usable" value={grams(totals.expected)} icon="bi-bullseye"/>
        <Kpi label="Actual usable" value={grams(totals.usable)} icon="bi-check2-circle"/>
        <Kpi label="Actual loss" value={grams(totals.loss)} icon="bi-trash3"/>
        <Kpi label="Yield achievement" value={pct(achievement)} icon="bi-graph-up"/>
        <Kpi label="Loss rate" value={pct(lossRate)} icon="bi-graph-down"/>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="row g-2 align-items-center">
            <div className="col-md-5"><div className="input-group"><span className="input-group-text"><i className="bi bi-search"/></span><input className="form-control" placeholder="Search product or batch..." value={search} onChange={e=>setSearch(e.target.value)}/></div></div>
            <div className="col-md-3"><select className="form-select" value={range} onChange={e=>setRange(e.target.value)}>{ranges.map(r=><option key={r.key} value={r.key}>{r.label}</option>)}</select></div>
            <div className="col-md-4 text-md-end small text-muted">Analytics are based on Growing Batch records and actual harvest data.</div>
          </div>
        </div>
        <div className="card-body pb-0"><ul className="nav nav-tabs">
          <li className="nav-item"><button className={`nav-link ${tab==="products"?"active":""}`} onClick={()=>setTab("products")}><i className="bi bi-box-seam me-1"/>By Product</button></li>
          <li className="nav-item"><button className={`nav-link ${tab==="batches"?"active":""}`} onClick={()=>setTab("batches")}><i className="bi bi-layers me-1"/>By Batch</button></li>
        </ul></div>

        {tab==="products"?<div className="table-responsive"><table className="table table-hover align-middle mb-0"><thead><tr><th>Microgreen</th><th>Batches</th><th>Trays</th><th>Expected usable</th><th>Actual harvested</th><th>Actual usable</th><th>Actual loss</th><th>Yield</th><th>Loss rate</th><th>Avg usable / tray</th></tr></thead><tbody>
          {filteredProducts.map(r=><tr key={r.productId}><td><strong>{r.productName}</strong></td><td>{r.completedBatches}/{r.batches}</td><td>{r.trays}</td><td>{grams(r.expectedUsableGrams)}</td><td>{grams(r.actualHarvestedGrams)}</td><td>{grams(r.actualUsableGrams)}</td><td>{grams(r.actualLossGrams)}</td><td>{pct(r.yieldAchievementPercent)}</td><td>{pct(r.lossRatePercent)}</td><td>{r.avgActualUsablePerTrayGrams==null?"—":`${r.avgActualUsablePerTrayGrams.toFixed(0)} gms`}</td></tr>)}
          {!filteredProducts.length&&!loading&&<tr><td colSpan={10} className="text-center text-muted py-5">No production data for this period.</td></tr>}
          {loading&&<tr><td colSpan={10} className="text-center py-5"><span className="spinner-border spinner-border-sm me-2"/>Loading...</td></tr>}
        </tbody></table></div>:<div className="table-responsive"><table className="table table-hover align-middle mb-0"><thead><tr><th>Batch</th><th>Started</th><th>Location</th><th>Microgreens</th><th>Trays</th><th>Expected usable</th><th>Actual usable</th><th>Loss</th><th>Completion</th><th>Yield</th></tr></thead><tbody>
          {filteredBatches.map(r=><tr key={r.batchId}><td><strong>{r.batchNumber}</strong></td><td>{new Date(`${r.startDate}T00:00:00`).toLocaleDateString()}</td><td>{r.locationName||"—"}</td><td>{r.productCount}</td><td>{r.trays}</td><td>{grams(r.expectedUsableGrams)}</td><td>{grams(r.actualUsableGrams)}</td><td>{grams(r.actualLossGrams)}</td><td>{r.completionPercent.toFixed(0)}%</td><td>{pct(r.yieldAchievementPercent)}</td></tr>)}
          {!filteredBatches.length&&!loading&&<tr><td colSpan={10} className="text-center text-muted py-5">No batch data for this period.</td></tr>}
        </tbody></table></div>}
        <div className="card-footer small text-muted">Actual usable = actual harvested grams − actual loss. Inventory already records the net usable harvest, while this report keeps gross harvest and loss visible separately.</div>
      </div>
    </div>
  </AdminPage>;
}

function Kpi({label,value,icon}:{label:string;value:string|number;icon:string}) {
  return <div className="col-6 col-md-4 col-xl-2"><div className="info-box h-100"><span className="info-box-icon text-bg-success"><i className={`bi ${icon}`}/></span><div className="info-box-content"><span className="info-box-text">{label}</span><span className="info-box-number">{value}</span></div></div></div>;
}
