import { salonDayTimeline } from "@/lib/salon/slots";
import { localDateInTimeZone } from "@/lib/calendar/time";
export const salonDateLabel = (date: string, month = false) =>
  new Intl.DateTimeFormat("en-NZ", {
    timeZone: "UTC",
    month: "long",
    ...(month
      ? { year: "numeric" as const }
      : { weekday: "short" as const, day: "numeric" as const }),
  }).format(new Date(`${date}T12:00:00Z`));
export function shiftSalonDate(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
export function shiftSalonMonth(date: string, amount: number) {
  const value = new Date(`${date.slice(0, 7)}-01T12:00:00Z`);
  value.setUTCMonth(value.getUTCMonth() + amount);
  return value.toISOString().slice(0, 10);
}
export function salonDays(date: string) {
  const first = `${date.slice(0, 7)}-01`,
    day = new Date(`${first}T12:00:00Z`).getUTCDay(),
    last = new Date(`${first}T12:00:00Z`);
  last.setUTCMonth(last.getUTCMonth() + 1);
  last.setUTCDate(0);
  const before = (day + 6) % 7;
  return Array.from(
    { length: Math.ceil((last.getUTCDate() + before) / 7) * 7 },
    (_, i) => shiftSalonDate(first, i - before),
  );
}
export const salonTime = (instant: string, timezone: string, date = false) =>
  new Intl.DateTimeFormat("en-NZ", {
    timeZone: timezone,
    ...(date ? { day: "numeric" as const, month: "short" as const } : {}),
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "shortOffset",
  }).format(new Date(instant));
export function salonPrice(price: number | null, currency: string) {
  if (price === null) return "Price on enquiry";
  try {
    return new Intl.NumberFormat("en-NZ", {
      style: "currency",
      currency,
    }).format(price / 100);
  } catch {
    return `${(price / 100).toFixed(2)} ${currency}`;
  }
}
export const salonToday = (timezone: string) => localDateInTimeZone(timezone);
export function minuteText(minute: number) {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}
export function textMinute(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

export function salonTimeBlockInstant(
  date: string,
  time: string,
  timezone: string,
) {
  const minute = textMinute(time),
    matches = salonDayTimeline(timezone, date).filter(
      (item) => item.minute === minute,
    );
  if (matches.length !== 1)
    throw new Error(
      "This time repeats or does not exist when clocks change. Choose another time, or block the whole day.",
    );
  return new Date(matches[0].instant).toISOString();
}
