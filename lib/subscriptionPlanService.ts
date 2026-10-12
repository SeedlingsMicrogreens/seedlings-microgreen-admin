import { doc, getDoc } from "firebase/firestore";
import { createRecord, deleteRecord, listAllCollectionByField, updateRecord } from "./firestore";
import {
  buildSubscriptionPlanSellingOptions,
  calculateSubscriptionPlanPrice,
  current100gSellingPrice,
} from "./subscriptionPlanPricing";
import { db } from "./firebase";
import type { SalesProduct } from "@/types/salesProduct";
import type { SubscriptionPlan } from "@/types/subscriptionPlan";

export async function createSubscriptionPlan(
  input: Omit<SubscriptionPlan,"id"|"createdAt"|"updatedAt">,
  recalculateMissingPriceOptionIds: string[] = [],
) {
  if (!input.salableProductId?.trim()) throw new Error("Salable Product is required.");
  if (!input.salableProductName?.trim()) throw new Error("Salable Product name is required.");
  if (!input.name.trim()) throw new Error("Plan name is required.");
  if (!Number.isInteger(input.deliveriesPerTerm) || input.deliveriesPerTerm < 1) {
    throw new Error("Deliveries per term must be a positive whole number.");
  }
  if (!Number.isInteger(input.skipsAllowed) || input.skipsAllowed < 0) throw new Error("Skips allowed must be a non-negative whole number.");
  if (!Number.isFinite(input.price) || input.price < 0 || !Number.isFinite(input.deliveryCharge) || input.deliveryCharge < 0) {
    throw new Error("Prices must be valid non-negative numbers.");
  }

  const productSnapshot = await getDoc(doc(db, "salesProducts", input.salableProductId));
  if (!productSnapshot.exists()) throw new Error("Selected Product no longer exists.");
  const product = productSnapshot.data() as SalesProduct;
  const planPricePer100gms = current100gSellingPrice(product.sellingOptions ?? []);
  const maximumPlanPrice = calculateSubscriptionPlanPrice(input.deliveriesPerTerm, planPricePer100gms);
  const options = buildSubscriptionPlanSellingOptions(
    product.sellingOptions ?? [],
    input.deliveriesPerTerm,
    input.sellingOptions ?? [],
    [],
    recalculateMissingPriceOptionIds,
  );
  const seen = new Set<string>();
  for (const option of options) {
    if (!option.id || !Number.isFinite(option.weightGrams) || option.weightGrams <= 0) {
      throw new Error("Every subscription selling option must have a valid product selling option.");
    }
    if (seen.has(option.id)) throw new Error("The same selling option cannot be added twice.");
    seen.add(option.id);
  }
  return createRecord("subscriptionPlans", {
    ...input,
    price: planPricePer100gms,
    maximumPlanPrice,
    sellingOptions: options,
  } as Record<string,unknown>);
}
export async function updateSubscriptionPlan(
  id:string,
  input:Partial<SubscriptionPlan>,
  recalculateMissingPriceOptionIds: string[] = [],
) {
  if (!id.trim()) throw new Error("Subscription plan ID is required.");
  if (input.deliveriesPerTerm !== undefined &&
      (!Number.isInteger(input.deliveriesPerTerm) || input.deliveriesPerTerm < 1)) {
    throw new Error("Deliveries per term must be a positive whole number.");
  }
  const planSnapshot = await getDoc(doc(db, "subscriptionPlans", id));
  if (!planSnapshot.exists()) throw new Error("Subscription plan no longer exists.");
  const current = planSnapshot.data() as SubscriptionPlan;
  const productId = input.salableProductId ?? current.salableProductId;
  if (!productId?.trim()) throw new Error("Salable Product is required.");
  const productSnapshot = await getDoc(doc(db, "salesProducts", productId));
  if (!productSnapshot.exists()) throw new Error("Selected Product no longer exists.");
  const product = productSnapshot.data() as SalesProduct;
  const deliveriesPerTerm = input.deliveriesPerTerm ?? current.deliveriesPerTerm;
  const planPricePer100gms = current100gSellingPrice(product.sellingOptions ?? []);
  const maximumPlanPrice = calculateSubscriptionPlanPrice(deliveriesPerTerm, planPricePer100gms);
  const sellingOptions = buildSubscriptionPlanSellingOptions(
    product.sellingOptions ?? [],
    deliveriesPerTerm,
    input.sellingOptions ?? [],
    current.sellingOptions ?? [],
    recalculateMissingPriceOptionIds,
  );

  return updateRecord("subscriptionPlans", id, {
    ...input,
    price: planPricePer100gms,
    maximumPlanPrice,
    sellingOptions,
  } as Record<string,unknown>);
}
export async function isSubscriptionPlanInUse(id:string) {
  if (!id?.trim()) throw new Error("Subscription plan ID is required.");
  const [bySubscriptionPlanId, byPlanId] = await Promise.all([
    listAllCollectionByField<Record<string, unknown>>("subscriptions", "subscriptionPlanId", id),
    listAllCollectionByField<Record<string, unknown>>("subscriptions", "planId", id),
  ]);
  return new Set([
    ...bySubscriptionPlanId.map(subscription => subscription.id),
    ...byPlanId.map(subscription => subscription.id),
  ]).size > 0;
}

export async function deleteSubscriptionPlan(id:string) {
  if (!id?.trim()) throw new Error("Subscription plan ID is required.");

  // Support both the current subscriptionPlanId field and the legacy planId field
  // so deletion remains protected if older/newer subscription records use either name.
  const [bySubscriptionPlanId, byPlanId] = await Promise.all([
    listAllCollectionByField<Record<string, unknown>>("subscriptions", "subscriptionPlanId", id),
    listAllCollectionByField<Record<string, unknown>>("subscriptions", "planId", id),
  ]);

  const usedSubscriptionIds = new Set([
    ...bySubscriptionPlanId.map(subscription => subscription.id),
    ...byPlanId.map(subscription => subscription.id),
  ]);

  if (usedSubscriptionIds.size > 0) {
    throw new Error("This subscription plan cannot be deleted because it is already used by one or more customer subscriptions.");
  }

  // The plan is unused, so permanently delete the master record.
  return deleteRecord("subscriptionPlans", id);
}
