// Calendar dates are "YYYY-MM-DD" strings with no time of day or time zone.
// Arithmetic runs on UTC midnight so the runtime's local zone (IST in production)
// can never shift the result; never round-trip them through local time + toISOString().

const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseCalendarDate(date: string) {
  const match = CALENDAR_DATE.exec(date);
  const parsed = match ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))) : undefined;
  if (!parsed || parsed.toISOString().slice(0, 10) !== date) throw new Error(`Invalid calendar date: ${date}`);
  return parsed;
}

/** The calendar date a Date falls on in the runtime's local time zone. */
export function localCalendarDate(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function addCalendarDays(date: string, days: number) {
  const parsed = parseCalendarDate(date);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

/** 0 = Sunday ... 6 = Saturday. */
export function calendarDayOfWeek(date: string) {
  return parseCalendarDate(date).getUTCDay();
}

/** The first date strictly after `date` that falls on `day`. */
export function nextCalendarDateOnDay(date: string, day: number) {
  const delta = (day - calendarDayOfWeek(date) + 7) % 7 || 7;
  return addCalendarDays(date, delta);
}
