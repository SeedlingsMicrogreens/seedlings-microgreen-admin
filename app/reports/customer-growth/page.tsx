"use client";

import {useEffect,useMemo,useState} from "react";
import {AdminPage} from "@/components/admin/AdminPage";
import {listCollection} from "@/lib/firestore";
import {buildCustomerGrowth} from "@/lib/customerGrowthService";
import type {Customer} from "@/types/customer";
import type {Order} from "@/types/order";
import type {Subscription} from "@/types/subscription";

const ranges=[["30","30 days"],["90","90 days"],["180","6 months"],["365","12 months"],["all","All time"]] as const;
function startDate(days:number){return new Date(Date.now()-days*86400000).toISOString().slice(0,10)}
function money(v:number){return `₹${v.toFixed(2)}`}
function title(v:string){return v.charAt(0).toUpperCase()+v.slice(1)}

export default function CustomerGrowthPage(){
 const[customers,setCustomers]=useState<Customer[]>([]);const[orders,setOrders]=useState<Order[]>([]);const[subs,setSubs]=useState<Subscription[]>([]);
 const[range,setRange]=useState("90");const[search,setSearch]=useState("");const[segment,setSegment]=useState("all");const[loading,setLoading]=useState(true);const[error,setError]=useState("");
 async function load(){setLoading(true);try{const[c,o,s]=await Promise.all([listCollection<Customer>("customers"),listCollection<Order>("orders","createdAt"),listCollection<Subscription>("subscriptions","createdAt")]);setCustomers(c);setOrders(o);setSubs(s);setError("")}catch{setError("Unable to load customer growth data.")}finally{setLoading(false)}}
 useEffect(()=>{void load()},[]);
 const start=range==="all"?undefined:startDate(Number(range));
 const data=useMemo(()=>buildCustomerGrowth(customers,orders,subs,start),[customers,orders,subs,start]);
 const rows=data.rows.filter(r=>(segment==="all"||r.segment===segment)&&(!search||[r.name,r.mobile,r.customerId].join(" ").toLowerCase().includes(search.toLowerCase())));
 const m=data.metrics;
 return <AdminPage><div className="container-fluid py-3">
  <div className="d-flex flex-wrap justify-content-between align-items-end gap-3 mb-3"><div><h1 className="h3 seedlings-brand mb-1">Customer Growth</h1><p className="text-muted mb-0">Understand acquisition, repeat purchases and subscription customers.</p></div><div className="d-flex gap-2"><select className="form-select" value={range} onChange={e=>setRange(e.target.value)}>{ranges.map(x=><option key={x[0]} value={x[0]}>{x[1]}</option>)}</select><button className="btn btn-outline-secondary" onClick={()=>void load()}><i className="bi bi-arrow-clockwise"/></button></div></div>
  {error&&<div className="alert alert-danger">{error}</div>}
  <div className="row g-3 mb-3">
   <Kpi l="Customers" v={m.totalCustomers} i="bi-people"/><Kpi l="Purchasing customers" v={m.activeCustomers} i="bi-person-check"/><Kpi l="New customers" v={m.newCustomers} i="bi-person-plus"/><Kpi l="Repeat customers" v={m.repeatCustomers} i="bi-arrow-repeat"/><Kpi l="Subscription customers" v={m.subscriptionCustomers} i="bi-repeat"/><Kpi l="Repeat rate" v={`${m.repeatRatePercent.toFixed(1)}%`} i="bi-graph-up"/>
  </div>
  <div className="row g-3 mb-3"><div className="col-lg-8"><div className="card h-100"><div className="card-header"><h3 className="card-title mb-0">Customer Value</h3></div><div className="card-body"><div className="row text-center"><div className="col-md-4 border-end"><div className="text-muted small">Revenue</div><div className="fs-4 fw-semibold">{money(m.totalRevenue)}</div></div><div className="col-md-4 border-end"><div className="text-muted small">Average customer value</div><div className="fs-4 fw-semibold">{money(m.averageCustomerValue)}</div></div><div className="col-md-4"><div className="text-muted small">Subscription / delivery</div><div className="fs-4 fw-semibold">{money(m.activeSubscriptionRevenuePerDelivery)}</div></div></div></div></div></div>
   <div className="col-lg-4"><div className="card h-100"><div className="card-header"><h3 className="card-title mb-0">Segments</h3></div><div className="card-body small"><Segment n={m.newCustomers} t="New" /><Segment n={m.repeatCustomers} t="Repeat" /><Segment n={m.subscriptionCustomers} t="Subscription" /><Segment n={m.inactiveCustomers} t="Inactive" /></div></div></div></div>
  <div className="card"><div className="card-header"><div className="row g-2 align-items-center"><div className="col-md-6"><div className="input-group"><span className="input-group-text"><i className="bi bi-search"/></span><input className="form-control" placeholder="Search customer..." value={search} onChange={e=>setSearch(e.target.value)}/></div></div><div className="col-md-3"><select className="form-select" value={segment} onChange={e=>setSegment(e.target.value)}><option value="all">All segments</option><option value="new">New</option><option value="repeat">Repeat</option><option value="subscription">Subscription</option><option value="inactive">Inactive</option></select></div><div className="col-md-3 text-md-end text-muted small">{rows.length} customers</div></div></div>
   <div className="table-responsive"><table className="table table-hover align-middle mb-0"><thead><tr><th>Customer</th><th>Orders</th><th>Delivered</th><th>Revenue</th><th>Subscriptions</th><th>Last order</th><th>Segment</th></tr></thead><tbody>{rows.map(r=><tr key={r.customerId}><td><strong>{r.name}</strong><div className="small text-muted">{r.mobile||"—"}</div></td><td>{r.orders}</td><td>{r.deliveredOrders}</td><td>{money(r.revenue)}</td><td>{r.activeSubscriptions}</td><td>{r.lastOrderDate||"—"}</td><td><span className={`badge text-bg-${r.segment==="subscription"?"primary":r.segment==="repeat"?"success":r.segment==="new"?"info":"secondary"}`}>{title(r.segment)}</span></td></tr>)}{!rows.length&&!loading&&<tr><td colSpan={7} className="text-center text-muted py-5">No customers found for this period.</td></tr>}{loading&&<tr><td colSpan={7} className="text-center py-5"><span className="spinner-border spinner-border-sm me-2"/>Loading...</td></tr>}</tbody></table></div>
  </div>
 </div></AdminPage>
}
function Kpi({l,v,i}:{l:string;v:string|number;i:string}){return <div className="col-6 col-md-4 col-xl-2"><div className="info-box h-100"><span className="info-box-icon text-bg-success"><i className={`bi ${i}`}/></span><div className="info-box-content"><span className="info-box-text">{l}</span><span className="info-box-number">{v}</span></div></div></div>}
function Segment({n,t}:{n:number;t:string}){return <div className="d-flex justify-content-between border-bottom py-2"><span>{t}</span><strong>{n}</strong></div>}
