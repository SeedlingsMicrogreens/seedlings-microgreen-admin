import type { Product } from "@/types/catalog";
import type { Order } from "@/types/order";
import type { GrowingBatch } from "@/types/growingBatch";
import type { ForecastRow } from "@/types/forecast";
import type { Subscription } from "@/types/subscription";
import type { SalesProduct } from "@/types/salesProduct";

const CLOSED_ORDER_STATUSES = new Set(["delivered", "cancelled"]);

function itemWeightGrams(
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

function orderRequirementGrams(order: Order, product: Product, salesProductsById: Map<string, SalesProduct>) {
  return (order.items ?? []).reduce((sum, item) => {
    const quantity = Math.max(0, Number(item.quantity ?? 0));
    if (!quantity) return sum;

    // New orders reference the Salable Product. A combo must be expanded into
    // its production-product components instead of treating the whole box
    // weight as belonging to one production product.
    const salable = item.salableProductId
      ? salesProductsById.get(item.salableProductId)
      : undefined;

    if (salable?.components?.length) {
      const componentGrams = salable.components
        .filter(component => component.productId === product.id)
        .reduce((total, component) => total + Math.max(0, Number(component.quantityGrams ?? 0)), 0);
      return sum + componentGrams * quantity;
    }

    // Legacy orders may have productId directly pointing to the production
    // product. Keep those orders working without requiring a migration.
    if (item.productId === product.id) {
      return sum + itemWeightGrams(item, product);
    }

    return sum;
  }, 0);
}

/**
 * Build a deliberately simple production plan:
 *
 * Need to grow = max(0, current requirement - current stock - ongoing batch expected).
 *
 * Current requirement is the next/current requirement represented by active
 * subscriptions plus every order that has not been delivered or cancelled.
 * Ongoing batch expected is the expected usable yield from batch items that
 * are still growing/ready and have not been harvested or failed.
 */
export function buildForecast(
  products: Product[],
  orders: Order[],
  batches: GrowingBatch[],
  _historicalDays: number,
  _asOf = new Date(),
  subscriptions: Subscription[] = [],
  salesProducts: SalesProduct[] = [],
): ForecastRow[] {
  const salesProductsById = new Map(salesProducts.map(salable => [salable.id, salable]));

  return products
    .filter(product => product.status !== "inactive")
    .map(product => {
      const cycleDays = Math.max(1, Math.round(Number(product.growingCycleDays ?? 0)));
      const currentStock = Math.max(0, Math.round(Number(product.stockGrams ?? product.stock ?? 0)));

      const openOrderRequirement = orders.reduce((sum, order) => {
        if (CLOSED_ORDER_STATUSES.has(String(order.status))) return sum;
        return sum + orderRequirementGrams(order, product, salesProductsById);
      }, 0);

      // An active subscription represents its next/current delivery requirement.
      // Once subscription deliveries are generated into orders, those orders are
      // already represented by the open-order total above, so do not double count
      // them here when sourceSubscriptionId is present.
      const subscriptionRequirement = subscriptions
        .filter(sub => sub.status === "active" && sub.productId === product.id)
        .filter(sub => !orders.some(order =>
          order.sourceSubscriptionId === sub.id &&
          !CLOSED_ORDER_STATUSES.has(String(order.status))
        ))
        .reduce(
          (sum, sub) => sum + Math.max(0, Number(sub.weightGrams ?? 0)) * Math.max(0, Number(sub.quantity ?? 0)),
          0,
        );

      const currentRequirement = Math.max(0, Math.round(openOrderRequirement + subscriptionRequirement));

      const inProduction = batches.reduce((sum, batch) => {
        if (batch.status === "completed") return sum;
        return sum + (batch.items ?? [])
          .filter(item => item.productId === product.id && !["harvested", "failed"].includes(item.status))
          .reduce((total, item) => total + Math.max(0, Number(item.expectedUsableYieldGrams ?? 0)), 0);
      }, 0);

      const needToGrow = Math.max(0, currentRequirement - currentStock - inProduction);
      const expectedYieldGramsPerTray = Math.max(0, Math.round(Number(
        product.expectedYieldGramsPerTray ?? product.expectedYieldGramsPerBatch ?? 0
      )));
      const traysToGrow = needToGrow > 0 && expectedYieldGramsPerTray > 0
        ? Math.ceil(needToGrow / expectedYieldGramsPerTray)
        : 0;

      return {
        productId: product.id,
        productName: product.name,
        cycleDays,
        currentStockGrams: Math.round(currentStock),
        inProductionGrams: Math.round(inProduction),
        currentRequirementGrams: currentRequirement,
        needToGrowGrams: Math.round(needToGrow),
        expectedYieldGramsPerTray,
        traysToGrow,
      };
    })
    .filter(row =>
      row.currentStockGrams > 0 ||
      row.inProductionGrams > 0 ||
      row.currentRequirementGrams > 0 ||
      row.cycleDays > 0,
    );
}
