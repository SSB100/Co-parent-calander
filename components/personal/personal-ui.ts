import { localDateInTimeZone } from "@/lib/calendar/time";
import type { PersonalData, PersonalItem, PersonalSource } from "@/lib/personal/contracts";

export type PersonalQuery = { month: string; timezone: string; source: string };
export const personalFirstMonth = "1900-01";
export const personalLastMonth = "2099-12";

export function isPersonalMonth(month: string) {
  return /^(19|20)\d{2}-(0[1-9]|1[0-2])$/.test(month);
}

export function personalQueryKey(query: PersonalQuery) {
  return new URLSearchParams({ month: query.month, timezone: query.timezone, ...(query.source ? { source: query.source } : {}) }).toString();
}

export function shiftPersonalDate(date: string, days: number) {
  const result = new Date(`${date}T12:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

export function shiftPersonalMonth(month: string, months: number) {
  const result = new Date(`${month}-01T12:00:00Z`);
  result.setUTCMonth(result.getUTCMonth() + months);
  return result.toISOString().slice(0, 7);
}

export function personalMonthDays(month: string) {
  const first = new Date(`${month}-01T12:00:00Z`);
  const start = shiftPersonalDate(`${month}-01`, -(first.getUTCDay() + 6) % 7);
  const next = `${shiftPersonalMonth(month, 1)}-01`;
  const weeks = Math.ceil((Date.parse(`${next}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 604800000);
  return Array.from({ length: weeks * 7 }, (_, index) => shiftPersonalDate(start, index));
}

export function personalDateLabel(date: string, full = false) {
  return new Intl.DateTimeFormat("en-NZ", { timeZone: "UTC", weekday: full ? "long" : "short", day: "numeric", month: "long", ...(full ? { year: "numeric" } : {}) }).format(new Date(`${date}T12:00:00Z`));
}

export function personalMonthLabel(month: string) {
  return new Intl.DateTimeFormat("en-NZ", { timeZone: "UTC", month: "long", year: "numeric" }).format(new Date(`${month}-01T12:00:00Z`));
}

export function personalItemDates(item: PersonalItem, timezone: string) {
  if (!item.start) return { first: item.date, last: item.endDate };
  const start = new Date(item.start);
  const end = item.end ? new Date(item.end) : start;
  return {
    first: localDateInTimeZone(timezone, start),
    last: localDateInTimeZone(timezone, new Date(Math.max(start.getTime(), end.getTime() - 1))),
  };
}

export function personalItemsByDay(items: PersonalItem[], days: string[], timezone: string) {
  const result = new Map(days.map((day) => [day, [] as PersonalItem[]]));
  for (const item of items) {
    if (item.state === "attention") continue;
    const { first, last } = personalItemDates(item, timezone);
    for (const day of days) if (first <= day && last >= day) result.get(day)!.push(item);
  }
  for (const items of result.values()) items.sort((a, b) => (a.start ?? `${a.date}T00:00:00Z`).localeCompare(b.start ?? `${b.date}T00:00:00Z`) || a.title.localeCompare(b.title));
  return result;
}

/** An overview of the loaded month only. Care stays in Today and the full calendar. */
export function personalOverview(data: PersonalData) {
  const scoped = scopePersonalData(data, "");
  const first = `${data.month}-01`;
  const next = `${shiftPersonalMonth(data.month, 1)}-01`;
  const todayItems = data.today.startsWith(data.month)
    ? personalItemsByDay(scoped.items, [data.today], data.timezone).get(data.today)!
    : null;
  const todayIds = new Set(todayItems?.map((item) => item.id));
  const upcoming = scoped.items.filter((item) => {
    if (data.today >= next || item.state === "background" || todayIds.has(item.id)) return false;
    const dates = personalItemDates(item, data.timezone);
    return dates.last >= first && dates.first < next && dates.last > data.today;
  }).sort((a, b) => {
    const aDate = personalItemDates(a, data.timezone).first;
    const bDate = personalItemDates(b, data.timezone).first;
    return aDate.localeCompare(bDate) || (a.start ?? "").localeCompare(b.start ?? "") || a.title.localeCompare(b.title);
  });
  return { todayItems, upcoming };
}

export function personalItemTime(item: PersonalItem, timezone: string) {
  if (!item.start) {
    const date = item.date === item.endDate ? personalDateLabel(item.date) : `${personalDateLabel(item.date)} – ${personalDateLabel(item.endDate)}`;
    return `${date} · ${item.timezone} (calendar date)`;
  }
  const format = (instant: string) => new Intl.DateTimeFormat("en-NZ", { timeZone: timezone, day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(instant));
  return `${format(item.start)}${item.end ? ` – ${format(item.end)}` : ""} · ${timezone}`;
}

export function personalTimezoneOptions(current: string, sources: PersonalSource[], browser: string) {
  return Array.from(new Set([current, ...sources.map((source) => source.timezone), browser, "UTC"].filter(Boolean)));
}

/** Defensive presentation scoping; current membership is always checked by the API. */
export function scopePersonalData(data: PersonalData, source: string): PersonalData {
  const permitted = new Set(data.sources.map((entry) => entry.id));
  const inScope = (item: PersonalItem) => permitted.has(item.calendarId) && (!source || item.calendarId === source);
  return { ...data, items: data.items.filter((item) => item.state !== "attention" && inScope(item)), attention: data.attention.filter((item) => item.state === "attention" && inScope(item)) };
}
