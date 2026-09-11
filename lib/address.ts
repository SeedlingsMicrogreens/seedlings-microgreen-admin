import type { CustomerAddress } from "@/types/customer";
import type { OrderAddress } from "@/types/order";

export type DisplayAddress = CustomerAddress | OrderAddress | string;

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Formats saved customer addresses for admin UI without exposing internal
 * Firestore document IDs or dumping the raw object.
 */
export function formatAddress(address?: DisplayAddress | null): string {
  if (!address) return "—";
  if (typeof address === "string") return address.trim() || "—";

  const parts: string[] = [];
  const name = clean(address.name);
  const line1 = clean(address.addressLine1);
  const line2 = clean(address.addressLine2);
  const landmark = clean(address.landmark);
  const city = clean(address.city);
  const state = clean(address.state);
  const pincode = clean(address.pincode);

  if (name) parts.push(name);
  if (line1) parts.push(line1);
  if (line2 && line2.toLowerCase() !== line1.toLowerCase()) parts.push(line2);
  if (landmark) parts.push(`Near ${landmark}`);

  const locality = [city, state].filter(Boolean).join(", ");
  if (locality && pincode) parts.push(`${locality} - ${pincode}`);
  else if (locality) parts.push(locality);
  else if (pincode) parts.push(pincode);

  return parts.join(", ") || "—";
}

export function formatAddressLines(address?: DisplayAddress | null): string[] {
  if (!address) return [];
  if (typeof address === "string") return address.trim() ? [address.trim()] : [];

  const lines: string[] = [];
  const name = clean(address.name);
  const line1 = clean(address.addressLine1);
  const line2 = clean(address.addressLine2);
  const landmark = clean(address.landmark);
  const city = clean(address.city);
  const state = clean(address.state);
  const pincode = clean(address.pincode);
  const mobile = clean(address.mobileNumber);

  if (name) lines.push(name);
  if (line1) lines.push(line1);
  if (line2 && line2.toLowerCase() !== line1.toLowerCase()) lines.push(line2);
  if (landmark) lines.push(`Near ${landmark}`);

  const locality = [city, state].filter(Boolean).join(", ");
  if (locality || pincode) lines.push([locality, pincode].filter(Boolean).join(" - "));
  if (mobile) lines.push(`Mobile: ${mobile}`);
  return lines;
}
