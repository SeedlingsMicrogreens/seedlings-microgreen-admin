export function normalizeIndianMobileNumber(value: string): string {
  const compact = value.trim().replace(/[()\s.-]/g, "");
  const match = /^(?:\+91|91|0)?([6-9]\d{9})$/.exec(compact);
  if (!match) throw new Error("Enter a valid Indian mobile number with 10 digits, optionally prefixed by +91.");
  return `+91${match[1]}`;
}

export function tryNormalizeIndianMobileNumber(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    return normalizeIndianMobileNumber(value);
  } catch {
    return undefined;
  }
}
