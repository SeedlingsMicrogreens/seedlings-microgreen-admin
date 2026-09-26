import { createRecord, sanitizeFirestoreData, updateRecord } from "./firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { storage, auth } from "./firebase";
import type { Customer } from "@/types/customer";
import type { SalesProduct, SalesProductSellingOption } from "@/types/salesProduct";

export async function uploadOrderPaymentReceipt(orderId: string, file: File, transactionKey?: string) {
  if (!file) return null;
  if (!file.type.startsWith("image/")) throw new Error("Payment receipt must be an image file.");
  if (file.size > 5 * 1024 * 1024) throw new Error("Payment receipt image must be 5 MB or smaller.");

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const key = transactionKey || Date.now().toString();
  const path = `orders/${orderId}/payment-receipt-${key}-${safeName}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file, { contentType: file.type });
  const url = await getDownloadURL(storageRef);
  return { url, path };
}

export async function createAdminOrder(args: {
  customer: Customer;
  items: { salableProduct: SalesProduct; sellingOption: SalesProductSellingOption; quantity: number; imageUrl?: string }[];
  deliveryCharge?: { id: string; name: string; amount: number } | null;
  discount?: number;
  appliedOffers?: { priceOfferId?: string; priceOfferName?: string; deliveryOfferId?: string; deliveryOfferName?: string };
  scheduledDeliveryDate?: string;
  notes?: string;
  amountPaid?: number;
  transactionId?: string;
  paymentReceiptFile?: File | null;
}) {
  if (!args.items.length) throw new Error("Add at least one item.");
  if (args.items.some(x => !Number.isInteger(x.quantity) || x.quantity < 1)) {
    throw new Error("Item quantities must be at least 1.");
  }

  const deliveryAddress = args.customer.addresses?.[0];
  if (!deliveryAddress) {
    throw new Error("This customer has no saved delivery address. Please add a delivery address before creating the order.");
  }

  const items = args.items.map(x => ({
    salableProductId: x.salableProduct.id,
    salableProductSku: x.salableProduct.sku || "",
    salableProductType: x.salableProduct.type,
    productId: x.salableProduct.id,
    productName: x.salableProduct.name,
    sellingOptionId: x.sellingOption.id,
    sellingOptionLabel: x.sellingOption.weightGrams >= 1000 && x.sellingOption.weightGrams % 1000 === 0
      ? `${x.sellingOption.weightGrams / 1000}kg box`
      : `${x.sellingOption.weightGrams}g box`,
    weightGrams: Number(x.sellingOption.weightGrams),
    quantity: x.quantity,
    unitPrice: Number(x.sellingOption.price),
    lineTotal: Number(x.sellingOption.price) * x.quantity,
    imageUrl: x.imageUrl || x.salableProduct.imageUrl || "",
  }));

  const subtotal = items.reduce((n, x) => n + x.lineTotal, 0);
  const rawDeliveryFee = Number(args.deliveryCharge?.amount || 0);
  const discount = Math.min(subtotal + rawDeliveryFee, Math.max(0, Number(args.discount || 0)));
  const deliveryFee = rawDeliveryFee;
  const orderNumber = `ORD-${Date.now().toString(36).toUpperCase()}`;
  const transactionId = args.transactionId?.trim() || "";
  const actor = auth.currentUser;
  const paidAmount = Number(args.amountPaid || 0);
  const total = Math.max(0, subtotal + deliveryFee - discount);
  if (!Number.isFinite(paidAmount) || paidAmount < 0 || paidAmount > total + 0.005) {
    throw new Error(`Amount paid must be between ₹0.00 and ₹${total.toFixed(2)}.`);
  }
  const paymentStatus = paidAmount >= total - 0.005 && total > 0 ? "paid" : paidAmount > 0 ? "partially_paid" : "pending";
  const paymentTransactionKey = paidAmount > 0 ? `PAY-${Date.now().toString(36).toUpperCase()}` : "";

  // Admin-created orders are deliberately one-time only. Subscription creation is not part of this flow.
  const ref = await createRecord("orders", sanitizeFirestoreData({
    orderNumber,
    customerId: args.customer.id,
    customerName: args.customer.name?.trim() || args.customer.mobileNumber || args.customer.phone || args.customer.id || "",
    customerMobile: args.customer.mobileNumber || args.customer.phone || args.customer.id || "",
    items,
    subtotal,
    deliveryFee,
    discount,
    total,
    currency: "INR",
    paymentStatus,
    paymentMethod: "offline",
    transactionId: paidAmount > 0 ? transactionId : "",
    paymentDate: paidAmount > 0 ? new Date() : null,
    paidAmount,
    paymentTransactions: paidAmount > 0 ? [{
      id: paymentTransactionKey,
      amount: paidAmount,
      paymentMethod: "offline",
      transactionId,
      recordedAt: new Date(),
      recordedByUid: actor?.uid || "",
      recordedByEmail: actor?.email || "",
    }] : [],
    status: "confirmed",
    deliveryAddress,
    scheduledDeliveryDate: args.scheduledDeliveryDate || "",
    notes: args.notes || "",
    orderType: "one_time",
    sourceSubscriptionId: "",
    sourceSubscriptionDeliveryNumber: 0,
    subscriptionPlanId: "",
    subscriptionPlanName: "",
    subscriptionPlanFrequency: "",
    deliveryChargeId: args.deliveryCharge?.id || "",
    deliveryChargeName: args.deliveryCharge?.name || "",
    deliveryChargeSnapshot: deliveryFee,
    appliedOffers: args.appliedOffers ?? {},
    packingStatus: "pending",
    paymentRecordedByUid: actor?.uid || "",
    paymentRecordedByEmail: actor?.email || "",
  } as Record<string, unknown>));

  if (args.paymentReceiptFile) {
    if (paidAmount <= 0) throw new Error("A payment amount is required before attaching a transaction photo.");
    const receipt = await uploadOrderPaymentReceipt(ref.id, args.paymentReceiptFile, paymentTransactionKey);
    if (!receipt) throw new Error("Unable to upload payment receipt.");
    const tx = {
      id: paymentTransactionKey,
      amount: paidAmount,
      paymentMethod: "offline",
      transactionId,
      paymentReceiptUrl: receipt.url,
      paymentReceiptPath: receipt.path,
      recordedAt: new Date(),
      recordedByUid: actor?.uid || "",
      recordedByEmail: actor?.email || "",
    };
    await updateRecord("orders", ref.id, {
      paymentReceiptUrl: receipt.url,
      paymentReceiptPath: receipt.path,
      paymentTransactions: [tx],
    });
  }

  return ref;
}
