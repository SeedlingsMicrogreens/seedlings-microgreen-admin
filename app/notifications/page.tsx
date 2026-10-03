"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminPage } from "@/components/admin/AdminPage";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { listCollection } from "@/lib/firestore";
import { sendAdminUserNotifications } from "@/lib/notificationService";
import type { NotificationRecord, AdminNotificationType } from "@/types/notifications";
import type { GrowingBatch } from "@/types/growingBatch";
import type { Product } from "@/types/catalog";
import type { Subscription } from "@/types/subscription";
import type { Order } from "@/types/order";
import type { Customer } from "@/types/customer";

function dateOf(v: unknown) {
  if (!v) return "";
  if (typeof v === "string") return v.slice(0, 10);
  if (typeof v === "object" && v !== null && "toDate" in v && typeof (v as any).toDate === "function") return (v as any).toDate().toISOString().slice(0, 10);
  return "";
}
function dateTimeOf(v: unknown) {
  if (!v) return "—";
  if (typeof v === "object" && v !== null && "toDate" in v && typeof (v as any).toDate === "function") return (v as any).toDate().toLocaleString();
  const d = new Date(v as any);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}
function daysUntil(date: string) {
  if (!date) return null;
  return Math.ceil((new Date(`${date}T00:00:00`).getTime() - new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00`).getTime()) / 86400000);
}
function customerName(c: Customer) { return c.name?.trim() || "Unnamed customer"; }
function customerPhone(c: Customer) { return c.mobileNumber || c.phone || "—"; }
function pendingDeliveries(s: Subscription) {
  const completed = Number(s.completedDeliveries ?? 0);
  const generated = Number(s.deliveriesGenerated ?? 0);
  return Math.max(0, Number(s.totalDeliveries ?? 0) - Math.max(completed, generated));
}
function plainText(html: string) {
  if (typeof document === "undefined") return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const el = document.createElement("div");
  el.innerHTML = html;
  return (el.textContent || "").replace(/\s+/g, " ").trim();
}

export default function NotificationsPage() {
  const [items, setItems] = useState<NotificationRecord[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [batches, setBatches] = useState<GrowingBatch[]>([]);
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [tab, setTab] = useState<"send" | "alerts">("send");
  const [type, setType] = useState<AdminNotificationType>("one_time_order");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function load() {
    setLoading(true);
    try {
      const [n, p, b, s, o, c] = await Promise.all([
        listCollection<NotificationRecord>("notifications", "createdAt"),
        listCollection<Product>("products"),
        listCollection<GrowingBatch>("growingBatches", "startDate"),
        listCollection<Subscription>("subscriptions"),
        listCollection<Order>("orders", "createdAt"),
        listCollection<Customer>("customers", "createdAt"),
      ]);
      setItems(n);
      setProducts(p); setBatches(b); setSubs(s); setOrders(o); setCustomers(c);
      setError("");
    } catch {
      setError("Unable to load notification data.");
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  const oneTimeCustomers = useMemo(() => {
    const ids = new Set(orders.filter(o => (o.orderType ?? "one_time") === "one_time" && o.status !== "cancelled").map(o => o.customerId));
    return customers.filter(c => ids.has(c.id));
  }, [customers, orders]);

  const subscriptionCustomers = useMemo(() => {
    const ids = new Set(subs.filter(s => s.status === "active").map(s => s.customerId));
    return customers.filter(c => ids.has(c.id));
  }, [customers, subs]);

  const candidateCustomers = useMemo(() => {
    if (type === "one_time_order") return oneTimeCustomers;
    if (type === "subscription") return subscriptionCustomers;
    return customers;
  }, [customers, oneTimeCustomers, subscriptionCustomers, type]);

  const customerMeta = useMemo(() => {
    const map = new Map<string, { upcomingDate?: string; pending?: number }>();
    candidateCustomers.forEach(c => {
      if (type === "one_time_order") {
        const dates = orders.filter(o => o.customerId === c.id && (o.orderType ?? "one_time") === "one_time" && o.status !== "cancelled" && o.scheduledDeliveryDate)
          .map(o => o.scheduledDeliveryDate as string).filter(Boolean).sort();
        map.set(c.id, { upcomingDate: dates[0] });
      } else if (type === "subscription") {
        const customerSubs = subs.filter(s => s.customerId === c.id && s.status === "active");
        const dates = customerSubs.map(s => s.nextDeliveryDate).filter(Boolean).sort();
        map.set(c.id, { upcomingDate: dates[0], pending: customerSubs.reduce((sum, s) => sum + pendingDeliveries(s), 0) });
      }
    });
    return map;
  }, [candidateCustomers, orders, subs, type]);

  const filteredCustomers = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return candidateCustomers;
    return candidateCustomers.filter(c => [customerName(c), customerPhone(c), c.email].filter(Boolean).join(" ").toLowerCase().includes(term));
  }, [candidateCustomers, search]);

  const allVisibleSelected = filteredCustomers.length > 0 && filteredCustomers.every(c => selectedIds.includes(c.id));

  function toggleCustomer(id: string) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }
  function toggleAllVisible() {
    const ids = filteredCustomers.map(c => c.id);
    setSelectedIds(prev => allVisibleSelected ? prev.filter(id => !ids.includes(id)) : Array.from(new Set([...prev, ...ids])));
  }
  function changeType(next: AdminNotificationType) {
    setType(next); setSelectedIds([]); setSearch("");
  }

  const selectedCustomers = useMemo(() => customers.filter(c => selectedIds.includes(c.id)), [customers, selectedIds]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const cleanTitle = title.trim();
    const cleanDescription = plainText(description);
    if (!cleanTitle) { setError("Enter a notification title."); return; }
    if (!cleanDescription) { setError("Enter a notification description."); return; }
    if (!selectedCustomers.length) { setError("Select at least one customer."); return; }
    setSending(true); setError(""); setSuccess("");
    try {
      await sendAdminUserNotifications({ type, title: cleanTitle, messageHtml: description, recipients: selectedCustomers });
      setTitle(""); setDescription(""); setSelectedIds([]);
      await load();
      setSuccess(`Notification sent to ${selectedCustomers.length} ${selectedCustomers.length === 1 ? "customer" : "customers"}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to send notification.");
    } finally { setSending(false); }
  }

  const sentCampaigns = useMemo(() => {
    const grouped = new Map<string, NotificationRecord[]>();
    for (const item of items) {
      const key = (item as NotificationRecord & { campaignId?: string }).campaignId || item.id;
      const list = grouped.get(key) || [];
      list.push(item); grouped.set(key, list);
    }
    return Array.from(grouped.entries()).map(([campaignId, records]) => ({ campaignId, first: records[0], count: records.length }));
  }, [items]);

  const alerts = useMemo(() => {
    const a: {type:string;title:string;message:string;severity:"warning"|"info"|"danger"}[]=[];
    const today=new Date().toISOString().slice(0,10);
    products.filter(p=>p.status!=="inactive"&&Number(p.stockGrams??p.stock??0)<=Number(p.lowStockThresholdGrams??p.lowStockThreshold??0)).forEach(p=>a.push({type:"low_stock",title:"Low stock",message:`${p.name} has ${(Number(p.stockGrams??p.stock??0)).toLocaleString()} gms available.`,severity:"warning"}));
    subs.filter(s=>s.status==="active"&&s.nextDeliveryDate&&daysUntil(s.nextDeliveryDate)!==null&&daysUntil(s.nextDeliveryDate)!==undefined&&daysUntil(s.nextDeliveryDate)!<=3&&daysUntil(s.nextDeliveryDate)!>=0).forEach(s=>a.push({type:"subscription_due",title:"Subscription due soon",message:`${s.subscriptionNumber} — ${s.customerName||"Customer"} — ${s.nextDeliveryDate}.`,severity:"info"}));
    batches.forEach(b=>b.items.forEach(i=>{if(i.status!=="completed_harvested"&&i.status!=="failed"&&i.expectedReadyDate&&i.expectedReadyDate<=today)a.push({type:"harvest_due",title:"Harvest due",message:`${b.batchNumber} — ${i.productName} is due for harvest.`,severity:"warning"})}));
    orders.filter(o=>o.status==="pending_payment").forEach(o=>a.push({type:"order_status",title:"Order awaiting payment",message:`${o.orderNumber||o.id} — ${o.customerName||"Customer"}.`,severity:"info"}));
    return a;
  },[products,subs,batches,orders]);

  return <AdminPage><div className="container-fluid py-3">
    <div className="d-flex flex-wrap justify-content-between align-items-end gap-3 mb-3"><div><h1 className="h3 seedlings-brand mb-1">Notifications</h1><p className="text-muted mb-0">Send notifications to customers and review current alerts.</p></div><button className="btn btn-outline-secondary" onClick={()=>void load()}><i className="bi bi-arrow-clockwise me-1"/>Refresh</button></div>
    {error&&<div className="alert alert-danger">{error}</div>}{success&&<div className="alert alert-success">{success}</div>}
    <ul className="nav nav-tabs mb-3"><li className="nav-item"><button className={`nav-link ${tab==="send"?"active":""}`} onClick={()=>setTab("send")}><i className="bi bi-send me-1"/>Send Notifications</button></li><li className="nav-item"><button className={`nav-link ${tab==="alerts"?"active":""}`} onClick={()=>setTab("alerts")}><i className="bi bi-exclamation-triangle me-1"/>Current Alerts <span className="badge text-bg-warning ms-1">{alerts.length}</span></button></li></ul>
    {tab==="alerts" ? <div className="row g-3">{alerts.map((a,i)=><div className="col-md-6 col-xl-4" key={`${a.type}-${i}`}><div className={`alert alert-${a.severity} h-100 mb-0`}><strong><i className="bi bi-bell me-1"/>{a.title}</strong><div className="small mt-1">{a.message}</div></div></div>)}{!alerts.length&&<div className="col-12"><div className="card"><div className="card-body text-center text-muted py-5">No current alerts.</div></div></div>}</div> : <>
      <div className="card mb-4"><div className="card-header"><h3 className="card-title mb-0">Create Notification</h3></div><form onSubmit={send}><div className="card-body">
        <div className="row g-3 mb-3"><div className="col-md-4"><label className="form-label">Type *</label><select className="form-select" value={type} onChange={e=>changeType(e.target.value as AdminNotificationType)}><option value="one_time_order">One Time Order</option><option value="subscription">Subscription</option><option value="other">Other</option></select></div><div className="col-md-8"><label className="form-label">Title *</label><input className="form-control" value={title} onChange={e=>setTitle(e.target.value)} placeholder="Enter notification title" maxLength={150}/></div></div>
        <div className="mb-3"><label className="form-label">Users *</label><div className="border rounded"><div className="p-2 border-bottom bg-body-tertiary"><div className="row g-2 align-items-center"><div className="col-auto"><div className="form-check mb-0"><input className="form-check-input" type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} disabled={!filteredCustomers.length}/><label className="form-check-label">Select all</label></div></div><div className="col"><input className="form-control form-control-sm" placeholder="Search name or mobile..." value={search} onChange={e=>setSearch(e.target.value)}/></div><div className="col-auto text-muted small">{selectedIds.length} selected / {candidateCustomers.length}</div></div></div><div style={{maxHeight:320,overflowY:"auto"}}>{loading?<div className="text-center text-muted py-4">Loading users...</div>:filteredCustomers.map(c=>{const meta=customerMeta.get(c.id);return <div className="px-3 py-2 border-bottom" key={c.id}><div className="form-check"><input className="form-check-input" type="checkbox" checked={selectedIds.includes(c.id)} onChange={()=>toggleCustomer(c.id)} id={`customer-${c.id}`}/><label className="form-check-label w-100" htmlFor={`customer-${c.id}`}><strong>{customerName(c)}</strong><span className="ms-2 text-muted">{customerPhone(c)}</span>{type!=="other"&&<div className="small text-muted mt-1">{meta?.upcomingDate?`Upcoming delivery: ${meta.upcomingDate}`:"No upcoming delivery"}{type==="subscription"&&` · ${meta?.pending ?? 0} deliveries pending`}</div>}</label></div></div>})}{!loading&&!filteredCustomers.length&&<div className="text-center text-muted py-4">No customers found for this type.</div>}</div></div></div>
        <div className="mb-3"><label className="form-label">Description *</label><RichTextEditor value={description} onChange={setDescription} placeholder="Enter notification description..." minHeight={160}/></div>
      </div><div className="card-footer d-flex justify-content-end"><button className="btn btn-primary" type="submit" disabled={sending}>{sending?<><span className="spinner-border spinner-border-sm me-2"/>Sending...</>:<><i className="bi bi-send me-1"/>Send Notification</>}</button></div></form></div>
      <div className="card"><div className="card-header d-flex justify-content-between align-items-center"><h3 className="card-title mb-0">Sent Notifications</h3><span className="text-muted small">Latest first</span></div><div className="table-responsive"><table className="table table-hover align-middle mb-0"><thead><tr><th>Type</th><th>Notification</th><th>Users</th><th>Sent On</th><th>Status</th></tr></thead><tbody>{sentCampaigns.map(c=>{const item=c.first;return <tr key={c.campaignId}><td><span className="badge text-bg-secondary">{item.type==="one_time_order"?"One Time Order":item.type==="subscription"?"Subscription":"Other"}</span></td><td><strong>{item.title}</strong><div className="small text-muted">{plainText((item as any).messageHtml||item.message)}</div></td><td>{c.count}</td><td>{dateTimeOf(item.createdAt)}</td><td><span className="badge text-bg-success">Sent</span></td></tr>})}{!sentCampaigns.length&&!loading&&<tr><td colSpan={5} className="text-center text-muted py-5">No notifications sent yet.</td></tr>}{loading&&<tr><td colSpan={5} className="text-center py-5"><span className="spinner-border spinner-border-sm me-2"/>Loading...</td></tr>}</tbody></table></div></div>
    </>}
  </div></AdminPage>;
}
