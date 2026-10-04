"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminPage } from "@/components/admin/AdminPage";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { listCollection } from "@/lib/firestore";
import { sendAdminUserNotifications } from "@/lib/notificationService";
import type { NotificationRecord, AdminNotificationType } from "@/types/notifications";
import type { Subscription } from "@/types/subscription";
import type { Order } from "@/types/order";
import type { Customer } from "@/types/customer";

function dateTimeOf(v: unknown) {
  if (!v) return "—";
  if (typeof v === "object" && v !== null && "toDate" in v && typeof (v as any).toDate === "function") {
    return (v as any).toDate().toLocaleString();
  }
  const d = new Date(v as any);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

function customerName(c: Customer) {
  return c.name?.trim() || "Unnamed customer";
}

function customerPhone(c: Customer) {
  return c.mobileNumber || c.phone || "—";
}

function pendingDeliveries(s: Subscription) {
  const completed = Number(s.completedDeliveries ?? 0);
  const generated = Number(s.deliveriesGenerated ?? 0);
  return Math.max(0, Number(s.totalDeliveries ?? 0) - Math.max(completed, generated));
}

function plainText(html: string) {
  if (typeof document === "undefined") {
    return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  }
  const el = document.createElement("div");
  el.innerHTML = html;
  return (el.textContent || "").replace(/\s+/g, " ").trim();
}

function notificationTypeLabel(type: AdminNotificationType) {
  if (type === "one_time_order") return "One Time Order";
  if (type === "subscription") return "Subscription";
  return "Other";
}

export default function NotificationsPage() {
  const [items, setItems] = useState<NotificationRecord[]>([]);
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
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
      const [n, s, o, c] = await Promise.all([
        listCollection<NotificationRecord>("notifications", "createdAt"),
        listCollection<Subscription>("subscriptions"),
        listCollection<Order>("orders", "createdAt"),
        listCollection<Customer>("customers", "createdAt"),
      ]);
      setItems(n);
      setSubs(s);
      setOrders(o);
      setCustomers(c);
      setError("");
    } catch {
      setError("Unable to load notification data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const oneTimeCustomers = useMemo(() => {
    const ids = new Set(
      orders
        .filter((o) => (o.orderType ?? "one_time") === "one_time" && o.status !== "cancelled")
        .map((o) => o.customerId),
    );
    return customers.filter((c) => ids.has(c.id));
  }, [customers, orders]);

  const subscriptionCustomers = useMemo(() => {
    const ids = new Set(subs.filter((s) => s.status === "active").map((s) => s.customerId));
    return customers.filter((c) => ids.has(c.id));
  }, [customers, subs]);

  const candidateCustomers = useMemo(() => {
    if (type === "one_time_order") return oneTimeCustomers;
    if (type === "subscription") return subscriptionCustomers;
    return customers;
  }, [customers, oneTimeCustomers, subscriptionCustomers, type]);

  const customerMeta = useMemo(() => {
    const map = new Map<string, { upcomingDate?: string; pending?: number }>();

    candidateCustomers.forEach((customer) => {
      if (type === "one_time_order") {
        const dates = orders
          .filter(
            (o) =>
              o.customerId === customer.id &&
              (o.orderType ?? "one_time") === "one_time" &&
              o.status !== "cancelled" &&
              o.scheduledDeliveryDate,
          )
          .map((o) => o.scheduledDeliveryDate as string)
          .filter(Boolean)
          .sort();

        map.set(customer.id, { upcomingDate: dates[0] });
      }

      if (type === "subscription") {
        const customerSubs = subs.filter(
          (s) => s.customerId === customer.id && s.status === "active",
        );
        const dates = customerSubs
          .map((s) => s.nextDeliveryDate)
          .filter(Boolean)
          .sort();

        map.set(customer.id, {
          upcomingDate: dates[0],
          pending: customerSubs.reduce((sum, s) => sum + pendingDeliveries(s), 0),
        });
      }
    });

    return map;
  }, [candidateCustomers, orders, subs, type]);

  const filteredCustomers = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return candidateCustomers;

    return candidateCustomers.filter((customer) =>
      [customerName(customer), customerPhone(customer), customer.email]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [candidateCustomers, search]);

  const allVisibleSelected =
    filteredCustomers.length > 0 &&
    filteredCustomers.every((customer) => selectedIds.includes(customer.id));

  function toggleCustomer(id: string) {
    setSelectedIds((previous) =>
      previous.includes(id)
        ? previous.filter((value) => value !== id)
        : [...previous, id],
    );
  }

  function toggleAllVisible() {
    const ids = filteredCustomers.map((customer) => customer.id);
    setSelectedIds((previous) =>
      allVisibleSelected
        ? previous.filter((id) => !ids.includes(id))
        : Array.from(new Set([...previous, ...ids])),
    );
  }

  function changeType(next: AdminNotificationType) {
    setType(next);
    setSelectedIds([]);
    setSearch("");
  }

  const selectedCustomers = useMemo(
    () => customers.filter((customer) => selectedIds.includes(customer.id)),
    [customers, selectedIds],
  );

  async function send(e: React.FormEvent) {
    e.preventDefault();

    const cleanTitle = title.trim();
    const cleanDescription = plainText(description);

    if (!cleanTitle) {
      setError("Enter a notification title.");
      return;
    }
    if (!cleanDescription) {
      setError("Enter a notification description.");
      return;
    }
    if (!selectedCustomers.length) {
      setError("Select at least one customer.");
      return;
    }

    setSending(true);
    setError("");
    setSuccess("");

    try {
      await sendAdminUserNotifications({
        type,
        title: cleanTitle,
        messageHtml: description,
        recipients: selectedCustomers,
      });

      setTitle("");
      setDescription("");
      setSelectedIds([]);
      await load();

      setSuccess(
        `Notification sent to ${selectedCustomers.length} ${selectedCustomers.length === 1 ? "customer" : "customers"}.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to send notification.");
    } finally {
      setSending(false);
    }
  }

  const sentCampaigns = useMemo(() => {
    const grouped = new Map<string, NotificationRecord[]>();
    const adminItems = items.filter(
      (item) =>
        item.source === "admin" ||
        (!item.source && ["one_time_order", "subscription", "other"].includes(item.type)),
    );

    for (const item of adminItems) {
      const key = item.campaignId || item.id;
      const records = grouped.get(key) || [];
      records.push(item);
      grouped.set(key, records);
    }

    return Array.from(grouped.entries()).map(([campaignId, records]) => ({
      campaignId,
      records,
      first: records[0],
      count: records.length,
    }));
  }, [items]);

  return (
    <AdminPage>
      <div className="container-fluid py-3">
        <div className="d-flex flex-wrap justify-content-between align-items-end gap-3 mb-3">
          <div>
            <h1 className="h3 seedlings-brand mb-1">Notifications</h1>
            <p className="text-muted mb-0">
              Send notifications to customers and review notifications already sent.
            </p>
          </div>
          <button className="btn btn-outline-secondary" onClick={() => void load()}>
            <i className="bi bi-arrow-clockwise me-1" />
            Refresh
          </button>
        </div>

        {error && <div className="alert alert-danger">{error}</div>}
        {success && <div className="alert alert-success">{success}</div>}

        <div className="card mb-4">
          <div className="card-header">
            <h3 className="card-title mb-0">Create Notification</h3>
          </div>

          <form onSubmit={send}>
            <div className="card-body">
              <div className="row g-3 mb-3">
                <div className="col-md-4">
                  <label className="form-label">Type *</label>
                  <select
                    className="form-select"
                    value={type}
                    onChange={(e) => changeType(e.target.value as AdminNotificationType)}
                  >
                    <option value="one_time_order">One Time Order</option>
                    <option value="subscription">Subscription</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div className="col-md-8">
                  <label className="form-label">Title *</label>
                  <input
                    className="form-control"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Enter notification title"
                    maxLength={150}
                  />
                </div>
              </div>

              <div className="mb-3">
                <label className="form-label">Users *</label>

                <div className="border rounded">
                  <div className="p-2 border-bottom bg-body-tertiary">
                    <div className="row g-2 align-items-center">
                      <div className="col-auto">
                        <div className="form-check mb-0">
                          <input
                            className="form-check-input"
                            type="checkbox"
                            checked={allVisibleSelected}
                            onChange={toggleAllVisible}
                            disabled={!filteredCustomers.length}
                          />
                          <label className="form-check-label">Select all</label>
                        </div>
                      </div>

                      <div className="col">
                        <input
                          className="form-control form-control-sm"
                          placeholder="Search name or mobile..."
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                        />
                      </div>

                      <div className="col-auto text-muted small">
                        {selectedIds.length} selected / {candidateCustomers.length}
                      </div>
                    </div>
                  </div>

                  <div style={{ maxHeight: 320, overflowY: "auto" }}>
                    {loading ? (
                      <div className="text-center text-muted py-4">Loading users...</div>
                    ) : (
                      filteredCustomers.map((customer) => {
                        const meta = customerMeta.get(customer.id);

                        return (
                          <div className="px-3 py-2 border-bottom" key={customer.id}>
                            <div className="form-check">
                              <input
                                className="form-check-input"
                                type="checkbox"
                                checked={selectedIds.includes(customer.id)}
                                onChange={() => toggleCustomer(customer.id)}
                                id={`customer-${customer.id}`}
                              />
                              <label
                                className="form-check-label w-100"
                                htmlFor={`customer-${customer.id}`}
                              >
                                <strong>{customerName(customer)}</strong>
                                <span className="ms-2 text-muted">
                                  {customerPhone(customer)}
                                </span>

                                {type !== "other" && (
                                  <div className="small text-muted mt-1">
                                    {meta?.upcomingDate
                                      ? `Upcoming delivery: ${meta.upcomingDate}`
                                      : "No upcoming delivery"}
                                    {type === "subscription" &&
                                      ` · ${meta?.pending ?? 0} deliveries pending`}
                                  </div>
                                )}
                              </label>
                            </div>
                          </div>
                        );
                      })
                    )}

                    {!loading && !filteredCustomers.length && (
                      <div className="text-center text-muted py-4">
                        No customers found for this type.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="mb-3">
                <label className="form-label">Description *</label>
                <RichTextEditor
                  value={description}
                  onChange={setDescription}
                  placeholder="Enter notification description..."
                  minHeight={160}
                />
              </div>
            </div>

            <div className="card-footer d-flex justify-content-end">
              <button className="btn btn-primary" type="submit" disabled={sending}>
                {sending ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2" />
                    Sending...
                  </>
                ) : (
                  <>
                    <i className="bi bi-send me-1" />
                    Send Notification
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        <div className="card">
          <div className="card-header d-flex justify-content-between align-items-center">
            <h3 className="card-title mb-0">Sent Notifications</h3>
            <span className="text-muted small">Latest first</span>
          </div>

          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Notification</th>
                  <th>Users</th>
                  <th>Sent On</th>
                  <th>Status</th>
                </tr>
              </thead>

              <tbody>
                {sentCampaigns.map((campaign) => {
                  const item = campaign.first;
                  return (
                    <tr key={campaign.campaignId}>
                      <td>
                        <span className="badge text-bg-secondary">
                          {notificationTypeLabel(item.type as AdminNotificationType)}
                        </span>
                      </td>
                      <td>
                        <strong>{item.title}</strong>
                        <div className="small text-muted">
                          {plainText(item.messageHtml || item.message)}
                        </div>
                      </td>
                      <td>{campaign.count}</td>
                      <td>{dateTimeOf(item.createdAt)}</td>
                      <td>
                        <span className="badge text-bg-success">Sent</span>
                      </td>
                    </tr>
                  );
                })}

                {!sentCampaigns.length && !loading && (
                  <tr>
                    <td colSpan={5} className="text-center text-muted py-5">
                      No notifications sent yet.
                    </td>
                  </tr>
                )}

                {loading && (
                  <tr>
                    <td colSpan={5} className="text-center py-5">
                      <span className="spinner-border spinner-border-sm me-2" />
                      Loading...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminPage>
  );
}
