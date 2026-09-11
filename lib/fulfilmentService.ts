import { collection, doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";
import { auditEvent } from "./firestore";
import { listCollection } from "./firestore";
import type { Product } from "@/types/catalog";
import type { SalesProduct } from "@/types/salesProduct";
import type { Fulfilment, PackingItem, PackingLine } from "@/types/fulfilment";

export function validatePackingLine(line: PackingLine, salableProduct: SalesProduct) {
  if (!salableProduct.active) throw new Error(`${salableProduct.name} is inactive.`);
  if (!Number.isInteger(line.quantityPacked) || line.quantityPacked <= 0) {
    throw new Error(`Quantity for ${salableProduct.name} must be a positive whole number.`);
  }
  if (!Number.isInteger(line.boxGrams) || line.boxGrams <= 0) {
    throw new Error(`Box Gms for ${salableProduct.name} must be a positive whole number.`);
  }
  if (!salableProduct.components?.length) {
    throw new Error(`${salableProduct.name} has no production product components.`);
  }

  const recipeGrams = salableProduct.components.reduce((sum, c) => sum + Number(c.quantityGrams), 0);
  if (!salableProduct.components.every(c => Number.isInteger(Number(c.quantityGrams)) && Number(c.quantityGrams) > 0)) {
    throw new Error(`${salableProduct.name} has an invalid component quantity.`);
  }
  if (recipeGrams !== line.boxGrams) {
    throw new Error(`${salableProduct.name}: Box Gms (${line.boxGrams} gms) must match its component recipe total (${recipeGrams} gms).`);
  }
}

export async function listManualFulfilments() {
  return listCollection<Fulfilment>("fulfilments", "createdAt");
}

/**
 * Pack multiple Salable Products as one atomic worksheet operation.
 * Every row has a Salable Product, box grams and quantity. Combo recipes are
 * expanded to their Production Products. Requirements are aggregated before
 * stock is checked, so shared Production Products are handled correctly.
 */
export async function packSalableProducts(
  lines: PackingLine[],
  salableProducts: SalesProduct[],
  uid: string,
  email?: string,
) {
  if (!lines.length) throw new Error("Add at least one Salable Product to pack.");

  const selectedById = new Map(salableProducts.map(x => [x.id, x]));
  const cleanLines = lines.map(line => ({
    salableProductId: line.salableProductId,
    boxGrams: Number(line.boxGrams),
    quantityPacked: Number(line.quantityPacked),
  }));

  for (const line of cleanLines) {
    const product = selectedById.get(line.salableProductId);
    if (!product) throw new Error("One or more selected Salable Products could not be found. Refresh and retry.");
    validatePackingLine(line, product);
  }

  const productIds = [...new Set(cleanLines.flatMap(line =>
    (selectedById.get(line.salableProductId)?.components ?? []).map(c => c.productId)
  ))];
  const salableIds = [...new Set(cleanLines.map(line => line.salableProductId))];

  await runTransaction(db, async tx => {
    const productRefs = productIds.map(id => doc(db, "products", id));
    const salableRefs = salableIds.map(id => doc(db, "salesProducts", id));
    const [productSnaps, salableSnaps] = await Promise.all([
      Promise.all(productRefs.map(ref => tx.get(ref))),
      Promise.all(salableRefs.map(ref => tx.get(ref))),
    ]);

    if (productSnaps.some(s => !s.exists())) throw new Error("One or more production products no longer exist. Refresh and retry.");
    if (salableSnaps.some(s => !s.exists())) throw new Error("One or more Salable Products no longer exist. Refresh and retry.");

    const productsById = new Map(productSnaps.map((snap, i) => [productIds[i], {
      ref: productRefs[i],
      product: { id: productIds[i], ...(snap.data() as Omit<Product, "id">) } as Product,
    }]));
    const currentSalables = new Map(salableSnaps.map((snap, i) => [salableIds[i], {
      ref: salableRefs[i],
      product: { id: salableIds[i], ...(snap.data() as Omit<SalesProduct, "id">) } as SalesProduct,
    }]));

    // Revalidate against the current Firestore state, not stale UI data.
    for (const line of cleanLines) {
      const current = currentSalables.get(line.salableProductId);
      if (!current) throw new Error("A selected Salable Product is missing. Refresh and retry.");
      validatePackingLine(line, current.product);
    }

    const requiredByProduct = new Map<string, number>();
    for (const line of cleanLines) {
      const salable = currentSalables.get(line.salableProductId)!.product;
      for (const component of salable.components) {
        const grams = Number(component.quantityGrams) * line.quantityPacked;
        requiredByProduct.set(component.productId, (requiredByProduct.get(component.productId) ?? 0) + grams);
      }
    }

    const stockStates = [...requiredByProduct.entries()].map(([productId, required]) => {
      const state = productsById.get(productId);
      if (!state) throw new Error("A production product required by the packing worksheet is missing.");
      const available = Number(state.product.stockGrams ?? state.product.stock ?? 0);
      if (available < required) {
        throw new Error(`${state.product.name}: ${available.toLocaleString()} gms available, ${required.toLocaleString()} gms required. Nothing was packed.`);
      }
      return { productId, ...state, available, required };
    });

    // All validations and stock checks are complete. Only now perform writes.
    for (const state of stockStates) {
      const nextStock = state.available - state.required;
      tx.update(state.ref, {
        stockGrams: nextStock,
        stock: nextStock,
        updatedAt: serverTimestamp(),
      });
      const adjustmentRef = doc(collection(db, "inventoryAdjustments"));
      tx.set(adjustmentRef, {
        productId: state.productId,
        productName: state.product.name,
        type: "packaging",
        quantity: state.required,
        previousStock: state.available,
        newStock: nextStock,
        reason: `Manual packing worksheet: ${cleanLines.length} line(s)`,
        salableProductIds: salableIds,
        createdByUid: uid,
        createdByEmail: email ?? "",
        createdAt: serverTimestamp(),
      });
    }

    for (const line of cleanLines) {
      const current = currentSalables.get(line.salableProductId)!;
      const currentPacked = Number(current.product.packedStockQuantity ?? 0);
      tx.update(current.ref, {
        packedStockQuantity: currentPacked + line.quantityPacked,
        updatedAt: serverTimestamp(),
      });

      const items: PackingItem[] = current.product.components.map(component => ({
        productId: component.productId,
        productName: component.productName,
        quantityGrams: Number(component.quantityGrams),
        totalGrams: Number(component.quantityGrams) * line.quantityPacked,
      }));
      const totalGramsConsumed = items.reduce((sum, item) => sum + item.totalGrams, 0);
      const fulfilmentRef = doc(collection(db, "fulfilments"));
      tx.set(fulfilmentRef, {
        salableProductId: current.product.id,
        salableProductName: current.product.name,
        salableProductSku: current.product.sku ?? "",
        boxGrams: line.boxGrams,
        quantityPacked: line.quantityPacked,
        items,
        totalGramsConsumed,
        status: "packed",
        packedAt: serverTimestamp(),
        packedByUid: uid,
        packedByEmail: email ?? "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  });
  await auditEvent("pack", "fulfilments", undefined, `Packed ${cleanLines.reduce((sum, line) => sum + line.quantityPacked, 0)} Salable Product unit(s) across ${cleanLines.length} worksheet line(s)`);
}

/** Compatibility wrapper for older callers. New packaging uses the worksheet API above. */
export async function packSalableProduct(
  salableProduct: SalesProduct,
  quantityPacked: number,
  uid: string,
  email?: string,
) {
  const boxGrams = salableProduct.components.reduce((sum, c) => sum + Number(c.quantityGrams), 0);
  return packSalableProducts([{ salableProductId: salableProduct.id, boxGrams, quantityPacked }], [salableProduct], uid, email);
}

/** Kept as compatibility exports; Phase C remains manual and order-independent. */
export async function ensureFulfilmentForOrder() { return false; }
export async function generateDueSubscriptionOrders() { return []; }
export async function packOrder() { throw new Error("Order-based packing is not part of Phase C. Use manual Salable Product packing."); }
