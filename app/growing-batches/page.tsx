"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminPage } from "@/components/admin/AdminPage";
import { useAuth } from "@/components/auth/AuthProvider";
import { listCollection } from "@/lib/firestore";
import { buildBatchItem, createGrowingBatch, harvestGrowingBatchItem, markGrowingBatchDelivered } from "@/lib/growingBatchService";
import { confirmAction, showError, showSuccess } from "@/lib/alerts";
import type { Product } from "@/types/catalog";
import type { GrowingBatch, GrowingBatchItem } from "@/types/growingBatch";
import type { Location } from "@/types/location";

function today(){return new Date().toISOString().slice(0,10);}
function formatDate(v?:string){return v?new Date(`${v}T00:00:00`).toLocaleDateString():"—";}
function statusLabel(v:string){return v.replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase());}
function statusClass(v:string){return v==="completed"||v==="harvested"?"success":v==="partially_harvested"||v==="ready"?"warning":v==="failed"?"danger":"primary";}
function normalizeLegacyBatch(batch: GrowingBatch): GrowingBatch {
  return { ...batch, items: batch.items.map(item => {
    // Phase-A records created before gross/net fields were fixed stored gross harvest in actualYieldGrams.
    if (item.status === "harvested" && item.actualHarvestGrams == null && item.actualYieldGrams != null) {
      const gross = Number(item.actualYieldGrams);
      const loss = Number(item.wastageGrams ?? 0);
      return { ...item, actualHarvestGrams: gross, actualYieldGrams: Math.max(0, gross - loss) };
    }
    return item;
  })
  }
}

export default function GrowingBatchesPage(){
  const {user}=useAuth();
  const [batches,setBatches]=useState<GrowingBatch[]>([]);
  const [products,setProducts]=useState<Product[]>([]);
  const [locations,setLocations]=useState<Location[]>([]);
  const [tab,setTab]=useState<"list"|"create"|"view">("list");
  const [selected,setSelected]=useState<GrowingBatch|null>(null);
  const [error,setError]=useState(""); const [loading,setLoading]=useState(true);

  async function load(){
    setLoading(true);
    try{
      const [b,p,l]=await Promise.all([
        listCollection<GrowingBatch>("growingBatches"),
        listCollection<Product>("products"),
        listCollection<Location>("locations")
      ]);
      setBatches(b.map(normalizeLegacyBatch));setProducts(p);setLocations(l);setError("");
    }catch{setError("Unable to load growing batches. Check Firestore rules/indexes.");}
    finally{setLoading(false);}
  }
  useEffect(()=>{void load();},[]);
  function openView(b:GrowingBatch){setSelected(normalizeLegacyBatch(b));setError("");setTab("view");}

  return <AdminPage><div className="container-fluid py-3">
    <div className="d-flex flex-wrap justify-content-between align-items-end gap-3 mb-3">
      <div><h1 className="h3 seedlings-brand mb-1">Growing Batches</h1><p className="text-muted mb-0">Grow multiple microgreens together, then harvest each product into gram-based inventory.</p></div>
      {tab==="list"&&<button className="btn btn-success" onClick={()=>{setError("");setTab("create");}}><i className="bi bi-plus-lg me-1"/>New Batch</button>}
    </div>
    {error&&<div className="alert alert-danger">{error}</div>}
    <ul className="nav nav-tabs mb-3">
      <li className="nav-item"><button className={`nav-link ${tab==="list"?"active":""}`} onClick={()=>setTab("list")}><i className="bi bi-list-ul me-1"/>Batches</button></li>
      {tab!=="list"&&<li className="nav-item"><button className="nav-link active"><i className="bi bi-seedling me-1"/>{tab==="create"?"New Batch":selected?.batchNumber}</button></li>}
    </ul>
    {tab==="list"&&<BatchList batches={batches} loading={loading} onView={openView}/>}
    {tab==="create"&&user&&<CreateBatch products={products} locations={locations} uid={user.uid} email={user.email??undefined} onCancel={()=>setTab("list")} onCreated={async()=>{await load();setTab("list");}} onError={setError}/>}
    {tab==="view"&&selected&&user&&<BatchDetails batch={selected} uid={user.uid} email={user.email??undefined} onBack={()=>setTab("list")} onSaved={async()=>{await load();const fresh=(await listCollection<GrowingBatch>("growingBatches")).find(b=>b.id===selected.id);setSelected(fresh?normalizeLegacyBatch(fresh):selected);}} onError={setError}/>}
  </div></AdminPage>;
}

function BatchList({batches,loading,onView}:{batches:GrowingBatch[];loading:boolean;onView:(b:GrowingBatch)=>void}){
  const [search,setSearch]=useState(""); const [status,setStatus]=useState("all");
  const filtered=useMemo(()=>{const q=search.trim().toLowerCase();return batches.filter(b=>
    (status==="all"||b.status===status)&&(!q||[b.batchNumber,b.locationName,...b.items.map(i=>i.productName)].join(" ").toLowerCase().includes(q))
  );},[batches,search,status]);
  return <div className="card">
    <div className="card-header"><div className="row g-2 align-items-center"><div className="col-md-7"><div className="input-group"><span className="input-group-text"><i className="bi bi-search"/></span><input className="form-control" placeholder="Search batch, product or location..." value={search} onChange={e=>setSearch(e.target.value)}/></div></div><div className="col-md-3"><select className="form-select" value={status} onChange={e=>setStatus(e.target.value)}><option value="all">All statuses</option><option value="growing">Growing</option><option value="partially_harvested">Partially Harvested</option><option value="completed">Completed</option></select></div><div className="col-md-2 text-md-end small text-muted">{filtered.length} batches</div></div></div>
    <div className="table-responsive"><table className="table table-hover align-middle mb-0"><thead><tr><th>Batch</th><th>Products</th><th>Location</th><th>Started</th><th>Ready by</th><th>Expected usable</th><th>Harvested</th><th>Status</th><th className="text-end">Action</th></tr></thead><tbody>
      {filtered.map(b=>{const ready=b.items.map(i=>i.expectedReadyDate).sort()[0];const expected=b.items.reduce((n,i)=>n+i.expectedUsableYieldGrams,0);const harvested=b.items.reduce((n,i)=>n+(i.actualYieldGrams??0),0);return <tr key={b.id}><td><strong>{b.batchNumber}</strong></td><td>{b.items.map(i=><span className="badge text-bg-light me-1" key={i.id}>{i.productName} · {i.trayCount} trays</span>)}</td><td>{b.locationName||"—"}</td><td>{formatDate(b.startDate)}</td><td>{formatDate(ready)}</td><td>{expected.toLocaleString()} gms</td><td>{harvested.toLocaleString()} gms</td><td><span className={`badge text-bg-${statusClass(b.status)}`}>{statusLabel(b.status)}</span><div className="mt-1 d-flex gap-1 flex-wrap">{b.stockAdjusted&&<span className="badge text-bg-success">Stock adjusted</span>}{b.delivered&&<span className="badge text-bg-primary">Delivered</span>}</div></td><td className="text-end"><button className="btn btn-sm btn-outline-primary" onClick={()=>onView(b)}><i className="bi bi-eye me-1"/>View</button></td></tr>})}
      {!filtered.length&&!loading&&<tr><td colSpan={11} className="text-center text-muted py-5"><i className="bi bi-seedling fs-2 d-block mb-2"/>No growing batches found.</td></tr>}
      {loading&&<tr><td colSpan={11} className="text-center py-5"><span className="spinner-border spinner-border-sm me-2"/>Loading...</td></tr>}
    </tbody></table></div>
  </div>;
}

function CreateBatch({products,locations,uid,email,onCancel,onCreated,onError}:{products:Product[];locations:Location[];uid:string;email?:string;onCancel:()=>void;onCreated:()=>Promise<void>;onError:(x:string)=>void}){
  const [startDate,setStartDate]=useState(today()),[locationId,setLocationId]=useState(""),[notes,setNotes]=useState("");
  const [trayCounts,setTrayCounts]=useState<Record<string,number>>({}),[saving,setSaving]=useState(false);
  const activeProducts=products.filter(p=>p.status!=="inactive"&&p.growingActive!==false&&Number(p.growingCycleDays??0)>0&&Number(p.expectedYieldGramsPerTray??p.expectedYieldGramsPerBatch??0)>0);
  const activeLocations=locations.filter(l=>l.active);
  const selectedProducts=activeProducts.filter(p=>(trayCounts[p.id]??0)>0);
  async function save(e:React.FormEvent){e.preventDefault();onError("");if(!selectedProducts.length)return onError("Add at least one product and enter its tray count.");if(!locationId)return onError("Select a growing location.");setSaving(true);try{
    const location=locations.find(l=>l.id===locationId);const batchNumber=`B-${new Date().getTime().toString().slice(-6)}`;
    await createGrowingBatch({batchNumber,startDate,locationId,locationName:location?.name,notes,items:selectedProducts.map(p=>buildBatchItem(p,startDate,trayCounts[p.id])),uid,email});
    await onCreated();
  }catch(err){onError(err instanceof Error?err.message:"Unable to create batch.");}finally{setSaving(false);}}
  return <form onSubmit={save}><div className="card"><div className="card-header"><h3 className="card-title mb-0">Create Growing Batch</h3></div><div className="card-body">
    <div className="row g-4"><div className="col-lg-7"><div className="card border"><div className="card-header"><strong>Growing Information</strong></div><div className="card-body">
      <div className="row g-3"><div className="col-md-6"><label className="form-label">Start date *</label><input className="form-control" type="date" value={startDate} onChange={e=>setStartDate(e.target.value)} required/></div><div className="col-md-6"><label className="form-label">Growing location *</label><select className="form-select" value={locationId} onChange={e=>setLocationId(e.target.value)} required><option value="">Select location...</option>{activeLocations.map(l=><option key={l.id} value={l.id}>{l.name} · {statusLabel(l.type)}</option>)}</select>{!activeLocations.length&&<div className="form-text text-warning">Add an active location in Administration → Locations first.</div>}</div></div>
      <div className="d-flex justify-content-between align-items-center mt-4 mb-2"><label className="form-label mb-0">Products and trays *</label><span className="small text-muted">Enter how many trays you are growing</span></div>
      <div className="border rounded overflow-hidden"><div className="table-responsive"><table className="table table-sm align-middle mb-0"><thead><tr><th style={{width:36}}></th><th>Product</th><th>Cycle</th><th>Expected / tray</th><th style={{width:130}}>Trays</th></tr></thead><tbody>
        {activeProducts.map(p=>{const cycle=Number(p.growingCycleDays??0),yieldPerTray=Number(p.expectedYieldGramsPerTray??p.expectedYieldGramsPerBatch??0);return <tr key={p.id}><td><input type="checkbox" className="form-check-input" checked={(trayCounts[p.id]??0)>0} onChange={e=>setTrayCounts(v=>({...v,[p.id]:e.target.checked?1:0}))}/></td><td><strong>{p.name}</strong></td><td>{cycle} days</td><td>{yieldPerTray.toLocaleString()} gms</td><td><input className="form-control form-control-sm" type="number" min="0" step="1" value={trayCounts[p.id]??0} onChange={e=>setTrayCounts(v=>({...v,[p.id]:Math.max(0,Number(e.target.value)||0)}))}/></td></tr>})}
        {!activeProducts.length&&<tr><td colSpan={5} className="text-center text-muted py-4">No products are ready for growing. Configure Growing cycle and Expected yield per tray in Products first.</td></tr>}
      </tbody></table></div></div>
    </div></div></div>
    <div className="col-lg-5"><div className="card border"><div className="card-header"><strong>Production Preview</strong></div><div className="card-body">
      {selectedProducts.length?selectedProducts.map(p=>{const i=buildBatchItem(p,startDate,trayCounts[p.id]);return <div className="border-bottom py-3" key={p.id}><div className="d-flex justify-content-between"><strong>{p.name}</strong><span className="badge text-bg-light">{i.trayCount} trays</span></div><div className="small text-muted mt-1">Ready {formatDate(i.expectedReadyDate)}</div><div className="row small mt-2"><div className="col-4">Expected<strong className="d-block">{i.expectedYieldGrams.toLocaleString()}gms</strong></div><div className="col-4">Loss<strong className="d-block">{i.expectedLossGrams.toLocaleString()}gms</strong></div><div className="col-4">Usable<strong className="d-block">{i.expectedUsableYieldGrams.toLocaleString()}gms</strong></div></div></div>})
      :<div className="text-muted">Select products and enter tray counts to see the production estimate.</div>}
      {selectedProducts.length>0&&<div className="pt-3"><strong>Total expected usable</strong><div className="h4 mb-0">{selectedProducts.reduce((n,p)=>n+buildBatchItem(p,startDate,trayCounts[p.id]).expectedUsableYieldGrams,0).toLocaleString()} gms</div></div>}
    </div></div><div className="card border mt-3"><div className="card-header"><strong>Notes</strong></div><div className="card-body"><textarea className="form-control" rows={4} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Optional growing notes..."/></div></div></div></div>
  </div><div className="card-footer d-flex justify-content-end gap-2"><button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button><button className="btn btn-success" disabled={saving}>{saving?"Creating...":"Create Batch"}</button></div></div></form>;
}

function BatchDetails({batch,uid,email,onBack,onSaved,onError}:{batch:GrowingBatch;uid:string;email?:string;onBack:()=>void;onSaved:()=>Promise<void>;onError:(x:string)=>void}){
  const [harvestItem,setHarvestItem]=useState<GrowingBatchItem|null>(null),[yieldGrams,setYieldGrams]=useState(0),[wastage,setWastage]=useState(0),[readyDate,setReadyDate]=useState(today()),[notes,setNotes]=useState(""),[saving,setSaving]=useState(false);
  async function harvest(e:React.FormEvent){e.preventDefault();onError("");if(!harvestItem)return;setSaving(true);try{await harvestGrowingBatchItem(batch,harvestItem.id,yieldGrams,readyDate,wastage,notes,uid,email);setHarvestItem(null);setYieldGrams(0);setWastage(0);setNotes("");await onSaved();}catch(err){onError(err instanceof Error?err.message:"Unable to harvest batch item.");}finally{setSaving(false);}}
  const expected=batch.items.reduce((n,i)=>n+i.expectedUsableYieldGrams,0),actual=batch.items.reduce((n,i)=>n+(i.actualYieldGrams??0),0);
  return <>
    <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3"><div><h2 className="h4 mb-1">{batch.batchNumber}</h2><div className="text-muted">Started {formatDate(batch.startDate)} · {batch.locationName||"No location"}</div><div className="mt-2 d-flex gap-2 flex-wrap">{batch.stockAdjusted&&<span className="badge text-bg-success">Stock adjusted</span>}{batch.delivered&&<span className="badge text-bg-primary">Delivered</span>}{!batch.stockAdjusted&&!batch.delivered&&<span className="badge text-bg-warning">Pending batch stock</span>}</div></div><div className="d-flex gap-2"><button className="btn btn-outline-secondary" onClick={onBack}><i className="bi bi-arrow-left me-1"/>Back to batches</button>{!batch.delivered&&<button className="btn btn-outline-primary" onClick={async()=>{const ok=await confirmAction({title:"Mark batch as delivered?",text:`${batch.batchNumber} will be marked delivered and hidden from the Batch-wise Stock selector.`,confirmText:"Mark Delivered"});if(!ok)return;try{await markGrowingBatchDelivered(batch,uid,email);await showSuccess("Batch marked delivered");await onSaved();}catch(e){await showError(e,"Unable to mark batch as delivered.");}}}><i className="bi bi-truck me-1"/>Mark Delivered</button>}</div></div>
    <div className="row g-3 mb-3"><div className="col-md-4"><div className="card seedlings-kpi-card h-100"><div className="card-body"><div className="text-muted small">Expected usable</div><div className="h4 mb-0">{expected.toLocaleString()} gms</div></div></div></div><div className="col-md-4"><div className="card seedlings-kpi-card h-100"><div className="card-body"><div className="text-muted small">Actually usable harvested</div><div className="h4 mb-0">{actual.toLocaleString()} gms</div></div></div></div><div className="col-md-4"><div className="card seedlings-kpi-card h-100"><div className="card-body"><div className="text-muted small">Batch status</div><div className="h4 mb-0">{statusLabel(batch.status)}</div></div></div></div></div>
    <div className="card"><div className="card-header"><h3 className="card-title mb-0">Products in this Batch</h3></div><div className="table-responsive"><table className="table table-hover align-middle mb-0"><thead><tr><th>Product</th><th>Trays</th><th>Cycle</th><th>Ready by</th><th>Expected / tray</th><th>Actual usable</th><th>Expected usable</th><th>Actual loss</th><th>Actual harvested</th><th>Status</th><th className="text-end">Action</th></tr></thead><tbody>{batch.items.map(item=><tr key={item.id}><td><strong>{item.productName}</strong></td><td>{item.trayCount}</td><td>{item.growingCycleDays} days</td><td>{formatDate(item.expectedReadyDate)}</td><td>{item.expectedYieldGramsPerTray.toLocaleString()} gms</td><td>{item.actualYieldGrams==null?"—":`${item.actualYieldGrams.toLocaleString()} gms`}</td><td>{item.expectedUsableYieldGrams.toLocaleString()} gms</td><td>{item.wastageGrams==null?"—":`${item.wastageGrams.toLocaleString()} gms`}</td><td>{item.actualHarvestGrams==null?"—":`${item.actualHarvestGrams.toLocaleString()} gms`}</td><td><span className={`badge text-bg-${statusClass(item.status)}`}>{statusLabel(item.status)}</span></td><td className="text-end">{!["harvested","failed"].includes(item.status)&&<button className="btn btn-sm btn-success" onClick={()=>{setHarvestItem(item);setYieldGrams(item.expectedUsableYieldGrams + item.expectedLossGrams);setWastage(item.expectedLossGrams);setReadyDate(today());}}><i className="bi bi-basket2 me-1"/>Harvest</button>}</td></tr>)}</tbody></table></div></div>
    {harvestItem&&<div className="card border-success mt-3"><div className="card-header"><h3 className="card-title mb-0">Harvest — {harvestItem.productName}</h3></div><form onSubmit={harvest}><div className="card-body"><div className="alert alert-info mb-3"><strong>This updates inventory.</strong> Actual loss is deducted from the harvested quantity. Only the remaining usable grams are added to this product's inventory.</div><div className="row g-3"><div className="col-md-4"><label className="form-label">Harvested before loss (gms) *</label><input className="form-control" type="number" min="0" step="1" value={yieldGrams} onChange={e=>setYieldGrams(Number(e.target.value))} required/></div><div className="col-md-4"><label className="form-label">Actual loss (gms)</label><input className="form-control" type="number" min="0" step="1" value={wastage} onChange={e=>setWastage(Number(e.target.value))}/></div><div className="col-md-4"><label className="form-label">Harvest date *</label><input className="form-control" type="date" value={readyDate} onChange={e=>setReadyDate(e.target.value)} required/></div></div><div className="alert alert-secondary mt-3 mb-3"><div className="d-flex justify-content-between"><span>Actual usable quantity added to inventory</span><strong>{Math.max(0,yieldGrams-wastage).toLocaleString()} gms</strong></div></div><div className="mt-3"><label className="form-label">Harvest notes</label><textarea className="form-control" rows={3} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Quality, actual tray performance, etc."/></div></div><div className="card-footer d-flex justify-content-end gap-2"><button type="button" className="btn btn-secondary" onClick={()=>setHarvestItem(null)}>Cancel</button><button className="btn btn-success" disabled={saving}>{saving?"Updating inventory...":"Confirm Harvest"}</button></div></form></div>}
  </>;
}
