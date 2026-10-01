import { localDateInTimeZone, localDateTimeInputInTimeZone } from "@/lib/calendar/time";
import type { SocialData, SocialEvent } from "@/lib/social-groups/contracts";

export const socialResponses = [
  { value: "going", label: "Going" },
  { value: "maybe", label: "Maybe" },
  { value: "declined", label: "Cannot make it" },
] as const;
export type SocialResponse = (typeof socialResponses)[number]["value"];
export type SocialSave = (action: "event" | "cancel" | "rsvp" | "availability" | "settings", data: unknown) => Promise<boolean>;
export function canOrganiseSocial(data: Pick<SocialData, "role" | "canOrganise">) {
  return data.canOrganise && (data.role === "owner" || data.role === "admin");
}
export function canEditSocialEvent(data: Pick<SocialData, "role" | "canOrganise">, event: SocialEvent) {
  return data.role !== "viewer" && event.canEdit && !event.cancelled && (event.own || canOrganiseSocial(data));
}
export function canRespondToSocialEvent(data: Pick<SocialData, "role" | "canRespond">, event: SocialEvent, now = new Date()) {
  return data.role !== "viewer" && data.canRespond && !event.cancelled && new Date(event.end) > now;
}
export function socialEventIsFull(event: SocialEvent) {
  return event.capacity !== null && event.going >= event.capacity;
}
export function socialEventsOnDate(events: SocialEvent[], date: string, timezone: string, showCancelled = false) {
  return events.filter((event) => {
    if (event.cancelled && !showCancelled) return false;
    const first = localDateInTimeZone(timezone, new Date(event.start));
    const last = localDateInTimeZone(timezone, new Date(new Date(event.end).getTime() - 1));
    return first <= date && last >= date;
  }).sort((a, b) => a.start.localeCompare(b.start));
}
export function shiftSocialMonth(month: string, direction: number) {
  const date = new Date(`${month}-01T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + direction);
  return date.toISOString().slice(0, 7);
}
export function socialMonthDays(month: string) {
  const first = new Date(`${month}-01T12:00:00Z`);
  const start = new Date(first);
  start.setUTCDate(first.getUTCDate() - (first.getUTCDay() + 6) % 7);
  const next = new Date(first); next.setUTCMonth(next.getUTCMonth() + 1);
  const dayCount = Math.ceil(((next.getTime() - start.getTime()) / 86400000) / 7) * 7;
  return Array.from({ length: dayCount }, (_, index) => {
    const day = new Date(start); day.setUTCDate(start.getUTCDate() + index);
    return day.toISOString().slice(0, 10);
  });
}
export function socialDateLabel(date: string, long = false) {
  return new Intl.DateTimeFormat("en-NZ", { timeZone: "UTC", weekday: long ? "long" : "short", day: "numeric", month: "long" }).format(new Date(`${date}T12:00:00Z`));
}
export function socialTimestamp(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en-NZ", { timeZone: timezone, day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}
export function socialEventCardTime(event: Pick<SocialEvent, "start" | "end">, timezone: string) {
  const sameDay = localDateInTimeZone(timezone, new Date(event.start)) === localDateInTimeZone(timezone, new Date(event.end));
  if (!sameDay) return `${socialTimestamp(event.start, timezone)} to ${socialTimestamp(event.end, timezone)}`;
  const format = new Intl.DateTimeFormat("en-NZ", { timeZone: timezone, hour: "numeric", minute: "2-digit" });
  return `${format.format(new Date(event.start))} to ${format.format(new Date(event.end))}`;
}
export function socialEventCardLabel(event: SocialEvent, timezone: string) {
  return [event.title, event.cancelled ? "Cancelled" : socialResponses.find(response => response.value === event.myResponse)?.label,
    `${socialTimestamp(event.start, timezone)} to ${socialTimestamp(event.end, timezone)}`, event.location,
    `${event.going} going${event.capacity !== null ? `, ${event.capacity} places` : ""}`, "View event"].filter(Boolean).join(". ");
}
export function socialEventLocalFields(event: SocialEvent, timezone: string) {
  return { start: localDateTimeInputInTimeZone(timezone, event.start), end: localDateTimeInputInTimeZone(timezone, event.end) };
}
export function newSocialEventLocalFields(date: string, timezone: string, now = new Date()) {
  const localNow = localDateTimeInputInTimeZone(timezone, now);
  const today = localNow.slice(0, 10);
  const target = date < today ? today : date;
  let start = new Date(`${target}T18:00:00Z`);
  if (target === today && `${target}T18:00` <= localNow) {
    const wallNow = new Date(`${localNow}:00Z`);
    start = new Date(Math.ceil((wallNow.getTime() + 60000) / 1800000) * 1800000);
  }
  return { start: start.toISOString().slice(0, 16), end: new Date(start.getTime() + 3600000).toISOString().slice(0, 16) };
}

export function socialEventsByDay(events: SocialEvent[], days: string[], timezone: string, showCancelled = false) {
  const result = new Map(days.map((day) => [day, [] as SocialEvent[]]));
  for (const event of events) {
    if (event.cancelled && !showCancelled) continue;
    const first = localDateInTimeZone(timezone, new Date(event.start));
    const last = localDateInTimeZone(timezone, new Date(new Date(event.end).getTime() - 1));
    for (const day of days) if (day >= first && day <= last) result.get(day)!.push(event);
  }
  for (const eventsOnDay of result.values()) eventsOnDay.sort((a, b) => a.start.localeCompare(b.start));
  return result;
}
export function shiftSocialDate(date: string, amount: number) {
  const value = new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}
