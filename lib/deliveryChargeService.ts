import { createRecord, deleteRecord, updateRecord } from "./firestore";
import type { DeliveryCharge } from "@/types/deliveryCharge";

export async function createDeliveryCharge(input: Omit<DeliveryCharge,"id"|"createdAt"|"updatedAt">) {
  if (!input.name.trim()) throw new Error("Delivery charge name is required.");
  if (input.amount < 0) throw new Error("Delivery charge cannot be negative.");
  return createRecord("deliveryCharges", input as Record<string,unknown>);
}
export async function updateDeliveryCharge(id:string,input:Partial<DeliveryCharge>) {
  return updateRecord("deliveryCharges",id,input as Record<string,unknown>);
}
export async function deleteDeliveryCharge(id:string) {
  // Delivery charges are retained as inactive masters so historical orders can
  // continue to reference their snapshot/charge identity.
  return updateRecord("deliveryCharges", id, { active: false });
}
