"use client";

import {useEffect,useState} from "react";
import {AdminPage} from "@/components/admin/AdminPage";
import {listCollection} from "@/lib/firestore";
import {createSubscriptionPlan,deleteSubscriptionPlan,isSubscriptionPlanInUse,updateSubscriptionPlan} from "@/lib/subscriptionPlanService";
import {listSalesProducts} from "@/lib/salesProductService";
import type {SubscriptionPlan,SubscriptionFrequency} from "@/types/subscriptionPlan";
import type {SalesProduct} from "@/types/salesProduct";
import {SUBSCRIPTION_FREQUENCIES,subscriptionFrequencyLabel} from "@/types/subscriptionPlan";
import {confirmAction,showError,showSuccess} from "@/lib/alerts";
import {buildSubscriptionPlanSellingOptions,calculateSubscriptionPlanPrice,current100gSellingPrice,normalizeSubscriptionPlanSellingOptions} from "@/lib/subscriptionPlanPricing";

function money(v:number){return `₹${Number(v||0).toFixed(2)}`;}
function currentProduct100gPrice(product?:SalesProduct){if(!product)return undefined;try{return current100gSellingPrice(product.sellingOptions??[])}catch{return undefined}}
function maximumForDisplay(deliveriesPerTerm:number,price?:number){if(price===undefined||!Number.isInteger(deliveriesPerTerm)||deliveriesPerTerm<1)return undefined;return calculateSubscriptionPlanPrice(deliveriesPerTerm,price)}
const emptyPlan={salableProductId:"",salableProductName:"",name:"",frequency:"monthly" as SubscriptionFrequency,deliveriesPerTerm:4,skipsAllowed:0,price:0,maximumPlanPrice:0,active:true,description:""};

export default function SubscriptionMastersPage(){
 const[plans,setPlans]=useState<SubscriptionPlan[]>([]);const[salableProducts,setSalableProducts]=useState<SalesProduct[]>([]);
 const[editingPlan,setEditingPlan]=useState<SubscriptionPlan|null>(null);const[tab,setTab]=useState<"list"|"form">("list");const[formDirty,setFormDirty]=useState(false);const[loading,setLoading]=useState(true);const[error,setError]=useState("");
 async function load(){setLoading(true);try{const[p,sp]=await Promise.all([listCollection<SubscriptionPlan>("subscriptionPlans","updatedAt"),listSalesProducts()]);setPlans(p.map(plan=>{const product=sp.find(item=>item.id===plan.salableProductId);const price=currentProduct100gPrice(product);const normalizedOptions=normalizeSubscriptionPlanSellingOptions(plan.sellingOptions);const currentOptions=product?.sellingOptions??[];const relevantOptions=normalizedOptions.filter(saved=>currentOptions.some(option=>option.active!==false&&(option.id===saved.id||Number(option.weightGrams)===Number(saved.weightGrams))));const sellingOptions=product?buildSubscriptionPlanSellingOptions(currentOptions,plan.deliveriesPerTerm,relevantOptions):normalizedOptions;return {...plan,...(price===undefined?{maximumPlanPrice:undefined}:{price,maximumPlanPrice:calculateSubscriptionPlanPrice(plan.deliveriesPerTerm,price)}),sellingOptions}}));setSalableProducts(sp);setError("")}catch(e){setError(e instanceof Error?e.message:"Unable to load subscription plans.")}finally{setLoading(false)}}
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
 function openAdd(){setEditingPlan(null);setFormDirty(false);setError("");setTab("form")}
 function openEdit(plan:SubscriptionPlan){setEditingPlan(plan);setFormDirty(false);setError("");setTab("form")}
 async function showPlanList(){
  if(formDirty&&!(await confirmAction({title:"Discard unsaved changes?",text:"Your changes to this subscription plan will be lost.",confirmText:"Discard changes"})))return;
  setFormDirty(false);setEditingPlan(null);setTab("list");
 }
 async function savedPlan(){setFormDirty(false);setEditingPlan(null);setTab("list");await load()}
 return <AdminPage><div className="container-fluid py-3">
  <div className="d-flex flex-wrap justify-content-between align-items-end gap-3 mb-3"><div><h1 className="h3 seedlings-brand mb-1">Subscription Plans</h1><p className="text-muted mb-0">Define product-wise subscription plans before creating customer subscriptions.</p></div>{tab==="list"&&<div className="d-flex gap-2"><button className="btn btn-outline-secondary" onClick={()=>void load()}><i className="bi bi-arrow-clockwise"/></button><button className="btn btn-success" onClick={openAdd}><i className="bi bi-plus-lg me-1"/>Add Subscription Plan</button></div>}</div>
  {error&&<div className="alert alert-danger">{error}</div>}
  <ul className="nav nav-tabs mb-3">
   <li className="nav-item"><button type="button" className={`nav-link ${tab==="list"?"active":""}`} aria-selected={tab==="list"} onClick={()=>void showPlanList()}>Subscription Plans</button></li>
   <li className="nav-item"><button type="button" className={`nav-link ${tab==="form"?"active":""}`} aria-selected={tab==="form"} disabled={tab!=="form"} onClick={()=>setTab("form")}>{editingPlan?"Edit Subscription Plan":"Add Subscription Plan"}</button></li>
  </ul>
  {tab==="list"?<div className="card"><div className="card-header"><strong>Subscription Plan Master</strong><div className="small text-muted">Monthly, Quarterly, Half-Yearly and Yearly plans.</div></div>
   <div className="table-responsive"><table className="table table-hover align-middle mb-0"><thead><tr><th>Product</th><th>Plan</th><th>Frequency</th><th>Deliveries</th><th>Skips Allowed</th><th>Plan Price</th><th>Maximum Plan Price</th><th>Selling Options</th><th>Status</th><th className="text-end">Actions</th></tr></thead><tbody>{plans.map(x=>{const price=currentProduct100gPrice(salableProducts.find(product=>product.id===x.salableProductId));return <tr key={x.id}><td><strong>{x.salableProductName||"—"}</strong></td><td><strong>{x.name}</strong><div className="small text-muted">{x.description||""}</div></td><td>{subscriptionFrequencyLabel(x.frequency)}</td><td>{x.deliveriesPerTerm}</td><td>{x.skipsAllowed ?? 0}</td><td>{price===undefined?"—":money(price)} <span className="text-muted small">(per 100gms)</span></td><td>{price===undefined?"—":money(calculateSubscriptionPlanPrice(x.deliveriesPerTerm,price))}</td><td>{(x.sellingOptions ?? []).length ? (x.sellingOptions ?? []).map(o => `${o.weightGrams >= 1000 && o.weightGrams % 1000 === 0 ? `${o.weightGrams / 1000}kg` : `${o.weightGrams}g`} ₹${Number(o.planPrice || 0).toFixed(2)}${o.maximumPlanPrice === undefined ? "" : ` (maximum ₹${Number(o.maximumPlanPrice).toFixed(2)})`}`).join(", ") : <span className="text-muted">—</span>}</td><td><span className={`badge text-bg-${x.active?"success":"secondary"}`}>{x.active?"Active":"Inactive"}</span></td><td className="text-end"><button className="btn btn-sm btn-outline-primary me-1" onClick={()=>openEdit(x)}>Edit</button><button className="btn btn-sm btn-outline-secondary me-1" onClick={()=>void togglePlan(x)}>{x.active?"Disable":"Enable"}</button><button className="btn btn-sm btn-outline-danger" onClick={()=>void removePlan(x)}>Delete</button></td></tr>})}{!plans.length&&!loading&&<tr><td colSpan={10} className="text-center text-muted py-5">No subscription plans defined.</td></tr>}</tbody></table></div>
  </div>:<PlanForm value={editingPlan} salableProducts={salableProducts} onCancel={()=>void showPlanList()} onDirtyChange={setFormDirty} onSaved={savedPlan} onError={error=>{void showError(error,"Unable to save subscription plan.")}}/>}
 </div></AdminPage>
}

function PlanForm({value,salableProducts,onCancel,onDirtyChange,onSaved,onError}:{value:SubscriptionPlan|null;salableProducts:SalesProduct[];onCancel:()=>void;onDirtyChange:(dirty:boolean)=>void;onSaved:()=>Promise<void>;onError:(error:unknown)=>void}){
 const selectedProductForEdit=value?salableProducts.find(x=>x.id===value.salableProductId):undefined;
 const activeProductOptions=(selectedProductForEdit?.sellingOptions??[]).filter(o=>o.active!==false&&Number(o.weightGrams)>0);
 const savedOptions=value?.sellingOptions??[];
 const savedByOption=(option:{id:string;weightGrams:number})=>savedOptions.find(saved=>saved.id===option.id)??savedOptions.find(saved=>Number(saved.weightGrams)===Number(option.weightGrams));
 const validSavedOptions=savedOptions.filter(option=>
   activeProductOptions.some(productOption=>productOption.id===option.id||Number(productOption.weightGrams)===Number(option.weightGrams))
 );
 const initialSellingOptions=value
   ? buildSubscriptionPlanSellingOptions(activeProductOptions, value.deliveriesPerTerm, [], validSavedOptions)
   : [];
 const initialAutoPricedOptions=value
   ? activeProductOptions.filter(option=>savedByOption(option)?.planPrice === undefined || savedByOption(option)?.planPrice === null).map(option=>option.id)
   : [];
 const initialBasePrice=currentProduct100gPrice(selectedProductForEdit);
 const initial=value?{...value,salableProductId:value.salableProductId??"",salableProductName:value.salableProductName??"",skipsAllowed:value.skipsAllowed??0,price:initialBasePrice??0,maximumPlanPrice:initialBasePrice===undefined?0:calculateSubscriptionPlanPrice(value.deliveriesPerTerm,initialBasePrice),sellingOptions:initialSellingOptions}:emptyPlan;
 const[v,setV]=useState<SubscriptionPlan>(initial as SubscriptionPlan);const[saving,setSaving]=useState(false);
 const[autoPricedOptionIds,setAutoPricedOptionIds]=useState<string[]>(initialAutoPricedOptions);
 const initialSignature=JSON.stringify(initial);
 useEffect(()=>{onDirtyChange(JSON.stringify(v)!==initialSignature)},[v,initialSignature,onDirtyChange]);
 const selectedProduct=salableProducts.find(x=>x.id===v.salableProductId);
 const productOptions=(selectedProduct?.sellingOptions??[]).filter(o=>o.active!==false && Number(o.weightGrams)>0);
 const displayOptions = productOptions;
 const selected100gPrice=currentProduct100gPrice(selectedProduct);
 const displayedMaximumPrice=maximumForDisplay(Number(v.deliveriesPerTerm),selected100gPrice);
 const currentOptionFor=(option:{id:string;weightGrams:number}) =>
   (v.sellingOptions??[]).find(x=>x.id===option.id) ??
   (v.sellingOptions??[]).find(x=>Number(x.weightGrams)===Number(option.weightGrams));
 function optionLabel(weight:number){return weight>=1000&&weight%1000===0?`${weight/1000}kg`:`${weight}g`;}
 function setDeliveriesPerTerm(deliveriesPerTerm:number){
   const maximumPlanPrice=Number.isInteger(deliveriesPerTerm)&&deliveriesPerTerm>0&&Number.isFinite(v.price)&&v.price>0?calculateSubscriptionPlanPrice(deliveriesPerTerm,v.price):0;
   setV(x=>({...x,deliveriesPerTerm,maximumPlanPrice,sellingOptions:(x.sellingOptions??[]).map(planOption=>{
     const productOption=productOptions.find(option=>option.id===planOption.id);
     if(!productOption)return planOption;
     try{
       const maximumPlanPrice=calculateSubscriptionPlanPrice(deliveriesPerTerm,Number(productOption.price));
       return {...planOption,maximumPlanPrice,...(autoPricedOptionIds.includes(planOption.id)?{planPrice:maximumPlanPrice}:{})};
     }catch{return {...planOption,maximumPlanPrice:Number.NaN,...(autoPricedOptionIds.includes(planOption.id)?{planPrice:Number.NaN}:{})}}
   })}));
 }
 function freq(f:SubscriptionFrequency){
   const deliveriesPerTerm=f==="monthly"?4:f==="quarterly"?12:f==="half_yearly"?24:48;
   setV(x=>({...x,frequency:f}));
   setDeliveriesPerTerm(deliveriesPerTerm);
 }
 function selectProduct(id:string){
   const product=salableProducts.find(x=>x.id===id);
   const nextProductOptions=(product?.sellingOptions??[]).filter(o=>o.active!==false&&Number(o.weightGrams)>0);
   const sameProduct=product?.id===v.salableProductId;
   const existing=sameProduct?(v.sellingOptions??[]):[];
   let next:SubscriptionPlan["sellingOptions"]=[];
   try{next=buildSubscriptionPlanSellingOptions(nextProductOptions,v.deliveriesPerTerm,existing)}
   catch(error){void showError(error,"Unable to calculate subscription plan prices.");return}
   const price=currentProduct100gPrice(product)??0;
   setAutoPricedOptionIds(sameProduct?autoPricedOptionIds.filter(optionId=>nextProductOptions.some(option=>option.id===optionId)):next.map(option=>option.id));
   setV(x=>({...x,salableProductId:product?.id??"",salableProductName:product?.name??"",price,maximumPlanPrice:price>0?calculateSubscriptionPlanPrice(x.deliveriesPerTerm,price):0,sellingOptions:next}));
 }
 function updateOption(option:{id:string;weightGrams:number},planPrice:number){
   setAutoPricedOptionIds(ids=>ids.filter(id=>id!==option.id));
   setV(x=>{
   const options=x.sellingOptions??[];
   const index=options.findIndex(o=>o.id===option.id||Number(o.weightGrams)===Number(option.weightGrams));
   if(index<0){
     return {...x,sellingOptions:[...options,{id:option.id,weightGrams:Number(option.weightGrams),planPrice}]};
   }
   return {...x,sellingOptions:options.map((o,i)=>i===index?{...o,planPrice}:o)};
 })}
 async function save(e:React.FormEvent){e.preventDefault();setSaving(true);try{
   if(!v.salableProductId) throw new Error("Salable Product is required.");
   if(!v.name.trim()) throw new Error("Plan name is required.");
   if(!Number.isInteger(Number(v.deliveriesPerTerm))||Number(v.deliveriesPerTerm)<1)throw new Error("Deliveries per term must be a positive whole number.");
   if(!Number.isInteger(Number(v.skipsAllowed))||Number(v.skipsAllowed)<0)throw new Error("Skips allowed must be a non-negative whole number.");
   const price=current100gSellingPrice(selectedProduct?.sellingOptions??[]);
   const maximumPlanPrice=calculateSubscriptionPlanPrice(Number(v.deliveriesPerTerm),price);
   const options=buildSubscriptionPlanSellingOptions(
     displayOptions,
     Number(v.deliveriesPerTerm),
     v.sellingOptions??[],
     [],
     autoPricedOptionIds,
   );
   if(displayOptions.length && options.length!==displayOptions.length) throw new Error("Plan price is required for every active selling option of the selected product.");
   if(options.some(o=>typeof o.planPrice!=="number"||!Number.isFinite(o.planPrice)||o.planPrice<0)) throw new Error("Plan price cannot be negative.");
   const payload={...v,price,maximumPlanPrice,sellingOptions:options,deliveryChargeMode:"included" as const,deliveryCharge:0};
   if(value)await updateSubscriptionPlan(value.id,payload,autoPricedOptionIds);else await createSubscriptionPlan(payload,autoPricedOptionIds);await onSaved()
 }catch(e){onError(e)}finally{setSaving(false)}}
 return <form onSubmit={save} noValidate><div className="card"><div className="card-header"><h2 className="h5 mb-0">{value?"Edit Subscription Plan":"Add Subscription Plan"}</h2></div><div className="card-body"><div className="row g-3">
  <div className="col-md-6"><label className="form-label">Product *</label><select className="form-select" value={v.salableProductId} onChange={e=>selectProduct(e.target.value)} required disabled={!!value}><option value="">Select Product</option>{salableProducts.filter(x=>x.active!==false).map(x=><option key={x.id} value={x.id}>{x.name}{x.sku?` (${x.sku})`:""}</option>)}</select>{value&&<div className="form-text">Product and its selling options are read-only while editing. Actual Subscription Plan Prices can be updated.</div>}</div>
  <div className="col-md-6"><label className="form-label">Plan name *</label><input className="form-control" value={v.name} onChange={e=>setV({...v,name:e.target.value})} required/></div>
  <div className="col-md-6"><label className="form-label">Frequency *</label><select className="form-select" value={v.frequency} onChange={e=>freq(e.target.value as SubscriptionFrequency)}>{SUBSCRIPTION_FREQUENCIES.map(f=><option key={f} value={f}>{subscriptionFrequencyLabel(f)}</option>)}</select></div>
  <div className="col-md-6"><label className="form-label">Deliveries per term *</label><input className="form-control" type="number" min="1" step="1" value={v.deliveriesPerTerm} onChange={e=>setDeliveriesPerTerm(Number(e.target.value))}/><div className="form-text">Defaults: Monthly 4, Quarterly 12, Half-Yearly 24, Yearly 48. Editable.</div></div>
  <div className="col-md-6"><label className="form-label">No. of skips allowed *</label><input className="form-control" type="number" min="0" step="1" value={v.skipsAllowed} onChange={e=>setV({...v,skipsAllowed:Math.max(0,Number(e.target.value)||0)})}/><div className="form-text">Maximum number of deliveries the customer can skip during the subscription term.</div></div>
  <div className="col-md-6"><label className="form-label">Plan Price <span className="text-muted">(per 100gms)</span> *</label><div className="input-group"><span className="input-group-text">₹</span><input className="form-control" type="number" min="0" step="0.01" value={selected100gPrice??""} readOnly aria-readonly="true"/></div><div className="form-text">Read-only current 100gms Selling Price from the selected Product.</div></div>
  <div className="col-md-6"><label className="form-label">Maximum Plan Price</label><div className="input-group"><span className="input-group-text">₹</span><input className="form-control" type="number" value={displayedMaximumPrice??""} readOnly aria-readonly="true"/></div><div className="form-text">Current 100gms Selling Price × deliveries per term. This is informational; discounted plan prices are allowed.</div></div>
  {displayOptions.length>0&&<div className="col-12"><div className="card border"><div className="card-header"><strong>Selling Options</strong></div><div className="card-body"><div className="small text-muted mb-3">Selling options are taken from the selected Product and are read-only. Maximum Plan Price shows the regular selling total for the term; discounted Subscription Plan Prices are allowed.</div><div className="table-responsive"><table className="table table-sm align-middle mb-0"><thead><tr><th>Packaging</th><th>Product Selling Price</th><th>Maximum Plan Price</th><th style={{width:240}}>Subscription Plan Price</th></tr></thead><tbody>{displayOptions.map(option=>{const current=currentOptionFor(option);const maximumPlanPrice=current?.maximumPlanPrice??calculateSubscriptionPlanPrice(Number(v.deliveriesPerTerm),Number(option.price));return <tr key={option.id}><td><strong>{optionLabel(Number(option.weightGrams))}</strong></td><td>₹{Number(option.price||0).toFixed(2)}</td><td>₹{Number(maximumPlanPrice).toFixed(2)}</td><td><div className="input-group"><span className="input-group-text">₹</span><input className="form-control" type="number" min="0" step="0.01" value={Number(current?.planPrice??0)} onChange={e=>updateOption(option,Number(e.target.value))} required/></div></td></tr>})}</tbody></table></div></div></div></div>}
  <div className="col-12"><label className="form-label">Description</label><textarea className="form-control" rows={2} value={v.description??""} onChange={e=>setV({...v,description:e.target.value})}/></div>
  <div className="col-12"><div className="alert alert-light border mb-0">Plan Price (per 100gms): <strong>{selected100gPrice===undefined?"—":money(selected100gPrice)}</strong><span className="mx-2">|</span>Maximum Plan Price: <strong>{displayedMaximumPrice===undefined?"—":money(displayedMaximumPrice)}</strong></div></div>
 </div></div><div className="card-footer d-flex justify-content-end gap-2"><button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>Cancel</button><button className="btn btn-success" disabled={saving}>{saving?"Saving...":"Save Plan"}</button></div></div></form>
}
