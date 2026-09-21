"use client";

import {useEffect,useState} from "react";
import {AdminPage} from "@/components/admin/AdminPage";
import {listCollection} from "@/lib/firestore";
import {createDeliveryCharge,deleteDeliveryCharge,updateDeliveryCharge} from "@/lib/deliveryChargeService";
import type {DeliveryCharge} from "@/types/deliveryCharge";
import {deliveryScopeLabel} from "@/types/deliveryCharge";
import {confirmAction,showSuccess} from "@/lib/alerts";

function money(v:number){return `₹${Number(v||0).toFixed(2)}`;}
const emptyCharge={name:"",scope:"one_time_order" as const,mode:"flat" as const,amount:0,active:true,notes:""};

export default function DeliveryMastersPage(){
 const[charges,setCharges]=useState<DeliveryCharge[]>([]);const[editingCharge,setEditingCharge]=useState<DeliveryCharge|null>(null);const[showCharge,setShowCharge]=useState(false);const[loading,setLoading]=useState(true);const[error,setError]=useState("");
 async function load(){setLoading(true);try{setCharges(await listCollection<DeliveryCharge>("deliveryCharges","updatedAt"));setError("")}catch{setError("Unable to load delivery charges.")}finally{setLoading(false)}}
 useEffect(()=>{void load()},[]);
 async function toggleCharge(x:DeliveryCharge){try{await updateDeliveryCharge(x.id,{active:!x.active});await load()}catch(e){setError(e instanceof Error?e.message:"Unable to update delivery charge.")}}
 async function removeCharge(x:DeliveryCharge){if(!(await confirmAction({title:`Delete ${x.name}?`,text:"This action cannot be undone.",confirmText:"Yes, delete"})))return;try{await deleteDeliveryCharge(x.id);await load();await showSuccess("Delivery charge deactivated")}catch(e){setError(e instanceof Error?e.message:"Unable to delete delivery charge.")}}
 return <AdminPage><div className="container-fluid py-3">
  <div className="d-flex flex-wrap justify-content-between align-items-end gap-3 mb-3"><div><h1 className="h3 seedlings-brand mb-1">Delivery Charges Master</h1><p className="text-muted mb-0">Configure delivery charges independently for one-time orders and subscriptions.</p></div><button className="btn btn-outline-secondary" onClick={()=>void load()}><i className="bi bi-arrow-clockwise"/></button></div>
  {error&&<div className="alert alert-danger">{error}</div>}
  <div className="card"><div className="card-header d-flex justify-content-between align-items-center"><div><strong>Delivery Charges Master</strong><div className="small text-muted">Configure charges independently for one-time orders and subscriptions.</div></div><button className="btn btn-success" onClick={()=>{setEditingCharge(null);setShowCharge(true)}}><i className="bi bi-plus-lg me-1"/>Add Delivery Charge</button></div>
   <div className="table-responsive"><table className="table table-hover align-middle mb-0"><thead><tr><th>Name</th><th>Applies to</th><th>Charge</th><th>Status</th><th>Notes</th><th className="text-end">Actions</th></tr></thead><tbody>{charges.map(x=><tr key={x.id}><td><strong>{x.name}</strong></td><td>{deliveryScopeLabel(x.scope)}</td><td>{x.mode==="free"?"Free":`${money(x.amount)} / delivery`}</td><td><span className={`badge text-bg-${x.active?"success":"secondary"}`}>{x.active?"Active":"Inactive"}</span></td><td>{x.notes||"—"}</td><td className="text-end"><button className="btn btn-sm btn-outline-primary me-1" onClick={()=>{setEditingCharge(x);setShowCharge(true)}}>Edit</button><button className="btn btn-sm btn-outline-secondary me-1" onClick={()=>void toggleCharge(x)}>{x.active?"Disable":"Enable"}</button><button className="btn btn-sm btn-outline-danger" onClick={()=>void removeCharge(x)}>Delete</button></td></tr>)}{!charges.length&&!loading&&<tr><td colSpan={6} className="text-center text-muted py-5">No delivery charges defined.</td></tr>}</tbody></table></div>
  </div>
  {showCharge&&<ChargeModal value={editingCharge} onClose={()=>setShowCharge(false)} onSaved={async()=>{setShowCharge(false);await load()}} onError={setError}/>}
 </div></AdminPage>
}

function ChargeModal({value,onClose,onSaved,onError}:{value:DeliveryCharge|null;onClose:()=>void;onSaved:()=>Promise<void>;onError:(s:string)=>void}){
 const[v,setV]=useState(value?{...value}:emptyCharge);const[saving,setSaving]=useState(false);
 async function save(e:React.FormEvent){e.preventDefault();setSaving(true);try{if(value)await updateDeliveryCharge(value.id,v);else await createDeliveryCharge(v);await onSaved()}catch(e){onError(e instanceof Error?e.message:"Unable to save delivery charge.")}finally{setSaving(false)}}
 return <Modal title={value?"Edit Delivery Charge":"Add Delivery Charge"} close={onClose}><form onSubmit={save}><div className="row g-3">
  <div className="col-md-6"><label className="form-label">Name *</label><input className="form-control" value={v.name} onChange={e=>setV({...v,name:e.target.value})} required placeholder="e.g. Standard Delivery"/></div>
  <div className="col-md-6"><label className="form-label">Applies to *</label><select className="form-select" value={v.scope} onChange={e=>setV({...v,scope:e.target.value as any})}><option value="one_time_order">One-time Order</option><option value="subscription">Subscription</option></select></div>
  <div className="col-md-6"><label className="form-label">Charge type</label><select className="form-select" value={v.mode} onChange={e=>setV({...v,mode:e.target.value as any})}><option value="flat">Fixed charge</option><option value="free">Free delivery</option></select></div>
  <div className="col-md-6"><label className="form-label">Amount</label><div className="input-group"><span className="input-group-text">₹</span><input className="form-control" type="number" min="0" step="0.01" disabled={v.mode==="free"} value={v.amount} onChange={e=>setV({...v,amount:Number(e.target.value)})}/></div><div className="form-text">For subscriptions, this is charged per delivery when selected.</div></div>
  <div className="col-12"><label className="form-label">Notes</label><textarea className="form-control" rows={2} value={v.notes} onChange={e=>setV({...v,notes:e.target.value})}/></div>
 </div><div className="modal-footer px-0 pb-0 mt-3"><button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-success" disabled={saving}>{saving?"Saving...":"Save Delivery Charge"}</button></div></form></Modal>
}
function Modal({title,close,children}:{title:string;close:()=>void;children:React.ReactNode}){return <div className="modal d-block" role="dialog" aria-modal="true" tabIndex={-1}><div className="modal-dialog modal-lg modal-dialog-centered"><div className="modal-content"><div className="modal-header"><h2 className="modal-title h5 mb-0">{title}</h2><button className="btn-close" onClick={close} aria-label="Close"/></div><div className="modal-body">{children}</div></div></div></div>}
