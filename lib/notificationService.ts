import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db, auth } from "./firebase";
import type { Customer } from "@/types/customer";
import type { NotificationRecord, NotificationRuleType, AdminNotificationType } from "@/types/notifications";

async function callWebsiteNotificationApi(path: string, body: unknown) {
  const user = auth.currentUser;
  if (!user) throw new Error("Admin session has expired. Please sign in again.");
  const token = await user.getIdToken();
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof result?.error === "string" ? result.error : "Notification service request failed.");
  return result;
}

/** Legacy queue helper retained for non-customer operational notifications. */
export async function queueNotification(input: Omit<NotificationRecord, "id"|"createdAt"|"status">) {
  return addDoc(collection(db, "notifications"), { ...input, status: "queued", createdAt: serverTimestamp() });
}

export async function queueAdminNotification(args: {
  type: NotificationRuleType;
  title: string;
  message: string;
  relatedId?: string;
}) {
  const event = args.type === "new_order"
    ? "order_placed"
    : args.type === "order_status"
      ? "order_packed"
      : undefined;

  return queueNotification({
    type: args.type,
    source: "transaction",
    event,
    channel: "in_app",
    title: args.title,
    message: args.message,
    relatedId: args.relatedId,
  });
}

export async function sendAdminUserNotifications(args: {
  type: AdminNotificationType;
  title: string;
  messageHtml: string;
  recipients: Customer[];
}) {
  if (!args.recipients.length) throw new Error("Select at least one customer.");

  // Customer push identity must be the same Firebase Auth UID used by the
  // Website when it registers the browser FCM token. Do not fall back to the
  // Firestore customer document id for notification delivery.
  const recipients = args.recipients.map((recipient) => {
    const authUid = String(recipient.authUid || recipient.authUids?.[0] || "").trim();
    if (!recipient.id) throw new Error("Selected customer is missing its customer ID.");
    if (!authUid) {
      throw new Error(`Customer "${recipient.name || recipient.mobileNumber || recipient.id}" is not linked to a Firebase Auth UID.`);
    }
    return {
      id: recipient.id,
      authUid,
      name: recipient.name || "",
      mobileNumber: recipient.mobileNumber || recipient.phone || "",
      phone: recipient.phone || "",
      email: recipient.email || "",
    };
  });

  const result = await callWebsiteNotificationApi("/api/notifications/admin", {
    type: args.type,
    title: args.title,
    messageHtml: args.messageHtml,
    recipients,
  });
  return result as { campaignId: string; recipientCount: number; pushSentCount: number };
}

export async function sendTransactionNotification(args: {
  event: "order_placed" | "payment_failed" | "order_packed" | "out_for_delivery" | "order_delivered" | "order_cancelled" | "subscription_activated" | "subscription_delivery_scheduled";
  orderId: string;
  subscriptionId?: string;
}) {
  return callWebsiteNotificationApi("/api/notifications/transaction", args) as Promise<{ notificationId: string; created: boolean }>;
}
