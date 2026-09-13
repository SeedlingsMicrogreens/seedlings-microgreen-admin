"use client";
import {useEffect,useState} from "react";
import {AdminPage} from "@/components/admin/AdminPage";
import {createRecord,listCollectionByField,setRecord} from "@/lib/firestore";
import {showSuccess} from "@/lib/alerts";
import {ImageUploader} from "@/components/ui/ImageUploader";

const BLOCKS=[
 {key:"hero",label:"Page Hero",fields:[["eyebrow","Eyebrow"],["title","Heading"],["body","Intro"],["imageUrl","Hero image URL"]]},
 {key:"spark",label:"The Spark",fields:[["eyebrow","Eyebrow"],["title","Heading"],["paragraph1","Paragraph 1"],["paragraph2","Paragraph 2"],["chooseTitle","01 Choose — title"],["chooseText","01 Choose — description"],["growTitle","02 Grow — title"],["growText","02 Grow — description"],["imageUrl","Section image URL"]]},
 {key:"process",label:"The Seedlings Process",fields:[["eyebrow","Eyebrow"],["title","Heading"],["body","Intro"],["seedTitle","01 Seed — title"],["seedText","01 Seed — description"],["growTitle","02 Grow — title"],["growText","02 Grow — description"],["harvestTitle","03 Harvest — title"],["harvestText","03 Harvest — description"],["deliverTitle","04 Deliver — title"],["deliverText","04 Deliver — description"]]},
] as const;
type BlockKey=typeof BLOCKS[number]["key"];
type Block={id:string;blockKey:BlockKey;status:"draft"|"published";[key:string]:unknown};
export default function Journey(){
 const[selected,setSelected]=useState<BlockKey>(BLOCKS[0].key),[form,setForm]=useState<Block|null>(null),[error,setError]=useState(""),[saving,setSaving]=useState(false);const block=BLOCKS.find(b=>b.key===selected)!;
 async function load(){try{const r=await listCollectionByField<Block>("websiteJourneyContent","blockKey",selected);setForm(r[0]??{id:"",blockKey:selected,status:"draft"});setError("")}catch{setError("Unable to load Journey content.")}}
 useEffect(()=>{void load()},[selected]);
 async function save(e:React.FormEvent){e.preventDefault();if(!form)return;setSaving(true);try{const {id:_id,...p0}=form;const p={...p0,blockKey:selected};if(form.id)await setRecord("websiteJourneyContent",form.id,p,true);else await createRecord("websiteJourneyContent",p);await load();await showSuccess("Journey content saved")}catch{setError("Unable to save Journey content.")}finally{setSaving(false)}}
 return <AdminPage><div className="container-fluid py-3"><h1 className="h3 seedlings-brand">Our Journey</h1><p className="text-muted">Fixed V2 page structure. Only the content of the predefined sections can be edited.</p>{error&&<div className="alert alert-danger">{error}</div>}<div className="row"><div className="col-lg-3 mb-3"><div className="list-group">{BLOCKS.map(b=><button type="button" key={b.key} className={"list-group-item list-group-item-action "+(selected===b.key?"active":"")} onClick={()=>setSelected(b.key)}>{b.label}</button>)}</div></div><div className="col-lg-9"><div className="card"><form onSubmit={save}><div className="card-body"><h5>{block.label}</h5>{block.fields.map(([key,label])=><div className="mb-3" key={key}>{key==="imageUrl"?<ImageUploader label={label} value={String(form?.[key]??"")} onChange={url=>setForm(f=>f&&({...f,[key]:url}))}/>:<><label className="form-label">{label}</label><textarea className="form-control" rows={key.includes("paragraph")||key.includes("body")||key.includes("Text")?3:2} value={String(form?.[key]??"")} onChange={e=>setForm(f=>f&&({...f,[key]:e.target.value}))}/></>}</div>)}<label className="form-label">Status</label><select className="form-select" value={String(form?.status??"draft")} onChange={e=>setForm(f=>f&&({...f,status:e.target.value as "draft"|"published"}))}><option value="draft">Draft</option><option value="published">Published</option></select></div><div className="card-footer"><button className="btn btn-success" disabled={saving}>{saving?"Saving…":"Save"}</button></div></form></div></div></div></div></AdminPage>
}