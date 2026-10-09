import type { Product } from "@/types/catalog";
import type { Order } from "@/types/order";
import type { GrowingBatch } from "@/types/growingBatch";
import type { ForecastRow } from "@/types/forecast";
import type { Subscription } from "@/types/subscription";
import type { SalesProduct } from "@/types/salesProduct";
import { componentShareGrams, orderRequirementGrams } from "./packingMath";

const CLOSED_ORDER_STATUSES = new Set(["delivered", "cancelled"]);

export { componentShareGrams, orderRequirementGrams } from "./packingMath";

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
        if (batch.status === "completed_harvested" || batch.status === "closed") return sum;
        return sum + (batch.items ?? [])
          .filter(item => item.productId === product.id && !["completed_harvested", "failed"].includes(item.status))
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
