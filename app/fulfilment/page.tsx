"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminPage } from "@/components/admin/AdminPage";
import { useAuth } from "@/components/auth/AuthProvider";
import { listCollection } from "@/lib/firestore";
import { listManualFulfilments, packSalableProducts } from "@/lib/fulfilmentService";
import type { Product } from "@/types/catalog";
import type { SalesProduct } from "@/types/salesProduct";
import type { Fulfilment, PackingLine } from "@/types/fulfilment";
import type { Order } from "@/types/order";
import type { GrowingBatch } from "@/types/growingBatch";

type DraftLine = PackingLine & { key: string };
const newLine = (): DraftLine => ({
  key: `${Date.now()}-${Math.random()}`,
  salableProductId: "",
  boxGrams: 0,
  quantityPacked: 1,
});

function numberValue(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function formatTimestamp(value: unknown) {
  if (value && typeof value === "object" && "toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toLocaleString();
  }
  if (value instanceof Date) return value.toLocaleString();
  return "—";
}

export default function FulfilmentPage() {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [salableProducts, setSalableProducts] = useState<SalesProduct[]>([]);
  const [batches, setBatches] = useState<GrowingBatch[]>([]);
  const [history, setHistory] = useState<Fulfilment[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [lines, setLines] = useState<DraftLine[]>([newLine()]);
  const [showHistory, setShowHistory] = useState(false);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    try {
      const [productionProducts, salesProducts, growingBatches, fulfilments, ordersList] = await Promise.all([
        listCollection<Product>("products"),
        listCollection<SalesProduct>("salesProducts"),
        listCollection<GrowingBatch>("growingBatches"),
        listManualFulfilments(),
        listCollection<Order>("orders", "createdAt"),
      ]);
      setProducts(productionProducts);
      setSalableProducts(salesProducts);
      setBatches(growingBatches);
      setHistory(fulfilments);
      setOrders(ordersList);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load packaging data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const stockById = useMemo(
    () => new Map(products.map((product) => [product.id, numberValue(product.stockGrams ?? product.stock)])),
    [products]
  );
  const productById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const salableById = useMemo(
    () => new Map(salableProducts.map((salableProduct) => [salableProduct.id, salableProduct])),
    [salableProducts]
  );

  const preview = useMemo(() => {
    const requirements = new Map<string, { productName: string; required: number; available: number }>();
    const invalid: string[] = [];

    for (const line of lines) {
      const salable = salableById.get(line.salableProductId);
      if (!salable) continue;

      const recipeGrams = salable.components.reduce(
        (sum, component) => sum + numberValue(component.quantityGrams),
        0
      );
      const boxGrams = numberValue(line.boxGrams);
      const quantityPacked = numberValue(line.quantityPacked);

      if (!Number.isInteger(boxGrams) || boxGrams <= 0) {
        invalid.push(`${salable.name}: enter valid Box Gms.`);
      } else if (recipeGrams !== boxGrams) {
        invalid.push(`${salable.name}: Box Gms should be ${recipeGrams} gms for its recipe.`);
      }

      if (!Number.isInteger(quantityPacked) || quantityPacked <= 0) {
        invalid.push(`${salable.name}: enter a positive whole quantity.`);
      }

      for (const component of salable.components) {
        const required = numberValue(component.quantityGrams) * quantityPacked;
        const existing = requirements.get(component.productId);
        requirements.set(component.productId, {
          productName: component.productName || productById.get(component.productId)?.name || "Unknown product",
          required: (existing?.required ?? 0) + required,
          available: stockById.get(component.productId) ?? 0,
        });
      }
    }

    const rows = [...requirements.entries()].map(([productId, values]) => ({
      productId,
      ...values,
      remaining: values.available - values.required,
    }));

    return {
      rows,
      invalid,
      hasShortage: rows.some((row) => row.remaining < 0),
    };
  }, [lines, productById, salableById, stockById]);

  const canPack = Boolean(
    user &&
      lines.length &&
      lines.every((line) => line.salableProductId) &&
      !preview.invalid.length &&
      !preview.hasShortage
  );

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines((current) =>
      current.map((line) => {
        if (line.key !== key) return line;
        const next = { ...line, ...patch };
        if (patch.salableProductId !== undefined) {
          const salable = salableById.get(patch.salableProductId);
          next.boxGrams = salable
            ? salable.components.reduce((sum, component) => sum + numberValue(component.quantityGrams), 0)
            : 0;
        }
        return next;
      })
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    if (!user || !canPack) return;

    setWorking(true);
    try {
      await packSalableProducts(
        lines.map(({ key: _key, ...line }) => ({
          ...line,
          boxGrams: numberValue(line.boxGrams),
          quantityPacked: numberValue(line.quantityPacked),
        })),
        salableProducts,
        user.uid,
        user.email ?? undefined
      );
      setMessage("Packing completed successfully. Production Product stock and Salable Product packed stock were updated atomically.");
      setLines([newLine()]);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to complete packaging.");
    } finally {
      setWorking(false);
    }
  }

  const boxRequirements = useMemo(() => {
    type Requirement = {
      salableProductId: string;
      productName: string;
      weightGrams: number;
      boxes: number;
      type: SalesProduct["type"];
    };

    const requirements = new Map<string, Requirement>();

    for (const order of orders) {
      // Demand remains required until the order is delivered or cancelled.
      if (order.status === "delivered" || order.status === "cancelled") continue;

      for (const item of order.items ?? []) {
        const salableId = item.salableProductId || item.productId;
        const salable = salableById.get(salableId);
        if (!salable) continue;

        const boxes = Math.max(0, Math.round(numberValue(item.quantity)));
        if (!boxes) continue;

        // The order item's weight is the actual customer-selected pack size.
        // Fall back to the salable product recipe total for legacy orders.
        const weightGrams = Math.max(
          0,
          Math.round(
            numberValue(item.weightGrams) ||
              salable.components.reduce((sum, component) => sum + numberValue(component.quantityGrams), 0)
          )
        );
        if (!weightGrams) continue;

        const key = `${salableId}::${weightGrams}`;
        const existing = requirements.get(key);
        requirements.set(key, {
          salableProductId: salableId,
          productName: item.productName || salable.name,
          weightGrams,
          boxes: (existing?.boxes ?? 0) + boxes,
          type: salable.type,
        });
      }
    }

    return [...requirements.values()].sort(
      (a, b) => a.productName.localeCompare(b.productName) || a.weightGrams - b.weightGrams
    );
  }, [orders, salableById]);

  // This is the persistent loose-stock view. It does not depend on the current worksheet.
  // Actual Produced = cumulative net usable grams recorded by harvested Growing Batch items.
  // Packaging is split between Single Salable Products and Combo Salable Products.
  const productAvailableRows = useMemo(() => {
    const actualProduced = new Map<string, number>();

    for (const batch of batches) {
      for (const item of batch.items ?? []) {
        if (item.status !== "harvested") continue;
        const usable = numberValue(item.actualYieldGrams);
        actualProduced.set(item.productId, (actualProduced.get(item.productId) ?? 0) + usable);
      }
    }

    const individualPackaging = new Map<string, number>();
    const comboPackaging = new Map<string, number>();

    for (const record of history) {
      const isCombo = record.items.length > 1 || salableById.get(record.salableProductId)?.type === "multiple";
      const target = isCombo ? comboPackaging : individualPackaging;
      for (const item of record.items ?? []) {
        target.set(item.productId, (target.get(item.productId) ?? 0) + numberValue(item.totalGrams));
      }
    }

    return products
      .map((product) => {
        const produced = actualProduced.get(product.id) ?? 0;
        const individual = individualPackaging.get(product.id) ?? 0;
        const combo = comboPackaging.get(product.id) ?? 0;
        const available = produced - individual - combo;
        return {
          productId: product.id,
          productName: product.name,
          actualProduced: produced,
          individualPackaging: individual,
          comboPackaging: combo,
          available,
          currentStock: stockById.get(product.id) ?? 0,
        };
      })
      .sort((a, b) => a.productName.localeCompare(b.productName));
  }, [batches, history, products, salableById, stockById]);

  return (
    <AdminPage>
      <div className="container-fluid py-3">
        <div className="mb-3">
          <h1 className="h3 seedlings-brand mb-1">Packing & Fulfilment</h1>
          <p className="text-muted mb-0">
            Prepare multiple Salable Products in one packing worksheet and see the loose Production Product stock impact before saving.
          </p>
        </div>

        {message && <div className="alert alert-success">{message}</div>}
        {error && <div className="alert alert-danger">{error}</div>}

        <div className="card border-0 shadow-sm mb-4">
          <div className="card-header d-flex justify-content-between align-items-center">
            <div>
              <strong>Box Requirement</strong>
              <div className="small text-muted">Direct packing requirement from all open orders. Delivered and cancelled orders are excluded.</div>
            </div>
            <span className="badge text-bg-primary">
              {boxRequirements.reduce((sum, row) => sum + row.boxes, 0).toLocaleString()} boxes
            </span>
          </div>
          <div className="card-body">
            {!loading && !boxRequirements.length && (
              <div className="text-center text-muted py-3">No open order boxes to prepare.</div>
            )}
            {loading && (
              <div className="text-center py-3"><span className="spinner-border spinner-border-sm me-2" />Loading...</div>
            )}
            <div className="row g-3">
              {boxRequirements.map((row) => (
                <div className="col-12 col-md-6 col-xl-4" key={`${row.salableProductId}-${row.weightGrams}`}>
                  <div className="border rounded-3 p-3 h-100 bg-light-subtle">
                    <div className="fw-bold fs-5 mb-2">{row.productName}</div>
                    <div className="d-flex align-items-center justify-content-between gap-3">
                      <span className="badge text-bg-light border fs-6 fw-normal">{row.weightGrams.toLocaleString()} gms</span>
                      <span className="fw-bold fs-5">{row.boxes.toLocaleString()} boxes</span>
                    </div>
                    {row.type === "multiple" && (
                      <div className="small text-muted mt-2">Combo box</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card border-0 shadow-sm">
          <div className="card-header d-flex justify-content-between align-items-center">
            <strong>Manual Packing Worksheet</strong>
            <button
              type="button"
              className="btn btn-outline-primary btn-sm"
              onClick={() => setLines((current) => [...current, newLine()])}
            >
              + Add Product
            </button>
          </div>

          <form onSubmit={submit}>
            <div className="card-body">
              <div className="alert alert-info small">
                Select a <strong>Salable Product</strong>, enter its <strong>Box Gms</strong> and <strong>Quantity</strong>. Box Gms must match the Salable Product recipe total. Combo recipes are expanded into their Production Products automatically.
              </div>

              <div className="table-responsive">
                <table className="table align-middle">
                  <thead>
                    <tr>
                      <th style={{ minWidth: 300 }}>Salable Product</th>
                      <th style={{ width: 150 }}>Box Gms</th>
                      <th style={{ width: 150 }}>Quantity</th>
                      <th style={{ width: 60 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line) => {
                      const selected = salableById.get(line.salableProductId);
                      const recipeGrams = selected?.components.reduce(
                        (sum, component) => sum + numberValue(component.quantityGrams),
                        0
                      ) ?? 0;

                      return (
                        <tr key={line.key}>
                          <td>
                            <select
                              className="form-select"
                              value={line.salableProductId}
                              onChange={(e) => updateLine(line.key, { salableProductId: e.target.value })}
                              required
                            >
                              <option value="">Select Salable Product</option>
                              {salableProducts
                                .filter((product) => product.active)
                                .map((product) => (
                                  <option key={product.id} value={product.id}>
                                    {product.name}{product.sku ? ` (${product.sku})` : ""}
                                  </option>
                                ))}
                            </select>
                            {selected && (
                              <div className="small text-muted mt-1">
                                {selected.type === "single" ? "Single" : "Combo"} · Recipe: {recipeGrams.toLocaleString()}gms · Packed stock: {numberValue(selected.packedStockQuantity).toLocaleString()}
                              </div>
                            )}
                          </td>
                          <td>
                            <input
                              className="form-control"
                              type="number"
                              min="1"
                              step="1"
                              value={line.boxGrams || ""}
                              onChange={(e) => updateLine(line.key, { boxGrams: numberValue(e.target.value) })}
                              required
                            />
                            {selected && line.boxGrams !== recipeGrams && (
                              <div className="small text-danger mt-1">Expected {recipeGrams}gms</div>
                            )}
                          </td>
                          <td>
                            <input
                              className="form-control"
                              type="number"
                              min="1"
                              step="1"
                              value={line.quantityPacked}
                              onChange={(e) => updateLine(line.key, { quantityPacked: numberValue(e.target.value) })}
                              required
                            />
                          </td>
                          <td>
                            {lines.length > 1 && (
                              <button
                                type="button"
                                className="btn btn-outline-danger btn-sm"
                                title="Remove"
                                onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))}
                              >
                                ×
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="mt-4">
                <h6 className="mb-2">Available After Packaging</h6>
                <div className="table-responsive">
                  <table className="table table-sm align-middle mb-0">
                    <thead>
                      <tr>
                        <th>Production Product</th>
                        <th className="text-end">Required Gms</th>
                        <th className="text-end">Available Gms</th>
                        <th className="text-end">Available After Packaging</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.rows.map((row) => (
                        <tr key={row.productId}>
                          <td>{row.productName}</td>
                          <td className="text-end">{row.required.toLocaleString()} gms</td>
                          <td className="text-end">{row.available.toLocaleString()} gms</td>
                          <td className={`text-end fw-semibold ${row.remaining < 0 ? "text-danger" : "text-success"}`}>
                            {row.remaining.toLocaleString()} gms
                          </td>
                        </tr>
                      ))}
                      {!preview.rows.length && (
                        <tr>
                          <td colSpan={4} className="text-center text-muted py-3">
                            Select Salable Products to see stock impact.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {preview.invalid.map((warning, index) => (
                <div key={`${warning}-${index}`} className="alert alert-warning small mt-3 mb-0">
                  {warning}
                </div>
              ))}
              {preview.hasShortage && (
                <div className="alert alert-danger small mt-3 mb-0">
                  One or more Production Products do not have enough loose stock. Nothing will be deducted until all rows can be packed.
                </div>
              )}
            </div>

            <div className="card-footer d-flex justify-content-end">
              <button className="btn btn-success" disabled={working || loading || !canPack}>
                {working ? "Packing..." : "Pack All"}
              </button>
            </div>
          </form>
        </div>

        <div className="card border-0 shadow-sm mt-4">
          <div className="card-header d-flex justify-content-between align-items-center">
            <strong>Current Salable Packed Stock</strong>
            <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => setShowHistory((value) => !value)}>
              {showHistory ? "Hide Packaging History" : "Packaging History"}
            </button>
          </div>
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead>
                <tr>
                  <th>Salable Product</th>
                  <th>Type</th>
                  <th className="text-end">Packed Units</th>
                </tr>
              </thead>
              <tbody>
                {salableProducts.map((salableProduct) => (
                  <tr key={salableProduct.id}>
                    <td>
                      <strong>{salableProduct.name}</strong>
                      <div className="small text-muted">{salableProduct.sku || ""}</div>
                    </td>
                    <td>{salableProduct.type === "single" ? "Single" : "Combo"}</td>
                    <td className="text-end">{numberValue(salableProduct.packedStockQuantity).toLocaleString()}</td>
                  </tr>
                ))}
                {!loading && !salableProducts.length && (
                  <tr>
                    <td colSpan={3} className="text-center text-muted py-4">No salable products found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {showHistory && (
          <div className="card border-0 shadow-sm mt-3">
            <div className="card-header"><strong>Packaging History</strong></div>
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Salable Product</th>
                    <th>Box Gms</th>
                    <th>Quantity Packed</th>
                    <th>Gram Stock Consumed</th>
                    <th>Components</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((record) => (
                    <tr key={record.id}>
                      <td>{formatTimestamp(record.packedAt)}</td>
                      <td>
                        <strong>{record.salableProductName}</strong>
                        <div className="small text-muted">{record.salableProductSku || ""}</div>
                      </td>
                      <td>{record.boxGrams ? `${record.boxGrams.toLocaleString()} gms` : "—"}</td>
                      <td>{record.quantityPacked}</td>
                      <td>{numberValue(record.totalGramsConsumed).toLocaleString()} gms</td>
                      <td>{(record.items ?? []).map((item) => `${item.productName} ${numberValue(item.totalGrams)} gms`).join(" + ")}</td>
                    </tr>
                  ))}
                  {!loading && !history.length && (
                    <tr>
                      <td colSpan={6} className="text-center text-muted py-4">No packaging history yet.</td>
                    </tr>
                  )}
                  {loading && (
                    <tr>
                      <td colSpan={6} className="text-center py-4"><span className="spinner-border spinner-border-sm me-2" />Loading...</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="card border-0 shadow-sm mt-4">
          <div className="card-header"><strong>Product Available</strong></div>
          <div className="card-body p-0">
            <div className="alert alert-light border-0 rounded-0 mb-0 small">
              <strong>Product Available = Actual Produced − Individual Packaging − Packaging in Combo.</strong>{" "}
              Actual Produced is the cumulative net usable grams recorded from harvested Growing Batches. This list is independent of the current packing worksheet and remains visible after completed packaging.
            </div>
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th className="text-end">Actual Produced</th>
                    <th className="text-end">Individual Packaging</th>
                    <th className="text-end">Packaging in Combo</th>
                    <th className="text-end">Product Available</th>
                  </tr>
                </thead>
                <tbody>
                  {productAvailableRows.map((row) => (
                    <tr key={row.productId}>
                      <td><strong>{row.productName}</strong></td>
                      <td className="text-end">{row.actualProduced.toLocaleString()} gms</td>
                      <td className="text-end">{row.individualPackaging.toLocaleString()} gms</td>
                      <td className="text-end">{row.comboPackaging.toLocaleString()} gms</td>
                      <td className={`text-end fw-semibold ${row.available < 0 ? "text-danger" : ""}`}>
                        {row.available.toLocaleString()} gms
                      </td>
                    </tr>
                  ))}
                  {!loading && !productAvailableRows.length && (
                    <tr>
                      <td colSpan={5} className="text-center text-muted py-4">No Production Products found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </AdminPage>
  );
}
