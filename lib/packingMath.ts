import type { Product } from "@/types/catalog";
import type { Fulfilment, FulfilmentPackLine } from "@/types/fulfilment";
import type { Order, OrderItem } from "@/types/order";
import type { SalesProduct } from "@/types/salesProduct";

export function numberValue(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function itemWeightGrams(
  item: { unit?: string; quantity?: number; weightGrams?: number },
  product?: Product,
) {
  const quantity = Math.max(0, Number(item.quantity ?? 0));
  if (Number(item.weightGrams) > 0) {
    return Math.round(Number(item.weightGrams) * quantity);
  }

  const unit = String(item.unit ?? "").toLowerCase().replace(/\s/g, "");
  const match = unit.match(/([\d.]+)\s*(kg|g)/);
  if (match) {
    const n = Number(match[1]);
    return Math.round((match[2] === "kg" ? n * 1000 : n) * quantity);
  }

  const option = product?.sellingOptions?.find(o => o.active && o.weightGrams > 0);
  return option ? Math.round(option.weightGrams * quantity) : 0;
}

export function normalizeOrderItemWeightGrams(quantity: number, packageGrams: number) {
  return Math.max(0, Math.round(Number(packageGrams || 0) * Math.max(0, Number(quantity || 0))));
}

export function normalizeSubscriptionLineWeightGrams(quantity: number, packageGrams: number) {
  return Math.max(0, Math.round(Number(packageGrams || 0) * Math.max(0, Number(quantity || 0))));
}

export function requiredItemGrams(item: OrderItem) {
  return Math.max(0, Math.round(numberValue(item.weightGrams)));
}

export function componentShareGrams(
  salable: SalesProduct,
  component: { productId: string; percentage?: number; quantityGrams?: number },
  packageGrams: number,
) {
  const percentage = Number(component.percentage ?? 0);
  if (percentage > 0) return (packageGrams * percentage) / 100;

  const totalLegacyGrams = (salable.components ?? []).reduce((sum, entry) => sum + Math.max(0, Number(entry.quantityGrams ?? 0)), 0);
  const legacyGrams = Number(component.quantityGrams ?? 0);
  if (totalLegacyGrams > 0) return (packageGrams * legacyGrams) / totalLegacyGrams;

  return 0;
}

export function orderRequirementGrams(order: Order, product: Product, salesProductsById: Map<string, SalesProduct>) {
  return (order.items ?? []).reduce((sum, item) => {
    const quantity = Math.max(0, Number(item.quantity ?? 0));
    if (!quantity) return sum;

    const salable = item.salableProductId ? salesProductsById.get(item.salableProductId) : undefined;
    const lineWeightGrams = Math.max(0, Math.round(Number(item.weightGrams ?? itemWeightGrams(item, product) ?? 0)));

    if (salable?.components?.length) {
      const component = salable.components.find(component => component.productId === product.id);
      if (!component) return sum;
      return sum + componentShareGrams(salable, component, lineWeightGrams / Math.max(1, quantity)) * quantity;
    }

    if (item.productId === product.id) {
      return sum + lineWeightGrams;
    }

    return sum;
  }, 0);
}

export function componentGramsPerBox(salable: SalesProduct, boxGrams: number) {
  const components = salable.components ?? [];
  if (!components.length) throw new Error(`${salable.name} has no Microgreen components.`);

  if (salable.type === "single") {
    return components.map(component => ({
      productId: component.productId,
      productName: component.productName,
      quantityGrams: boxGrams,
    }));
  }

  const percentages = components.map(component => {
    const percentage = numberValue(component.percentage);
    if (percentage > 0) return percentage;
    const legacyTotal = components.reduce((sum, c) => sum + Math.max(0, numberValue(c.quantityGrams)), 0);
    return legacyTotal > 0 ? (numberValue(component.quantityGrams) / legacyTotal) * 100 : 0;
  });
  const totalPercentage = percentages.reduce((sum, value) => sum + value, 0);
  if (!Number.isFinite(totalPercentage) || totalPercentage <= 0) {
    throw new Error(`${salable.name} has invalid Microgreen percentages.`);
  }

  const result = components.map((component, index) => ({
    productId: component.productId,
    productName: component.productName,
    quantityGrams: Math.round(boxGrams * percentages[index] / totalPercentage),
  }));
  const difference = boxGrams - result.reduce((sum, item) => sum + item.quantityGrams, 0);
  if (result.length) result[result.length - 1].quantityGrams += difference;
  return result;
}

export function buildPackingIdempotencyKey(orderId: string, lines: FulfilmentPackLine[]) {
  return `${orderId}:${lines.map(line => `${line.orderItemIndex}:${line.boxGrams}:${line.boxesPacked}`).join("|")}`;
}

export function samePackingSnapshot(existing: Fulfilment | undefined, key: string) {
  return !!existing && existing.idempotencyKey === key && existing.status !== "cancelled";
}
