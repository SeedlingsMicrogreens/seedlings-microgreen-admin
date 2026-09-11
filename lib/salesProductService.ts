import { createRecord, deleteRecord, listCollection, updateRecord } from "./firestore";
import type { Product } from "@/types/catalog";
import type { SalesProduct, SalesProductComponent, SalesProductType } from "@/types/salesProduct";

export function validateSalesProduct(input: {
  name: string;
  sku?: string;
  type: SalesProductType;
  components: SalesProductComponent[];
  mrp: number;
  sellingPrice: number;
  oneTimePurchase: boolean;
  subscriptionPurchase: boolean;
}) {
  if (!input.name.trim()) throw new Error("Sales product name is required.");
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
    if (!Number.isInteger(component.quantityGrams) || component.quantityGrams <= 0) {
      throw new Error("Component quantity must be a positive whole number of grams.");
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

export async function deleteSalesProduct(id: string) {
  return deleteRecord("salesProducts", id);
}

export function buildComponent(product: Product, quantityGrams: number): SalesProductComponent {
  return {
    productId: product.id,
    productName: product.name,
    productSku: product.sku,
    quantityGrams
  };
}
