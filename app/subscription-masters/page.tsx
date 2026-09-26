"use client";

import {useEffect,useState} from "react";
import {AdminPage} from "@/components/admin/AdminPage";
import {listCollection} from "@/lib/firestore";
import {createSubscriptionPlan,deleteSubscriptionPlan,isSubscriptionPlanInUse,updateSubscriptionPlan} from "@/lib/subscriptionPlanService";
import {listSalesProducts} from "@/lib/salesProductService";
import type {SubscriptionPlan,SubscriptionFrequency} from "@/types/subscriptionPlan";
import type {SalesProduct} from "@/types/salesProduct";
import {SUBSCRIPTION_FREQUENCIES,subscriptionFrequencyLabel} from "@/types/subscriptionPlan";
import {confirmAction,showSuccess} from "@/lib/alerts";

function money(v:number){return `₹${Number(v||0).toFixed(2)}`;}
const emptyPlan={salableProductId:"",salableProductName:"",name:"",frequency:"monthly" as SubscriptionFrequency,deliveriesPerTerm:4,skipsAllowed:0,price:0,active:true,description:""};

export default function SubscriptionMastersPage(){
 const[plans,setPlans]=useState<SubscriptionPlan[]>([]);const[salableProducts,setSalableProducts]=useState<SalesProduct[]>([]);
 const[editingPlan,setEditingPlan]=useState<SubscriptionPlan|null>(null);const[showPlan,setShowPlan]=useState(false);const[loading,setLoading]=useState(true);const[error,setError]=useState("");
 async function load(){setLoading(true);try{const[p,sp]=await Promise.all([listCollection<SubscriptionPlan>("subscriptionPlans","updatedAt"),listSalesProducts()]);setPlans(p);setSalableProducts(sp);setError("")}catch{setError("Unable to load subscription plans.")}finally{setLoading(false)}}
 useEffect(()=>{void load()},[]);
 async function togglePlan(x:SubscriptionPlan){try{await updateSubscriptionPlan(x.id,{active:!x.active});await load()}catch(e){setError(e instanceof Error?e.message:"Unable to update plan.")}}
 async function removePlan(x:SubscriptionPlan){
  setError("");
  try{
    // Check usage before showing confirmation. A plan already used by a customer
    // subscription must not prompt for a deletion that cannot be performed.
    if(await isSubscriptionPlanInUse(x.id)){
      setError("This subscription plan cannot be deleted because it is already used by one or more customer subscriptions.");
      return;
    }
    const confirmed=await confirmAction({title:`Delete ${x.name}?`,text:"This action cannot be undone.",confirmText:"Yes, delete"});
    if(!confirmed)return;
    await deleteSubscriptionPlan(x.id);
    await load();
    await showSuccess("Subscription plan deleted successfully");
  }catch(e){
    setError(e instanceof Error?e.message:"Unable to delete plan.");
  }
}
 return <AdminPage><div className="container-fluid py-3">
  <div className="d-flex flex-wrap justify-content-between align-items-end gap-3 mb-3"><div><h1 className="h3 seedlings-brand mb-1">Subscription Plans</h1><p className="text-muted mb-0">Define product-wise subscription plans before creating customer subscriptions.</p></div><button className="btn btn-outline-secondary" onClick={()=>void load()}><i className="bi bi-arrow-clockwise"/></button></div>
  {error&&<div className="alert alert-danger">{error}</div>}
  <div className="card"><div className="card-header d-flex justify-content-between align-items-center"><div><strong>Subscription Plan Master</strong><div className="small text-muted">Monthly, Quarterly, Half-Yearly and Yearly plans.</div></div><button className="btn btn-success" onClick={()=>{setEditingPlan(null);setShowPlan(true)}}><i className="bi bi-plus-lg me-1"/>Add Plan</button></div>
   <div className="table-responsive"><table className="table table-hover align-middle mb-0"><thead><tr><th>Product</th><th>Plan</th><th>Frequency</th><th>Deliveries</th><th>Skips Allowed</th><th>Plan Price</th><th>Selling Options</th><th>Status</th><th className="text-end">Actions</th></tr></thead><tbody>{plans.map(x=><tr key={x.id}><td><strong>{x.salableProductName||"—"}</strong></td><td><strong>{x.name}</strong><div className="small text-muted">{x.description||""}</div></td><td>{subscriptionFrequencyLabel(x.frequency)}</td><td>{x.deliveriesPerTerm}</td><td>{x.skipsAllowed ?? 0}</td><td>{money(x.price)} <span className="text-muted small">(per 100gms)</span></td><td>{(x.sellingOptions ?? []).length ? (x.sellingOptions ?? []).map(o => `${o.weightGrams >= 1000 && o.weightGrams % 1000 === 0 ? `${o.weightGrams / 1000}kg` : `${o.weightGrams}g`} ₹${Number(o.planPrice || 0).toFixed(2)}`).join(", ") : <span className="text-muted">—</span>}</td><td><span className={`badge text-bg-${x.active?"success":"secondary"}`}>{x.active?"Active":"Inactive"}</span></td><td className="text-end"><button className="btn btn-sm btn-outline-primary me-1" onClick={()=>{setEditingPlan(x);setShowPlan(true)}}>Edit</button><button className="btn btn-sm btn-outline-secondary me-1" onClick={()=>void togglePlan(x)}>{x.active?"Disable":"Enable"}</button><button className="btn btn-sm btn-outline-danger" onClick={()=>void removePlan(x)}>Delete</button></td></tr>)}{!plans.length&&!loading&&<tr><td colSpan={9} className="text-center text-muted py-5">No subscription plans defined.</td></tr>}</tbody></table></div>
  </div>
  {showPlan&&<PlanModal value={editingPlan} onClose={()=>setShowPlan(false)} salableProducts={salableProducts} onSaved={async()=>{setShowPlan(false);await load()}} onError={setError}/>}
 </div></AdminPage>
}

function PlanModal({value,salableProducts,onClose,onSaved,onError}:{value:SubscriptionPlan|null;salableProducts:SalesProduct[];onClose:()=>void;onSaved:()=>Promise<void>;onError:(s:string)=>void}){
 const selectedProductForEdit=value?salableProducts.find(x=>x.id===value.salableProductId):undefined;
 const activeProductOptions=(selectedProductForEdit?.sellingOptions??[]).filter(o=>o.active!==false&&Number(o.weightGrams)>0);
 const savedOptions=value?.sellingOptions??[];
 const savedById=new Map(savedOptions.map(o=>[o.id,o]));
 const savedByWeight=new Map(savedOptions.map(o=>[Number(o.weightGrams),o]));
 const initialSellingOptions=value
   ? activeProductOptions.map(o=>({
       id:o.id,
       weightGrams:Number(o.weightGrams),
       planPrice:Number(savedById.get(o.id)?.planPrice ?? savedByWeight.get(Number(o.weightGrams))?.planPrice ?? ((Number(value.price||0)*Number(o.weightGrams))/100).toFixed(2))
     }))
   : [];
 const initial=value?{...value,salableProductId:value.salableProductId??"",salableProductName:value.salableProductName??"",skipsAllowed:value.skipsAllowed??0,sellingOptions:initialSellingOptions}:emptyPlan;
 const[v,setV]=useState<SubscriptionPlan>(initial as SubscriptionPlan);const[saving,setSaving]=useState(false);
 const selectedProduct=salableProducts.find(x=>x.id===v.salableProductId);
 const productOptions=(selectedProduct?.sellingOptions??[]).filter(o=>o.active!==false && Number(o.weightGrams)>0);
 const displayOptions = productOptions;
 const currentOptionFor=(option:{id:string;weightGrams:number}) =>
   (v.sellingOptions??[]).find(x=>x.id===option.id) ??
   (v.sellingOptions??[]).find(x=>Number(x.weightGrams)===Number(option.weightGrams));
 function optionLabel(weight:number){return weight>=1000&&weight%1000===0?`${weight/1000}kg`:`${weight}g`;}
 function freq(f:SubscriptionFrequency){setV(x=>({...x,frequency:f,deliveriesPerTerm:f==="monthly"?4:f==="quarterly"?12:f==="half_yearly"?24:48}))}
 function selectProduct(id:string){
   const product=salableProducts.find(x=>x.id===id);
   const existing=new Map((v.sellingOptions??[]).map(o=>[o.id,o]));
   const next=(product?.sellingOptions??[]).filter(o=>o.active!==false&&Number(o.weightGrams)>0).map(o=>({id:o.id,weightGrams:Number(o.weightGrams),planPrice:existing.get(o.id)?.planPrice ?? Number(((Number(v.price||0)*Number(o.weightGrams))/100).toFixed(2))}));
   setV(x=>({...x,salableProductId:product?.id??"",salableProductName:product?.name??"",sellingOptions:next}));
 }
 function updateOption(option:{id:string;weightGrams:number},planPrice:number){setV(x=>{
   const options=x.sellingOptions??[];
   const index=options.findIndex(o=>o.id===option.id||Number(o.weightGrams)===Number(option.weightGrams));
   if(index<0){
     return {...x,sellingOptions:[...options,{id:option.id,weightGrams:Number(option.weightGrams),planPrice}]};
   }
   return {...x,sellingOptions:options.map((o,i)=>i===index?{...o,planPrice}:o)};
 })}
 async function save(e:React.FormEvent){e.preventDefault();setSaving(true);try{
   if(!v.salableProductId) throw new Error("Salable Product is required.");
   const options=displayOptions.map(productOption=>{
     const current=currentOptionFor(productOption);
     return {
       id: productOption.id,
       weightGrams: Number(productOption.weightGrams),
       planPrice: Number(current?.planPrice ?? 0),
     };
   });
   if(displayOptions.length && options.length!==displayOptions.length) throw new Error("Plan price is required for every active selling option of the selected product.");
   if(options.some(o=>!Number.isFinite(o.planPrice)||o.planPrice<0)) throw new Error("Plan price cannot be negative.");
   const payload={...v,price:Number(v.price),sellingOptions:options,deliveryChargeMode:"included" as const,deliveryCharge:0};
   if(value)await updateSubscriptionPlan(value.id,payload);else await createSubscriptionPlan(payload);await onSaved()
 }catch(e){onError(e instanceof Error?e.message:"Unable to save plan.")}finally{setSaving(false)}}
 return <Modal title={value?"Edit Subscription Plan":"Add Subscription Plan"} close={onClose}><form onSubmit={save}><div className="row g-3">
  <div className="col-md-6"><label className="form-label">Product *</label><select className="form-select" value={v.salableProductId} onChange={e=>selectProduct(e.target.value)} required disabled={!!value}><option value="">Select Product</option>{salableProducts.filter(x=>x.active!==false).map(x=><option key={x.id} value={x.id}>{x.name}{x.sku?` (${x.sku})`:""}</option>)}</select>{value&&<div className="form-text">Product and its selling options are read-only while editing. Subscription Plan Price can be updated.</div>}</div>
  <div className="col-md-6"><label className="form-label">Plan name *</label><input className="form-control" value={v.name} onChange={e=>setV({...v,name:e.target.value})} required/></div>
  <div className="col-md-6"><label className="form-label">Frequency *</label><select className="form-select" value={v.frequency} onChange={e=>freq(e.target.value as SubscriptionFrequency)}>{SUBSCRIPTION_FREQUENCIES.map(f=><option key={f} value={f}>{subscriptionFrequencyLabel(f)}</option>)}</select></div>
  <div className="col-md-6"><label className="form-label">Deliveries per term *</label><input className="form-control" type="number" min="1" value={v.deliveriesPerTerm} onChange={e=>setV({...v,deliveriesPerTerm:Number(e.target.value)})}/><div className="form-text">Defaults: Monthly 4, Quarterly 12, Half-Yearly 24, Yearly 48. Editable.</div></div>
  <div className="col-md-6"><label className="form-label">No. of skips allowed *</label><input className="form-control" type="number" min="0" step="1" value={v.skipsAllowed} onChange={e=>setV({...v,skipsAllowed:Math.max(0,Number(e.target.value)||0)})}/><div className="form-text">Maximum number of deliveries the customer can skip during the subscription term.</div></div>
  <div className="col-md-6"><label className="form-label">Plan Price <span className="text-muted">(per 100gms)</span> *</label><div className="input-group"><span className="input-group-text">₹</span><input className="form-control" type="number" min="0" step="0.01" value={v.price} onChange={e=>setV({...v,price:Number(e.target.value)})}/></div><div className="form-text">Base/reference subscription price for 100gms.</div></div>
  {displayOptions.length>0&&<div className="col-12"><div className="card border"><div className="card-header"><strong>Selling Options</strong></div><div className="card-body"><div className="small text-muted mb-3">Selling options are taken from the selected Product and are read-only. You can update the Subscription Plan Price for each option.</div><div className="table-responsive"><table className="table table-sm align-middle mb-0"><thead><tr><th>Packaging</th><th>Product Selling Price</th><th style={{width:240}}>Subscription Plan Price</th></tr></thead><tbody>{displayOptions.map(option=>{const current=currentOptionFor(option);return <tr key={option.id}><td><strong>{optionLabel(Number(option.weightGrams))}</strong></td><td>₹{Number(option.price||0).toFixed(2)}</td><td><div className="input-group"><span className="input-group-text">₹</span><input className="form-control" type="number" min="0" step="0.01" value={Number(current?.planPrice??0)} onChange={e=>updateOption(option,Number(e.target.value))} required/></div></td></tr>})}</tbody></table></div></div></div></div>}
  <div className="col-12"><label className="form-label">Description</label><textarea className="form-control" rows={2} value={v.description??""} onChange={e=>setV({...v,description:e.target.value})}/></div>
  <div className="col-12"><div className="alert alert-light border mb-0">Base plan price: <strong>{money(v.price)}</strong> <span className="text-muted">(per 100gms)</span></div></div>
 </div><div className="modal-footer px-0 pb-0 mt-3"><button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-success" disabled={saving}>{saving?"Saving...":"Save Plan"}</button></div></form></Modal>
}
function Modal({title,close,children}:{title:string;close:()=>void;children:React.ReactNode}){return <div className="modal d-block" role="dialog" aria-modal="true" tabIndex={-1}><div className="modal-dialog modal-lg modal-dialog-centered"><div className="modal-content"><div className="modal-header"><h2 className="modal-title h5 mb-0">{title}</h2><button className="btn-close" onClick={close} aria-label="Close"/></div><div className="modal-body">{children}</div></div></div></div>}
