import {
  SUBSCRIPTION_FREQUENCIES,
  subscriptionFrequencyLabel,
  type SubscriptionFrequency,
  type SubscriptionPlan,
} from "@/types/subscriptionPlan";
import type { SubscriptionOfferConfiguration } from "@/types/offer";

export type SubscriptionOfferInput = {
  frequencies: SubscriptionFrequency[];
  extraDeliveriesByFrequency: Partial<Record<SubscriptionFrequency, unknown>>;
};

export type SubscriptionOfferPreviewRow = {
  planId: string;
  planName: string;
  frequency: SubscriptionFrequency;
  regularDeliveries: number;
  extraDeliveries: number;
  totalDeliveries: number;
};

export function validateSubscriptionOffer(
  configuration: SubscriptionOfferInput | undefined,
): SubscriptionOfferConfiguration {
  if (!configuration || typeof configuration !== "object") {
    throw new Error("Subscription offer configuration is required.");
  }
  if (!Array.isArray(configuration.frequencies) || configuration.frequencies.length === 0) {
    throw new Error("Select at least one subscription frequency.");
  }
  if (!configuration.extraDeliveriesByFrequency ||
      typeof configuration.extraDeliveriesByFrequency !== "object" ||
      Array.isArray(configuration.extraDeliveriesByFrequency)) {
    throw new Error("Extra deliveries must be configured for each selected frequency.");
  }

  const selectedFrequencies = new Set<SubscriptionFrequency>();
  for (const frequency of configuration.frequencies) {
    if (!SUBSCRIPTION_FREQUENCIES.includes(frequency)) {
      throw new Error("Select only supported subscription frequencies.");
    }
    if (selectedFrequencies.has(frequency)) {
      throw new Error("Subscription frequencies must not be selected more than once.");
    }
    selectedFrequencies.add(frequency);
  }

  const configuredFrequencies = Object.keys(configuration.extraDeliveriesByFrequency);
  if (configuredFrequencies.length !== selectedFrequencies.size ||
      configuredFrequencies.some(frequency => !selectedFrequencies.has(frequency as SubscriptionFrequency))) {
    throw new Error("Extra deliveries must be configured only for selected frequencies.");
  }

  const extraDeliveriesByFrequency: Partial<Record<SubscriptionFrequency, number>> = {};
  for (const frequency of selectedFrequencies) {
    const value = configuration.extraDeliveriesByFrequency[frequency];
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
      throw new Error(`${subscriptionFrequencyLabel(frequency)} extra deliveries must be a positive whole number.`);
    }
    extraDeliveriesByFrequency[frequency] = value;
  }

  return {
    frequencies: [...selectedFrequencies],
    extraDeliveriesByFrequency,
  };
}

export function buildSubscriptionOfferFromForm(
  frequencies: SubscriptionFrequency[],
  extraDeliveryInputs: Partial<Record<SubscriptionFrequency, string>>,
): SubscriptionOfferConfiguration {
  const extraDeliveriesByFrequency: Partial<Record<SubscriptionFrequency, unknown>> = {};
  for (const frequency of frequencies) {
    const value = extraDeliveryInputs[frequency];
    extraDeliveriesByFrequency[frequency] = value === undefined || value.trim() === ""
      ? Number.NaN
      : Number(value);
  }
  return validateSubscriptionOffer({ frequencies, extraDeliveriesByFrequency });
}

export function previewSubscriptionOffer(
  plans: SubscriptionPlan[],
  configuration: SubscriptionOfferConfiguration,
): SubscriptionOfferPreviewRow[] {
  const selected = new Set(configuration.frequencies);
  return plans
    .filter(plan => plan.active !== false && selected.has(plan.frequency))
    .map(plan => {
      const regularDeliveries = Number(plan.deliveriesPerTerm);
      const extraDeliveries = configuration.extraDeliveriesByFrequency[plan.frequency];
      if (!Number.isSafeInteger(regularDeliveries) || regularDeliveries < 1) {
        throw new Error(`Subscription plan "${plan.name}" has an invalid deliveries-per-term value.`);
      }
      if (extraDeliveries === undefined) {
        throw new Error(`${subscriptionFrequencyLabel(plan.frequency)} extra deliveries are not configured.`);
      }
      const totalDeliveries = regularDeliveries + extraDeliveries;
      if (!Number.isSafeInteger(totalDeliveries)) {
        throw new Error(`Calculated deliveries for subscription plan "${plan.name}" are invalid.`);
      }
      return {
        planId: plan.id,
        planName: plan.name,
        frequency: plan.frequency,
        regularDeliveries,
        extraDeliveries,
        totalDeliveries,
      };
    });
}
