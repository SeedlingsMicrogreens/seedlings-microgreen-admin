import Link from "next/link";
import {AdminPage} from "@/components/admin/AdminPage";
const groups=[
 {title:"Homepage",items:[
  ["Homepage Content","Edit homepage sections, including Trust Points","/cms/homepage","layout-text-window"],
  ["Hero Slider","Manage homepage banner images, slide text and buttons","/cms/banners","images"],
 ]},
 {title:"Website Pages",items:[
  ["Website Pages","Microgreens, Contact, Terms & Conditions and Privacy Policy","/cms/pages","file-earmark-text"],
  ["Our Journey","Edit the content displayed on the Our Journey page","/cms/journey","signpost-2"],
  ["Seedlings Feedback","Feedback shown on the website Journey page","/cms/seedlings-feedback","chat-heart"],
 ]},
 {title:"Website Content",items:[
  ["FAQ","Homepage FAQ content","/cms/faq","question-circle"],
  ["Testimonials","Homepage testimonial carousel","/cms/testimonials","chat-quote"],
  ["Blogs","Website blog content","/cms/blogs","journal-text"],
 ]},
 {title:"Website Configuration",items:[
  ["Navigation","Fixed V2 navigation labels","/cms/navigation","list"],
  ["Footer & App Links","Website name, footer phone and email, app store links","/cms/settings","phone"],
 ]},
];
export default function CmsPage(){return <AdminPage><div className="container-fluid py-3"><h1 className="h3 seedlings-brand">Website CMS</h1><p className="text-muted">Edit the content used by the existing Seedlings website. Homepage Content includes Trust Points; Hero Slider manages the homepage banner slides. This is not a page builder.</p>{groups.map(g=><div className="mb-4" key={g.title}><h2 className="h5 mb-3">{g.title}</h2><div className="row">{g.items.map(([t,d,h,i])=><div className="col-xl-3 col-md-4 col-sm-6 mb-3" key={h}><Link href={h} className="text-decoration-none"><div className="card h-100"><div className="card-body"><i className={"bi bi-"+i+" fs-2 text-success"}/><h5 className="mt-3">{t}</h5><p className="text-muted small mb-0">{d}</p></div></div></Link></div>)}</div></div>)}</div></AdminPage>}
