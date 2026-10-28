"use client";
import {useEffect,useState} from "react";
import {AdminPage} from "@/components/admin/AdminPage";
import {createRecord,deleteRecord,listCollection,updateRecord} from "@/lib/firestore";
import type {BlogPost} from "@/types/cms";
import {confirmAction,showError,showSuccess} from "@/lib/alerts";
import {ImageUploader} from "@/components/ui/ImageUploader";
import {RichTextEditor} from "@/components/ui/RichTextEditor";
import {extractYouTubeId} from "@/lib/youtube";
type BlogForm=Omit<BlogPost,"id"|"updatedAt">;
const today=()=>new Date().toLocaleDateString("en-CA");
const empty=():BlogForm=>({title:"",slug:"",excerpt:"",content:"",coverImageUrl:"",videoId:"",authorName:"",publishedAt:today(),status:"draft",seoTitle:"",seoDescription:""});
const slugify=(value:string)=>value.trim().toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
const hasText=(html:string)=>html.replace(/<[^>]*>/g," ").replace(/&nbsp;/g," ").trim().length>0;
export default function Page(){
 const [items,setItems]=useState<BlogPost[]>([]); const [form,setForm]=useState<BlogForm>(empty); const [videoUrl,setVideoUrl]=useState(""); const [editing,setEditing]=useState<string|null>(null); const [error,setError]=useState(""); const [saving,setSaving]=useState(false);
 async function load(){try{setItems(await listCollection<BlogPost>("cmsBlogs"));setError("")}catch{setError("Unable to load records.")}}
 useEffect(()=>{void load()},[]);
 function reset(){setEditing(null);setForm(empty());setVideoUrl("")}
 function edit(item:BlogPost){const {id,updatedAt:_updatedAt,...rest}=item;setEditing(id);setForm({...empty(),...rest});setVideoUrl(item.videoId?`https://www.youtube.com/watch?v=${item.videoId}`:"");setError("")}
 async function save(e:React.FormEvent){e.preventDefault();setError("");
  const slug=slugify(form.slug||form.title);
  if(!form.title.trim())return setError("Title is required.");
  if(!slug)return setError("Slug is required.");
  if(items.some(item=>item.slug===slug&&item.id!==editing))return setError("Another blog already uses this slug.");
  if(!hasText(form.content))return setError("Content is required.");
  const videoId=videoUrl.trim()?extractYouTubeId(videoUrl):"";
  if(videoId===null)return setError("Please enter a valid YouTube video URL, or leave it empty.");
  const payload={...form,title:form.title.trim(),slug,excerpt:form.excerpt.trim(),authorName:form.authorName.trim(),coverImageUrl:form.coverImageUrl.trim(),videoId,publishedAt:form.publishedAt||today(),seoTitle:form.seoTitle.trim(),seoDescription:form.seoDescription.trim()};
  setSaving(true);try{if(editing)await updateRecord("cmsBlogs",editing,payload);else await createRecord("cmsBlogs",payload);const wasEditing=editing;reset();await load();await showSuccess(wasEditing?"Blog updated":"Blog created")}catch{setError("Unable to save record.")}finally{setSaving(false)}}
 const input=(key:"title"|"slug"|"excerpt"|"authorName"|"seoTitle",label:string,hint?:string)=><div className="mb-3"><label className="form-label">{label}</label><input className="form-control" value={form[key]} onChange={e=>setForm({...form,[key]:e.target.value})}/>{hint&&<div className="form-text">{hint}</div>}</div>;
 return <AdminPage><div className="container-fluid py-3"><h1 className="h3 seedlings-brand">Blogs</h1><p className="text-muted">Posts shown on the website at /blog. Only Published posts are visible.</p>{error&&<div className="alert alert-danger">{error}</div>}<div className="row">
 <div className="col-xl-5 mb-3"><div className="card"><form onSubmit={save}><div className="card-body">
  {input("title","Title *")}
  {input("slug","Slug","Web address: /blog/your-slug. Leave empty to create it from the title.")}
  {input("excerpt","Summary","Short text shown on the blog list.")}
  <div className="mb-3"><ImageUploader label="Image (optional)" value={form.coverImageUrl} onChange={url=>setForm(f=>({...f,coverImageUrl:url}))}/></div>
  <div className="mb-3"><label className="form-label">YouTube video URL (optional)</label><input className="form-control" value={videoUrl} placeholder="https://www.youtube.com/watch?v=XXXXXXXXXXX" onChange={e=>setVideoUrl(e.target.value)}/></div>
  <div className="mb-3"><label className="form-label">Content *</label><RichTextEditor value={form.content} onChange={html=>setForm(f=>({...f,content:html}))} placeholder="Write the blog post..." minHeight={220}/></div>
  {input("authorName","Author")}
  <div className="mb-3"><label className="form-label">Publish date</label><input className="form-control" type="date" value={form.publishedAt} onChange={e=>setForm({...form,publishedAt:e.target.value})}/></div>
  <h6 className="mt-4">SEO</h6>
  {input("seoTitle","SEO title","Leave empty to use the title.")}
  <div className="mb-3"><label className="form-label">SEO description</label><textarea className="form-control" rows={3} value={form.seoDescription} onChange={e=>setForm({...form,seoDescription:e.target.value})}/><div className="form-text">Leave empty to use the summary.</div></div>
  <label className="form-label">Status</label><select className="form-select" value={form.status} onChange={e=>setForm({...form,status:e.target.value as BlogForm["status"]})}><option value="draft">Draft</option><option value="published">Published</option></select>
 </div><div className="card-footer"><button className="btn btn-success me-2" disabled={saving}>{saving?"Saving…":editing?"Update":"Create"}</button>{editing&&<button type="button" className="btn btn-secondary" onClick={reset}>Cancel</button>}</div></form></div></div>
 <div className="col-xl-7"><div className="card"><div className="card-body table-responsive p-0"><table className="table table-hover mb-0"><thead><tr><th>Title</th><th>Slug</th><th>Date</th><th>Status</th><th>Actions</th></tr></thead><tbody>{items.map(item=><tr key={item.id}><td>{item.title}</td><td>{item.slug}</td><td className="text-nowrap">{item.publishedAt||"—"}</td><td><span className={"badge "+(item.status==="published"?"bg-success":"bg-secondary")}>{item.status==="published"?"Published":"Draft"}</span></td><td className="text-nowrap"><button className="btn btn-sm btn-outline-primary me-1" onClick={()=>edit(item)}>Edit</button><button className="btn btn-sm btn-outline-danger" onClick={async()=>{if(!(await confirmAction({title:"Delete this record?",text:"This action cannot be undone. The record will be permanently deleted.",confirmText:"Yes, delete"})))return;try{await deleteRecord("cmsBlogs",item.id);if(editing===item.id)reset();await load();await showSuccess("Deleted successfully")}catch(e){await showError(e,"Unable to delete record.")}}}>Delete</button></td></tr>)}{!items.length&&<tr><td colSpan={5} className="text-center text-muted py-4">No records yet.</td></tr>}</tbody></table></div></div></div>
 </div></div></AdminPage>
}
