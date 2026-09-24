import { createRecord, deleteRecord, updateRecord } from "./firestore";
import type { Offer } from "@/types/offer";

export async function createOffer(input: Omit<Offer, "id" | "createdAt" | "updatedAt">) {
  validateOffer(input);
  return createRecord("offers", input as Record<string, unknown>);
}

export async function updateOffer(id: string, input: Partial<Offer>) {
  validateOffer(input as Offer, true);
  return updateRecord("offers", id, input as Record<string, unknown>);
}

export async function deleteOffer(id: string) {
  return deleteRecord("offers", id);
}

function validateOffer(input: Partial<Offer>, partial = false) {
  if (!partial || input.name !== undefined) {
    if (!input.name?.trim()) throw new Error("Offer name is required.");
  }

  if (!partial || input.locationType !== undefined) {
    if (input.locationType !== "all" && input.locationType !== "pincode") {
      throw new Error("Offer location is required.");
    }
  }

  if (!partial || input.startDate !== undefined || input.endDate !== undefined) {
    if (input.startDate && input.endDate && input.startDate > input.endDate) {
      throw new Error("End date cannot be before start date.");
    }
  }

  if (!partial || input.type !== undefined) {
    if (!input.type) throw new Error("Offer type is required.");
  }

  if (input.type === "price" || input.type === "deliveryCharge") {
    if (input.discountType !== "percentage" && input.discountType !== "flat") {
      throw new Error("Discount type is required.");
    }
    const value = Number(input.discountValue);
    if (!Number.isFinite(value) || value < 0) {
      throw new Error("Discount value must be 0 or more.");
    }
    if (input.discountType === "percentage" && value > 100) {
      throw new Error("Percentage discount cannot exceed 100%.");
    }
  }

  if (input.type === "quantity" && input.quantityRule) {
    const rule = input.quantityRule;
    if (!rule.buyProductId || !rule.buyPackaging || !rule.getProductId || !rule.getPackaging) {
      throw new Error("Buy Product, Buy Packaging, Get Product and Get Packaging are required.");
    }
    if (Number(rule.buyPackaging) <= 0 || Number(rule.getPackaging) <= 0) {
      throw new Error("Packaging must be greater than 0.");
    }
  }
}
