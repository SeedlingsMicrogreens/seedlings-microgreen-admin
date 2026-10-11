import type { Order, OrderStatus } from "@/types/order";

export const ACTIVE_ORDER_STATUSES: readonly OrderStatus[] = [
  "confirmed",
  "preparing",
  "packed",
  "ready_for_handover",
  "handed_to_delivery",
  "out_for_delivery",
];

const SUCCESSFUL_PAYMENT_STATUSES = new Set(["paid", "partially_paid"]);

export type DeliveredDateRange = {
  startDate: string;
  endDate: string;
};

export type DeliveredDateBounds = {
  start: Date;
  endExclusive: Date;
};

export type DeliveredOrder = {
  order: Order;
  deliveredAt: Date;
};

export function isActiveOrder(order: Pick<Order, "status" | "paymentStatus">): boolean {
  return ACTIVE_ORDER_STATUSES.includes(order.status) && SUCCESSFUL_PAYMENT_STATUSES.has(order.paymentStatus);
}

function localDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function defaultDeliveredDateRange(now = new Date()): DeliveredDateRange {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6);
  return { startDate: localDateString(start), endDate: localDateString(today) };
}

function parseLocalDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(year, month - 1, day);

  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

export function deliveredDateBounds(startDate: string, endDate: string): DeliveredDateBounds {
  const start = parseLocalDate(startDate);
  const end = parseLocalDate(endDate);
  if (!start || !end) throw new Error("Enter a valid Start Date and End Date.");
  if (start.getTime() > end.getTime()) throw new Error("Start Date must be on or before End Date.");

  return {
    start,
    endExclusive: new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1),
  };
}

export function orderTimestampToDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    const date = value.toDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
  }
  return null;
}
