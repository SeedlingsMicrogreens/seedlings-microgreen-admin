import type { SalesProductSellingOption } from "@/types/salesProduct";

export const REQUIRED_100G_OPTION_ERROR =
  "A 100gms salable option is required. Please add or complete this option before saving.";

export function createDefault100gSellingOption(
  id: string,
  mrp = 0,
  price = 0,
): SalesProductSellingOption {
  return { id, weightGrams: 100, mrp, price, active: true };
}

export function ensureDefault100gSellingOption(
  options: SalesProductSellingOption[] | undefined,
  defaultOption: SalesProductSellingOption,
) {
  const existing = (options ?? []).map(option => ({ ...option }));
  return existing.some(option => Number(option.weightGrams) === 100)
    ? existing
    : [...existing, defaultOption];
}

export function validateRequired100gSellingOption(options: SalesProductSellingOption[] | undefined) {
  if (!Array.isArray(options)) throw new Error(REQUIRED_100G_OPTION_ERROR);
  const option = options.find(item => item && Number(item.weightGrams) === 100);
  const mrp = Number(option?.mrp);
  const price = Number(option?.price);
  if (
    !option ||
    typeof option.id !== "string" ||
    !option.id.trim() ||
    !Number.isFinite(mrp) ||
    mrp <= 0 ||
    !Number.isFinite(price) ||
    price <= 0 ||
    price > mrp
  ) {
    throw new Error(REQUIRED_100G_OPTION_ERROR);
  }
  return option;
}

export function validateSingleComponentShare(
  type: "single" | "multiple",
  components: Array<{ quantityGrams?: number; percentage?: number }>,
) {
  if (
    type === "single" &&
    (components.length !== 1 ||
      Number(components[0].quantityGrams) !== 100 ||
      Number(components[0].percentage) !== 100)
  ) {
    throw new Error("A Single Product must use exactly one Microgreen at 100%.");
  }
}
