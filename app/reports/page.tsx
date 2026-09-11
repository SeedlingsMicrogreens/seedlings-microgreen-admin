"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminPage } from "@/components/admin/AdminPage";
import { listCollection } from "@/lib/firestore";
import { buildBusinessMetrics, topProductSales } from "@/lib/businessAnalyticsService";
import type { Order } from "@/types/order";
import type { Product } from "@/types/catalog";
import type { Subscription } from "@/types/subscription";
import type { GrowingBatch } from "@/types/growingBatch";

const ranges=[["30","30 days"],["90","90 days"],["180","6 months"],["365","12 months"],["all","All time"]] as const;
function money(v:number){return `₹${v.toFixed(2)}`;}
function dateStart(days:number){return new Date(Date.now()-days*86400000).toISOString().slice(0,10);}

export default function BusinessReportsPage(){
  const [orders,setOrders]=useState<Order[]>([]);
  const [products,setProducts]=useState<Product[]>([]);
  const [subscriptions,setSubscriptions]=useState<Subscription[]>([]);
  const [batches,setBatches]=useState<GrowingBatch[]>([]);
  const [range,setRange]=useState("30");
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");

  async function load(){
    setLoading(true);
    try{
      const [o,p,s,b]=await Promise.all([
        listCollection<Order>("orders","createdAt"),
        listCollection<Product>("products","updatedAt"),
        listCollection<Subscription>("subscriptions","createdAt"),
        listCollection<GrowingBatch>("growingBatches","startDate"),
      ]);
      setOrders(o);setProducts(p);setSubscriptions(s);setBatches(b);setError("");
    }catch{setError("Unable to load business dashboard.");}
    finally{setLoading(false);}
  }
  useEffect(()=>{void load();},[]);

  const days=Number(range);
  const start=range==="all"?undefined:dateStart(days);
  const scopedOrders=useMemo(()=>orders.filter(o=>!start||String(o.createdAt??"").slice(0,10)>=start),[orders,start]);
  const metrics=useMemo(()=>buildBusinessMetrics(orders,products,subscriptions,batches,start),[orders,products,subscriptions,batches,start]);
  const top=useMemo(()=>topProductSales(scopedOrders).slice(0,8),[scopedOrders]);

  return <AdminPage><div className="container-fluid py-3">
    <div className="d-flex flex-wrap justify-content-between align-items-end gap-3 mb-3">
      <div><h1 className="h3 seedlings-brand mb-1">Business Dashboard</h1><p className="text-muted mb-0">Sales, customers' recurring demand, inventory and production in one view.</p></div>
      <div className="d-flex gap-2"><select className="form-select" value={range} onChange={e=>setRange(e.target.value)}>{ranges.map(r=><option key={r[0]} value={r[0]}>{r[1]}</option>)}</select><button className="btn btn-outline-secondary" onClick={()=>void load()} disabled={loading}><i className="bi bi-arrow-clockwise"/></button></div>
    </div>
    {error&&<div className="alert alert-danger">{error}</div>}

    <div className="row g-3 mb-3">
      <Kpi label="Sales" value={money(metrics.grossSales)} icon="bi-currency-rupee"/>
      <Kpi label="Orders" value={metrics.orders} icon="bi-cart-check"/>
      <Kpi label="Delivered" value={metrics.deliveredOrders} icon="bi-check-circle"/>
      <Kpi label="Open orders" value={metrics.openOrders} icon="bi-hourglass-split"/>
      <Kpi label="Avg order value" value={money(metrics.averageOrderValue)} icon="bi-receipt"/>
      <Kpi label="Active subscriptions" value={metrics.activeSubscriptions} icon="bi-repeat"/>
    </div>

    <div className="row g-3 mb-3">
      <div className="col-lg-8"><div className="card h-100"><div className="card-header"><h3 className="card-title mb-0">Sales & Product Performance</h3></div><div className="table-responsive"><table className="table table-hover align-middle mb-0"><thead><tr><th>Product</th><th>Orders</th><th>Packs sold</th><th>Sales</th></tr></thead><tbody>{top.map(r=><tr key={r.productId}><td><strong>{r.productName}</strong></td><td>{r.orders}</td><td>{r.quantity}</td><td>{money(r.sales)}</td></tr>)}{!top.length&&!loading&&<tr><td colSpan={4} className="text-center text-muted py-4">No sales in this period.</td></tr>}</tbody></table></div></div></div>
      <div className="col-lg-4"><div className="card h-100"><div className="card-header"><h3 className="card-title mb-0">Business Snapshot</h3></div><div className="card-body">
        <Metric label="Stock" value={`${metrics.stockGrams.toLocaleString()} gms`}/>
        <Metric label="Low-stock products" value={metrics.lowStockProducts} warn={metrics.lowStockProducts>0}/>
        <Metric label="Subscription value / delivery" value={money(metrics.subscriptionValuePerDelivery)}/>
        <Metric label="Growing batches" value={metrics.growingBatches}/>
        <Metric label="Growing trays" value={metrics.growingTrays}/>
        <Metric label="Expected usable growing" value={`${metrics.expectedUsableGrowingGrams.toLocaleString()} gms`}/>
        <Metric label="Actual loss" value={`${metrics.actualLossGrams.toLocaleString()} gms`} warn={metrics.actualLossGrams>0}/>
      </div></div></div>
    </div>

    <div className="row g-3">
      <div className="col-md-4"><Quick title="Forecasting" text="Plan what and how many trays to grow." href="/forecasting" icon="bi-graph-up-arrow"/></div>
      <div className="col-md-4"><Quick title="Production Analytics" text="Compare expected versus actual yield and loss." href="/reports/production" icon="bi-bar-chart-line"/></div>
      <div className="col-md-4"><Quick title="Packing & Fulfilment" text="Turn orders into packing work and consume gram stock." href="/fulfilment" icon="bi-box-seam"/></div>
    </div>
  </div></AdminPage>;
}

function Kpi({label,value,icon}:{label:string;value:string|number;icon:string}){return <div className="col-6 col-md-4 col-xl-2"><div className="info-box h-100"><span className="info-box-icon text-bg-success"><i className={`bi ${icon}`}/></span><div className="info-box-content"><span className="info-box-text">{label}</span><span className="info-box-number">{value}</span></div></div></div>;}
function Metric({label,value,warn}:{label:string;value:string|number;warn?:boolean}){return <div className="d-flex justify-content-between border-bottom py-2"><span className="text-muted">{label}</span><strong className={warn?"text-warning":""}>{value}</strong></div>;}
function Quick({title,text,href,icon}:{title:string;text:string;href:string;icon:string}){return <a href={href} className="text-decoration-none"><div className="card h-100"><div className="card-body d-flex gap-3 align-items-center"><span className="fs-2 text-success"><i className={`bi ${icon}`}/></span><div><h3 className="h6 mb-1">{title}</h3><p className="text-muted small mb-0">{text}</p></div></div></div></a>;}
