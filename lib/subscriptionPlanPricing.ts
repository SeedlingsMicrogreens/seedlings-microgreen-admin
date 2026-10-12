import type { SalesProductSellingOption } from "../types/salesProduct";
import type { SubscriptionPlanSellingOption } from "../types/subscriptionPlan";
import { validateRequired100gSellingOption } from "./salesProductOptions";

export function isValidSubscriptionPlanPrice(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function calculateSubscriptionPlanPrice(
  deliveriesPerTerm: number,
  productSellingPrice: number,
): number {
  if (!Number.isInteger(deliveriesPerTerm) || deliveriesPerTerm < 1) {
    throw new Error("Deliveries per term must be a positive whole number.");
  }
  if (!Number.isFinite(productSellingPrice) || productSellingPrice <= 0) {
    throw new Error("Product selling price must be greater than zero to calculate the subscription plan price.");
  }

  const price = Number((deliveriesPerTerm * productSellingPrice).toFixed(2));
  if (!Number.isFinite(price) || price < 0) {
    throw new Error("Calculated subscription plan price is invalid.");
  }
  return price;
}

function legacyMaximumPlanPrice(option: SubscriptionPlanSellingOption): number | undefined {
  const legacyOption = option as SubscriptionPlanSellingOption & {
    minimumPlanPrice?: number;
    referencePlanPrice?: number;
  };
  return legacyOption.referencePlanPrice ?? legacyOption.minimumPlanPrice;
}

export function normalizeSubscriptionPlanSellingOption(
  option: SubscriptionPlanSellingOption,
): SubscriptionPlanSellingOption {
  const maximumPlanPrice = option.maximumPlanPrice ?? legacyMaximumPlanPrice(option);
  return {
    id: option.id,
    weightGrams: option.weightGrams,
    ...(option.planPrice === undefined ? {} : { planPrice: option.planPrice }),
    ...(maximumPlanPrice === undefined ? {} : { maximumPlanPrice }),
  };
}

export function normalizeSubscriptionPlanSellingOptions(
  options: SubscriptionPlanSellingOption[] = [],
): SubscriptionPlanSellingOption[] {
  return options.map(normalizeSubscriptionPlanSellingOption);
}

export function current100gSellingPrice(productOptions: SalesProductSellingOption[]): number {
  const option = validateRequired100gSellingOption(productOptions);
  return Number(option.price);
}

export function buildSubscriptionPlanSellingOptions(
  productOptions: SalesProductSellingOption[],
  deliveriesPerTerm: number,
  submittedOptions: SubscriptionPlanSellingOption[] = [],
  savedOptions: SubscriptionPlanSellingOption[] = [],
  recalculateMissingPriceOptionIds: string[] = [],
): SubscriptionPlanSellingOption[] {
  const submittedById = new Map<string, SubscriptionPlanSellingOption>();
  const submittedWeights = new Set<number>();
  for (const option of submittedOptions) {
    if (!option.id || submittedById.has(option.id) || submittedWeights.has(Number(option.weightGrams))) {
      throw new Error("Subscription plan selling options must not contain duplicates.");
    }
    submittedById.set(option.id, option);
    submittedWeights.add(Number(option.weightGrams));
  }

  const savedById = new Map<string, SubscriptionPlanSellingOption>();
  const savedWeights = new Set<number>();
  for (const option of savedOptions) {
    if (savedById.has(option.id) || savedWeights.has(Number(option.weightGrams))) {
      throw new Error("Saved subscription plan selling options contain duplicates.");
    }
    savedById.set(option.id, option);
    savedWeights.add(Number(option.weightGrams));
  }
  const usableProductOptions = productOptions.filter(option =>
    option.active !== false && Number.isFinite(option.weightGrams) && option.weightGrams > 0
  );
  const productIds = new Set<string>();
  const productWeights = new Set<number>();
  for (const option of usableProductOptions) {
    if (!option.id || productIds.has(option.id) || productWeights.has(Number(option.weightGrams))) {
      throw new Error("Product selling options must not contain duplicate IDs or packaging sizes.");
    }
    productIds.add(option.id);
    productWeights.add(Number(option.weightGrams));
  }
  const availableIds = new Set(usableProductOptions.map(option => option.id));
  for (const option of submittedOptions) {
    if (!availableIds.has(option.id)) {
      throw new Error("A subscription selling option is not available on the selected Product.");
    }
  }

  return usableProductOptions.map(productOption => {
    const submitted = submittedById.get(productOption.id);
    const weightGrams = Number(productOption.weightGrams);
    const saved = savedById.get(productOption.id) ??
      savedOptions.find(option => Number(option.weightGrams) === weightGrams);

    for (const candidate of [submitted, saved]) {
      if (candidate && Number(candidate.weightGrams) !== weightGrams) {
        throw new Error("Subscription selling option packaging does not match the selected Product.");
      }
    }

    const maximumPlanPrice = calculateSubscriptionPlanPrice(deliveriesPerTerm, Number(productOption.price));
    let planPrice: number;
    if (recalculateMissingPriceOptionIds.includes(productOption.id) &&
        saved && saved.planPrice !== undefined && saved.planPrice !== null) {
      if (!isValidSubscriptionPlanPrice(saved.planPrice)) {
        throw new Error("Saved subscription plan price must be a valid non-negative number.");
      }
      planPrice = saved.planPrice;
    } else if (recalculateMissingPriceOptionIds.includes(productOption.id)) {
      planPrice = maximumPlanPrice;
    } else if (submitted && submitted.planPrice !== undefined && submitted.planPrice !== null) {
      if (!isValidSubscriptionPlanPrice(submitted.planPrice)) {
        throw new Error("Subscription plan price must be a valid non-negative number.");
      }
      planPrice = submitted.planPrice;
    } else if (saved && isValidSubscriptionPlanPrice(saved.planPrice)) {
      planPrice = saved.planPrice;
    } else if (saved && saved.planPrice !== undefined && saved.planPrice !== null) {
      if (!isValidSubscriptionPlanPrice(saved.planPrice)) {
        throw new Error("Saved subscription plan price must be a valid non-negative number.");
      }
      planPrice = saved.planPrice;
    } else {
      planPrice = maximumPlanPrice;
    }

    return { id: productOption.id, weightGrams, planPrice, maximumPlanPrice };
  });
}
