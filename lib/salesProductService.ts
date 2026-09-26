import { collection, getDocs } from "firebase/firestore";
import { db } from "./firebase";
import { createRecord, deleteRecord, listCollection, updateRecord } from "./firestore";
import type { Product } from "@/types/catalog";
import type { SalesProduct, SalesProductComponent, SalesProductType } from "@/types/salesProduct";

export function validateSalesProduct(input: {
  name: string;
  imageUrl?: string;
  sku?: string;
  type: SalesProductType;
  components: SalesProductComponent[];
  mrp: number;
  sellingPrice: number;
  oneTimePurchase: boolean;
  subscriptionPurchase: boolean;
}) {
  if (!input.name.trim()) throw new Error("Sales product name is required.");
  if (!input.imageUrl?.trim()) throw new Error("Product image is required for a Salable Product.");
  if (input.sku !== undefined && !input.sku.trim()) throw new Error("SKU cannot be blank.");
  if (!Number.isFinite(input.mrp) || input.mrp <= 0) {
    throw new Error("MRP must be greater than zero.");
  }
  if (!Number.isFinite(input.sellingPrice) || input.sellingPrice <= 0) {
    throw new Error("Selling price must be greater than zero.");
  }
  if (input.sellingPrice > input.mrp) {
    throw new Error("Selling price cannot be greater than MRP.");
  }
  if (!input.oneTimePurchase && !input.subscriptionPurchase) {
    throw new Error("Select at least one purchase option.");
  }
  if (!input.components.length) throw new Error("At least one product component is required.");

  const seen = new Set<string>();
  for (const component of input.components) {
    if (!component.productId) throw new Error("Every component must have a production product.");
    if (seen.has(component.productId)) throw new Error("The same production product cannot be added twice.");
    seen.add(component.productId);
    if (input.type === "multiple") {
      const percentage = Number(component.percentage);
      if (!Number.isInteger(percentage) || percentage <= 0 || percentage > 100) {
        throw new Error("Each combo microgreen percentage must be a whole number between 1 and 100.");
      }
    } else if (!Number.isInteger(component.quantityGrams) || component.quantityGrams <= 0) {
      throw new Error("Component quantity must be a positive whole number of grams.");
    }
  }

  if (input.type === "multiple") {
    const totalPercentage = input.components.reduce((sum, component) => sum + Number(component.percentage ?? 0), 0);
    if (totalPercentage !== 100) {
      throw new Error(`Combo microgreen percentages must total exactly 100%. Current total is ${totalPercentage}%.`);
    }
  }

  if (input.type === "single" && input.components.length !== 1) {
    throw new Error("A Single salable product must contain exactly one production product.");
  }
  if (input.type === "multiple" && input.components.length < 2) {
    throw new Error("A Combo salable product must contain at least two production products.");
  }
}

export async function listSalesProducts() {
  return listCollection<SalesProduct>("salesProducts");
}

export async function createSalesProduct(data: Omit<SalesProduct, "id" | "createdAt" | "updatedAt">) {
  return createRecord("salesProducts", data as Record<string, unknown>);
}

export async function updateSalesProduct(id: string, data: Partial<Omit<SalesProduct, "id" | "createdAt" | "updatedAt">>) {
  return updateRecord("salesProducts", id, data as Record<string, unknown>);
}

export async function isSalesProductReferencedByOrder(id: string) {
  const ordersSnapshot = await getDocs(collection(db, "orders"));
  return ordersSnapshot.docs.some((item) => {
    const data = item.data() as { items?: Array<{ salableProductId?: string; productId?: string }> };
    return (data.items ?? []).some((orderItem) =>
      orderItem.salableProductId === id || orderItem.productId === id
    );
  });
}

export async function deleteOrDeactivateSalesProduct(id: string) {
  // A salable Product cannot be hard-deleted once it is referenced by an order.
  const referencedByOrder = await isSalesProductReferencedByOrder(id);

  if (referencedByOrder) {
    await updateRecord("salesProducts", id, { active: false });
    return { action: "deactivated" as const };
  }

  await deleteRecord("salesProducts", id);
  return { action: "deleted" as const };
}

/** @deprecated Use deleteOrDeactivateSalesProduct so references are preserved safely. */
export async function deleteSalesProduct(id: string) {
  return deleteOrDeactivateSalesProduct(id);
}

export function buildComponent(product: Product, quantityGrams: number): SalesProductComponent {
  return {
    productId: product.id,
    productName: product.name,
    productSku: product.sku,
    quantityGrams
  };
}
