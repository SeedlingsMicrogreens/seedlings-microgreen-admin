import { addDoc, collection, doc, serverTimestamp, writeBatch } from "firebase/firestore";
import { db } from "./firebase";
import type { Customer } from "@/types/customer";
import type { NotificationRecord, NotificationRuleType, AdminNotificationType } from "@/types/notifications";

export async function queueNotification(input: Omit<NotificationRecord, "id"|"createdAt"|"status">) {
  return addDoc(collection(db,"notifications"), {
    ...input,
    status:"queued",
    createdAt:serverTimestamp(),
  });
}

export async function queueAdminNotification(args:{
  type:NotificationRuleType;
  title:string;
  message:string;
  relatedId?:string;
}) {
  return queueNotification({
    type:args.type,
    channel:"in_app",
    title:args.title,
    message:args.message,
    relatedId:args.relatedId,
  });
}

export async function sendAdminUserNotifications(args: {
  type: AdminNotificationType;
  title: string;
  messageHtml: string;
  recipients: Customer[];
}) {
  if (!args.recipients.length) throw new Error("Select at least one customer.");
  const batch = writeBatch(db);
  const campaignId = crypto.randomUUID();
  const message = typeof document === "undefined"
    ? args.messageHtml.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
    : (() => { const el = document.createElement("div"); el.innerHTML = args.messageHtml; return (el.textContent || "").replace(/\s+/g, " ").trim(); })();
  const createdAt = serverTimestamp();
  for (const recipient of args.recipients) {
    const ref = doc(collection(db, "notifications"));
    batch.set(ref, {
      campaignId,
      audienceType: args.type,
      recipientCustomerId: recipient.id,
      recipientUid: recipient.authUid || null,
      recipientName: recipient.name || "",
      recipientPhone: recipient.mobileNumber || recipient.phone || "",
      recipientEmail: recipient.email || "",
      channel: "in_app",
      type: args.type,
      title: args.title.trim(),
      message,
      messageHtml: args.messageHtml,
      status: "sent",
      createdAt,
      sentAt: createdAt,
    });
  }
  await batch.commit();
  return { campaignId, recipientCount: args.recipients.length };
}
