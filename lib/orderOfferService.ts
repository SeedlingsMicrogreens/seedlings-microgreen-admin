import type { Customer } from "@/types/customer";
import type { Geolocation } from "@/types/geolocation";
import type { Offer } from "@/types/offer";
import type { SalesProduct, SalesProductSellingOption } from "@/types/salesProduct";

export type AppliedOrderOffers = {
  priceOffer?: Offer;
  deliveryOffer?: Offer;
  priceDiscount: number;
  deliveryDiscount: number;
};

export function activeSellingOptions(product: SalesProduct): SalesProductSellingOption[] {
  return (product.sellingOptions ?? []).filter(o => o.active && Number(o.weightGrams) > 0);
}

export function defaultSellingOption(product: SalesProduct): SalesProductSellingOption {
  const weight = product.components.reduce((sum, c) => sum + Number(c.quantityGrams || 0), 0);
  return { id: `${product.id}__default`, weightGrams: weight || 100, mrp: Number(product.mrp || product.sellingPrice), price: Number(product.sellingPrice), active: true };
}

export function sellingOptionsFor(product: SalesProduct): SalesProductSellingOption[] {
  const options = activeSellingOptions(product);
  return options.length ? options : [defaultSellingOption(product)];
}

function offerMatches(offer: Offer, customer: Customer, locations: Geolocation[], date: string) {
  if (!offer.active) return false;
  if (offer.startDate && date < offer.startDate) return false;
  if (offer.endDate && date > offer.endDate) return false;
  if (offer.locationType === "all") return true;
  const pincode = customer.addresses?.[0]?.pincode;
  const location = locations.find(x => x.pincode === pincode);
  return Boolean(pincode && offer.pincodeIds?.some(id => id === location?.id || id === pincode));
}

export function calculateOrderOffers(args: {
  customer?: Customer;
  locations: Geolocation[];
  offers: Offer[];
  subtotal: number;
  deliveryFee: number;
  date: string;
}): AppliedOrderOffers {
  if (!args.customer) return { priceDiscount: 0, deliveryDiscount: 0 };
  const matching = args.offers.filter(o => offerMatches(o, args.customer!, args.locations, args.date));
  const priceOffer = matching.find(o => o.type === "price");
  const deliveryOffer = matching.find(o => o.type === "deliveryCharge");

  const discount = (offer: Offer | undefined, amount: number) => {
    if (!offer) return 0;
    const value = Number(offer.discountValue || 0);
    if (offer.discountType === "percentage") return Math.min(amount, amount * value / 100);
    return Math.min(amount, value);
  };

  return {
    priceOffer,
    deliveryOffer,
    priceDiscount: discount(priceOffer, args.subtotal),
    deliveryDiscount: discount(deliveryOffer, args.deliveryFee),
  };
}
