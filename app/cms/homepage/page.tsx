"use client";
import {useEffect,useState} from "react";
import {AdminPage} from "@/components/admin/AdminPage";
import {createRecord,listCollectionByField,updateRecord} from "@/lib/firestore";
import {showSuccess} from "@/lib/alerts";
import {ImageUploader} from "@/components/ui/ImageUploader";

const SECTIONS=[
 {key:"trust",label:"Trust Points",fields:[
  ["freshTitle","Fresh to order","text"],["freshText","Fresh to order — description","textarea"],
  ["seedTitle","Non-GMO seeds","text"],["seedText","Non-GMO seeds — description","textarea"],
  ["waterTitle","Less water","text"],["waterText","Less water — description","textarea"],
  ["orderingTitle","Easy ordering","text"],["orderingText","Easy ordering — description","textarea"]]},
 {key:"promise",label:"Seedlings Promise",fields:[
  ["eyebrow","Eyebrow","text"],["title","Heading","text"],["body","Description","textarea"],
  ["buttonText","Button text","text"],["buttonUrl","Button link","text"],
  ["freshTitle","Fresh — title","text"],["freshText","Fresh — text","textarea"],
  ["localTitle","Local — title","text"],["localText","Local — text","textarea"],
  ["simpleTitle","Simple — title","text"],["simpleText","Simple — text","textarea"]]},
 {key:"why",label:"Why Seedlings",fields:[
  ["eyebrow","Eyebrow","text"],["title","Heading","text"],["body","Description","textarea"],["imageUrl","Section image URL","text"],
  ["feature1Title","01 — title","text"],["feature1Text","01 — description","textarea"],
  ["feature2Title","02 — title","text"],["feature2Text","02 — description","textarea"],
  ["feature3Title","03 — title","text"],["feature3Text","03 — description","textarea"],
  ["buttonText","Button text","text"],["buttonUrl","Button link","text"]]},
 {key:"appBanner",label:"App Banner",fields:[
  ["eyebrow","Eyebrow","text"],["title","Heading","text"],["body","Description","textarea"],
  ["googlePlayUrl","Google Play link","text"],["appStoreUrl","App Store link","text"]]},
] as const;

type SectionKey=typeof SECTIONS[number]["key"];
type RecordData={id:string;key:SectionKey;status:"draft"|"published";[k:string]:unknown};
export default function HomepageContent(){
 const[selected,setSelected]=useState<SectionKey>(SECTIONS[0].key),[form,setForm]=useState<RecordData|null>(null),[error,setError]=useState(""),[saving,setSaving]=useState(false);
 const section=SECTIONS.find(s=>s.key===selected)!;
 async function load(){try{const r=await listCollectionByField<RecordData>("websiteHomepageContent","key",selected);setForm(r[0]??{id:"",key:selected,status:"draft"});setError("")}catch{setError("Unable to load homepage content.")}}
 useEffect(()=>{void load()},[selected]);
 async function save(e:React.FormEvent){e.preventDefault();if(!form)return;setSaving(true);try{const {id:_id,...p0}=form;const p={...p0,key:selected,status:form.status};if(form.id)await updateRecord("websiteHomepageContent",form.id,p);else await createRecord("websiteHomepageContent",p);await load();await showSuccess("Homepage content saved")}catch{setError("Unable to save homepage content.")}finally{setSaving(false)}}
 return <AdminPage><div className="container-fluid py-3"><h1 className="h3 seedlings-brand">Homepage Content</h1><p className="text-muted">Only the fixed sections from the approved V2 homepage are shown. Featured Microgreens is managed from Products → Featured.</p>{error&&<div className="alert alert-danger">{error}</div>}
 <div className="row"><div className="col-lg-3 mb-3"><div className="list-group">{SECTIONS.map(s=><button type="button" key={s.key} className={"list-group-item list-group-item-action "+(selected===s.key?"active":"")} onClick={()=>setSelected(s.key)}>{s.label}</button>)}</div></div>
 <div className="col-lg-9"><div className="card"><form onSubmit={save}><div className="card-body"><h5>{section.label}</h5>{section.fields.map(([key,label,type])=><div className="mb-3" key={key}>{key==="imageUrl"?<ImageUploader label={label} value={String(form?.[key]??"")} onChange={url=>setForm(f=>f&&({...f,[key]:url}))}/>:<><label className="form-label">{label}</label>{type==="textarea"?<textarea className="form-control" rows={3} value={String(form?.[key]??"")} onChange={e=>setForm(f=>f&&({...f,[key]:e.target.value}))}/>:<input className="form-control" value={String(form?.[key]??"")} onChange={e=>setForm(f=>f&&({...f,[key]:e.target.value}))}/>}</>}</div>)}<label className="form-label">Status</label><select className="form-select" value={String(form?.status??"draft")} onChange={e=>setForm(f=>f&&({...f,status:e.target.value as "draft"|"published"}))}><option value="draft">Draft</option><option value="published">Published</option></select></div><div className="card-footer"><button className="btn btn-success" disabled={saving}>{saving?"Saving…":"Save"}</button></div></form></div></div></div></div></AdminPage>
}