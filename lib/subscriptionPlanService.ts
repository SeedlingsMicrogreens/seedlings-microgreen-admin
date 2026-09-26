import { createRecord, deleteRecord, listAllCollectionByField, updateRecord } from "./firestore";
import type { SubscriptionPlan } from "@/types/subscriptionPlan";

export async function createSubscriptionPlan(input: Omit<SubscriptionPlan,"id"|"createdAt"|"updatedAt">) {
  if (!input.salableProductId?.trim()) throw new Error("Salable Product is required.");
  if (!input.salableProductName?.trim()) throw new Error("Salable Product name is required.");
  if (!input.name.trim()) throw new Error("Plan name is required.");
  if (input.deliveriesPerTerm < 1) throw new Error("Deliveries per term must be at least 1.");
  if (!Number.isInteger(input.skipsAllowed) || input.skipsAllowed < 0) throw new Error("Skips allowed must be a non-negative whole number.");
  if (input.price < 0 || input.deliveryCharge < 0) throw new Error("Prices cannot be negative.");
  const options = input.sellingOptions ?? [];
  const seen = new Set<string>();
  for (const option of options) {
    if (!option.id || !Number.isFinite(option.weightGrams) || option.weightGrams <= 0) {
      throw new Error("Every subscription selling option must have a valid product selling option.");
    }
    if (seen.has(option.id)) throw new Error("The same selling option cannot be added twice.");
    seen.add(option.id);
    if (!Number.isFinite(option.planPrice) || option.planPrice < 0) {
      throw new Error("Plan price cannot be negative.");
    }
  }
  return createRecord("subscriptionPlans", input as Record<string,unknown>);
}
export async function updateSubscriptionPlan(id:string,input:Partial<SubscriptionPlan>) {
  return updateRecord("subscriptionPlans",id,input as Record<string,unknown>);
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
