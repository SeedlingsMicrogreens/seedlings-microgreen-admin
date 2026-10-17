export const GROWING_BATCH_TIME_ZONE = "Asia/Kolkata";

export type GrowingBatchBusinessDate = {
  date: string;
  dateKey: string;
  displayDate: string;
};

export function growingBatchBusinessDate(now = new Date()): GrowingBatchBusinessDate {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: GROWING_BATCH_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value;
  const year = part("year");
  const month = part("month");
  const day = part("day");
  if (!year || !month || !day) throw new Error("Unable to determine the growing batch business date.");
  return { date: `${year}-${month}-${day}`, dateKey: `${year}${month}${day}`, displayDate: `${day}${month}${year}` };
}

export function growingBatchNumberForSequence(displayDate: string, sequence: number) {
  if (!/^\d{8}$/.test(displayDate) || !Number.isSafeInteger(sequence) || sequence < 1) {
    throw new Error("Invalid growing batch number components.");
  }
  return `B-${displayDate}-${String(sequence).padStart(3, "0")}`;
}

export function growingBatchSequence(batchNumber: unknown, displayDate: string): number | undefined {
  if (typeof batchNumber !== "string") return undefined;
  const match = new RegExp(`^B-${displayDate}-(\\d{3,})$`).exec(batchNumber);
  if (!match) return undefined;
  const sequence = Number(match[1]);
  return Number.isSafeInteger(sequence) && sequence > 0 ? sequence : undefined;
}

export function nextGrowingBatchSequence(currentSequence: unknown, existingMaximum: number) {
  const current = currentSequence == null ? 0 : Number(currentSequence);
  if (!Number.isSafeInteger(current) || current < 0 || !Number.isSafeInteger(existingMaximum) || existingMaximum < 0) {
    throw new Error("Invalid growing batch sequence state.");
  }
  return Math.max(current, existingMaximum) + 1;
}

export function growingBatchBusinessDayBounds(date: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error("Invalid growing batch business date.");
  const [, year, month, day] = match;
  const midnightUtc = Date.UTC(Number(year), Number(month) - 1, Number(day));
  const start = new Date(midnightUtc - 330 * 60 * 1000);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}
