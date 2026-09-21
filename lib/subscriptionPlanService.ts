import { createRecord, deleteRecord, updateRecord } from "./firestore";
import type { SubscriptionPlan } from "@/types/subscriptionPlan";

export async function createSubscriptionPlan(input: Omit<SubscriptionPlan,"id"|"createdAt"|"updatedAt">) {
  if (!input.salableProductId?.trim()) throw new Error("Salable Product is required.");
  if (!input.salableProductName?.trim()) throw new Error("Salable Product name is required.");
  if (!input.name.trim()) throw new Error("Plan name is required.");
  if (input.deliveriesPerTerm < 1) throw new Error("Deliveries per term must be at least 1.");
  if (input.price < 0 || input.deliveryCharge < 0) throw new Error("Prices cannot be negative.");
  return createRecord("subscriptionPlans", input as Record<string,unknown>);
}
export async function updateSubscriptionPlan(id:string,input:Partial<SubscriptionPlan>) {
  return updateRecord("subscriptionPlans",id,input as Record<string,unknown>);
}
export async function deleteSubscriptionPlan(id:string) {
  // Subscription plans are retained as inactive masters so existing subscriptions
  // keep their historical pricing/schedule context.
  return updateRecord("subscriptionPlans", id, { active: false });
}
