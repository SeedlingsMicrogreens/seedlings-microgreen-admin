import {
  arrayUnion,
  doc,
  runTransaction,
  serverTimestamp
} from "firebase/firestore";
import { db } from "./firebase";
import type { Order, OrderStatus, PaymentTransaction } from "@/types/order";
import { auditEvent } from "./firestore";
import { canTransitionOrderStatus } from "@/types/order";
import { uploadOrderPaymentReceipt } from "./orderCreationService";

export async function updateOrderStatus(
  order: Order,
  nextStatus: OrderStatus,
  uid: string,
  email?: string,
  note?: string
) {
  if (!canTransitionOrderStatus(order.status, nextStatus)) {
    throw new Error(`Invalid order status transition: ${order.status} → ${nextStatus}`);
  }

  const orderRef = doc(db, "orders", order.id);

  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(orderRef);
    if (!snapshot.exists()) throw new Error("Order no longer exists.");

    const current = snapshot.data() as Order;
    if (!canTransitionOrderStatus(current.status, nextStatus)) {
      throw new Error(`Order has changed. Refresh and try again.`);
    }

    transaction.update(orderRef, {
      status: nextStatus,
      updatedAt: serverTimestamp(),
      statusHistory: arrayUnion({
        status: nextStatus,
        changedByUid: uid,
        changedByEmail: email ?? "",
        note: note?.trim() || "",
        changedAt: new Date()
      })
    });
  });
  await auditEvent("update", "orders", order.id, `Order status changed to ${nextStatus}`);
}

export async function addOrderPayment(
  order: Order,
  amount: number,
  uid: string,
  email?: string,
  transactionId?: string,
  receiptFile?: File | null,
) {
  const paymentAmount = Number(amount);
  const total = Number(order.total || 0);
  const alreadyPaid = Number(order.paidAmount || 0);
  const remaining = Math.max(0, total - alreadyPaid);

  if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
    throw new Error("Payment amount must be greater than zero.");
  }
  if (paymentAmount > remaining + 0.005) {
    throw new Error(`Payment cannot exceed the remaining balance of ₹${remaining.toFixed(2)}.`);
  }

  const paymentTransactionId = `PAY-${Date.now().toString(36).toUpperCase()}`;
  const trimmedTransactionId = transactionId?.trim() || "";
  const orderRef = doc(db, "orders", order.id);
  let receipt: { url: string; path: string } | null = null;

  // Upload first so the payment history can contain the receipt reference atomically.
  if (receiptFile) {
    receipt = await uploadOrderPaymentReceipt(order.id, receiptFile, paymentTransactionId);
  }

  const transactionEntry: PaymentTransaction = {
    id: paymentTransactionId,
    amount: paymentAmount,
    paymentMethod: "offline",
    transactionId: trimmedTransactionId,
    ...(receipt ? { paymentReceiptUrl: receipt.url, paymentReceiptPath: receipt.path } : {}),
    recordedAt: new Date(),
    recordedByUid: uid,
    recordedByEmail: email ?? "",
  };

  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(orderRef);
    if (!snapshot.exists()) throw new Error("Order no longer exists.");
    const current = snapshot.data() as Order;
    const currentPaid = Number(current.paidAmount || 0);
    const currentRemaining = Math.max(0, Number(current.total || 0) - currentPaid);
    if (paymentAmount > currentRemaining + 0.005) {
      throw new Error(`Payment cannot exceed the current remaining balance of ₹${currentRemaining.toFixed(2)}. Refresh and try again.`);
    }
    const newPaid = Math.min(Number(current.total || 0), currentPaid + paymentAmount);
    const newStatus = newPaid >= Number(current.total || 0) - 0.005 ? "paid" : "partially_paid";
    transaction.update(orderRef, {
      paidAmount: newPaid,
      paymentStatus: newStatus,
      paymentMethod: "offline",
      paymentDate: serverTimestamp(),
      ...(trimmedTransactionId ? { transactionId: trimmedTransactionId } : {}),
      ...(receipt ? { paymentReceiptUrl: receipt.url, paymentReceiptPath: receipt.path } : {}),
      paymentTransactions: arrayUnion(transactionEntry),
      updatedAt: serverTimestamp(),
    });
  });

  await auditEvent("update", "orders", order.id, `Offline payment recorded: ${paymentAmount}`);
}

export async function refundOrderPayment(
  order: Order,
  uid: string,
  email?: string,
  reason?: string,
) {
  if (order.paymentStatus !== "paid") {
    throw new Error("Only fully paid orders can be refunded.");
  }
  const amount = Number(order.paidAmount ?? order.total);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Refund amount is invalid.");
  }
  const orderRef = doc(db, "orders", order.id);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(orderRef);
    if (!snapshot.exists()) throw new Error("Order no longer exists.");
    const current = snapshot.data() as Order;
    if (current.paymentStatus !== "paid") {
      throw new Error("Payment has already been refunded or is no longer refundable.");
    }
    transaction.update(orderRef, {
      paymentStatus: "refunded",
      refundAmount: amount,
      refundedAt: serverTimestamp(),
      refundedByUid: uid,
      refundedByEmail: email ?? "",
      refundReason: reason?.trim() || "",
      updatedAt: serverTimestamp(),
    });
  });
  await auditEvent("refund", "orders", order.id, `Order payment refunded: ${amount}`);
}
