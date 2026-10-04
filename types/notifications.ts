export type AdminNotificationType = "one_time_order" | "subscription" | "other";

export type NotificationSource = "admin" | "transaction";

export type NotificationEvent =
  | "admin_message"
  | "order_placed"
  | "payment_success"
  | "payment_failed"
  | "order_packed"
  | "out_for_delivery"
  | "order_delivered"
  | "order_cancelled"
  | "subscription_activated"
  | "subscription_delivery_scheduled";

export type NotificationChannel = "in_app" | "push";

export type NotificationStatus = "queued" | "sent" | "failed" | "read";

export type PushStatus = "not_attempted" | "sent" | "not_available" | "failed";

export type NotificationRecord = {
  id: string;
  recipientUid?: string;
  recipientEmail?: string;
  recipientPhone?: string;
  channel: NotificationChannel;
  source?: NotificationSource;
  event?: NotificationEvent;
  type: NotificationRuleType | AdminNotificationType;
  title: string;
  message: string;
  status: NotificationStatus;
  pushStatus?: PushStatus;
  relatedId?: string;
  campaignId?: string;
  audienceType?: AdminNotificationType;
  recipientCustomerId?: string;
  recipientName?: string;
  messageHtml?: string;
  sentAt?: unknown;
  pushSentAt?: unknown;
  createdAt?: unknown;
};

export type NotificationRuleType =
  | "new_order"
  | "order_status"
  | "subscription_due"
  | "low_stock"
  | "harvest_due"
  | "system";

export type NotificationPreferences = {
  lowStockEnabled: boolean;
  newOrderEnabled: boolean;
  subscriptionDueEnabled: boolean;
  harvestDueEnabled: boolean;
  orderStatusEnabled: boolean;
};
