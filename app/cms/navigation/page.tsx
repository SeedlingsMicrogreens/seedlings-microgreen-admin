"use client";
import {useEffect,useState} from "react";
import {AdminPage} from "@/components/admin/AdminPage";
import {createRecord,listCollection,updateRecord}from "@/lib/firestore";
import { showSuccess } from "@/lib/alerts";

const ITEMS=[
 {key:"home",label:"Home",url:"/",location:"header" as const},
 {key:"microgreens",label:"Microgreens",url:"/microgreens",location:"header" as const},
 {key:"journey",label:"Journey",url:"/journey",location:"header" as const},
 {key:"contact",label:"Contact",url:"/contact",location:"header" as const},
 {key:"account",label:"Account",url:"/account",location:"header" as const},
 {key:"cart",label:"Cart",url:"/cart",location:"header" as const},
 {key:"shopCta",label:"Shop Fresh",url:"/microgreens",location:"header" as const},
 {key:"footerMicrogreens",label:"Microgreens",url:"/microgreens",location:"footer" as const},
 {key:"footerJourney",label:"Our Journey",url:"/journey",location:"footer" as const},
 {key:"footerContact",label:"Contact",url:"/contact",location:"footer" as const},
 {key:"footerAccount",label:"My Account",url:"/account",location:"footer" as const},
] as const;
type Item={id:string;navKey:string;label:string;url:string;status:"draft"|"published"};
export default function NavigationPage(){const[items,setItems]=useState<Item[]>([]),[drafts,setDrafts]=useState<Record<string,string>>({}),[error,setError]=useState("");
 async function load(){try{const all=await listCollection<Item>("cmsNavigation");setItems(all);setDrafts(Object.fromEntries(ITEMS.map(def=>[def.key, all.find(i=>i.navKey===def.key)?.label ?? def.label])));setError("")}catch{setError("Unable to load navigation.")}}useEffect(()=>{void load()},[]);
 async function save(def:{key:string;label:string;url:string;location:"header"|"footer"}){try{const existing=items.find(x=>x.navKey===def.key);const p={navKey:def.key,label:def.label.trim() || def.label,url:def.url,status:"published" as const};if(existing)await updateRecord("cmsNavigation",existing.id,p);else await createRecord("cmsNavigation",p);await load();await showSuccess("Navigation saved")}catch{setError("Unable to save navigation.")}}
 return <AdminPage><div className="container-fluid py-3"><h1 className="h3 seedlings-brand">Navigation</h1><p className="text-muted">Fixed V2 navigation. You can edit the displayed label only; items, routes and order are controlled by the website.</p>{error&&<div className="alert alert-danger">{error}</div>}<div className="card"><div className="card-body table-responsive p-0"><table className="table mb-0"><thead><tr><th>Area</th><th>V2 item</th><th>Label shown</th><th>Route</th><th>Action</th></tr></thead><tbody>{ITEMS.map(def=>{const x=items.find(i=>i.navKey===def.key);return <tr key={def.key}><td>{def.location}</td><td>{def.label}</td><td><input className="form-control" value={drafts[def.key] ?? x?.label ?? def.label} onChange={e=>setDrafts(d=>({...d,[def.key]:e.target.value}))}/></td><td><code>{def.url}</code></td><td><button className="btn btn-sm btn-outline-primary" onClick={()=>void save({...def,label:drafts[def.key] ?? x?.label ?? def.label})}>Save</button></td></tr>})}</tbody></table></div></div></div></AdminPage>}
