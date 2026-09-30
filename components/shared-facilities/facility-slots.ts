import { localDateInTimeZone, localDateTimeInputInTimeZone } from "@/lib/calendar/time";
import type { FacilityData, FacilityRules } from "@/lib/shared-facilities/contracts";
import { minuteInput, shiftFacilityDate } from "./facilities-ui";

export type FacilitySelection = { calendarId: string; date: string; resourceId: string };
export type FacilitySlot = FacilitySelection & { start: string; end: string; startInstant: string; endInstant: string; duration: number; available: boolean };
export type FacilitySlotPlan = { slots: FacilitySlot[]; message: string; dstOmitted: boolean };
const minuteMs = 60_000;
const localDayCache = new Map<string, Map<string, number[]>>();

/** Enumerate real minutes, so gaps have no match and clock folds have two.
 * Only timezone/date structure is cached. Occupancy and permission are never cached.
 */
function localDayInstants(date: string, timezone: string) {
  const key = `${timezone}:${date}`;
  const cached = localDayCache.get(key);
  if (cached) return cached;
  const start = Date.parse(`${date}T00:00:00Z`);
  const next = shiftFacilityDate(date, 1);
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const index = new Map<string, number[]>();
  // This covers every current IANA offset, including skipped or repeated local days.
  for (let instant = start - 24 * 60 * minuteMs; instant <= start + 48 * 60 * minuteMs; instant += minuteMs) {
    const parts = formatter.formatToParts(instant);
    const part = (name: Intl.DateTimeFormatPartTypes) => parts.find((value) => value.type === name)!.value;
    const local = `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
    if (!local.startsWith(`${date}T`) && local !== `${next}T00:00`) continue;
    const matches = index.get(local) ?? []; matches.push(instant); index.set(local, matches);
  }
  if (localDayCache.size >= 12) localDayCache.delete(localDayCache.keys().next().value!);
  localDayCache.set(key, index);
  return index;
}

export function facilityMonthDays(month: string) {
  const first = `${month}-01`;
  const offset = (new Date(`${first}T12:00:00Z`).getUTCDay() + 6) % 7;
  const last = new Date(`${first}T12:00:00Z`); last.setUTCMonth(last.getUTCMonth() + 1); last.setUTCDate(0);
  return Array.from({ length: Math.ceil((offset + last.getUTCDate()) / 7) * 7 }, (_, index) => shiftFacilityDate(first, index - offset));
}
export function shiftFacilityMonth(month: string, amount: number) {
  const value = new Date(`${month}-01T12:00:00Z`); value.setUTCMonth(value.getUTCMonth() + amount); return value.toISOString().slice(0, 7);
}
export function facilityDateLabel(date: string, monthOnly = false) {
  return new Intl.DateTimeFormat("en-NZ", { timeZone: "UTC", month: "long", ...(monthOnly ? { year: "numeric" as const } : { weekday: "long" as const, day: "numeric" as const }) }).format(new Date(`${date}T12:00:00Z`));
}
export function facilityDurationOptions(rules: FacilityRules) {
  return [...new Set([rules.minDuration, 15, 30, 45, 60, 90, 120, 180, 240, 360, 480, 720, 1440, rules.maxDuration])].filter((duration) => duration >= rules.minDuration && duration <= rules.maxDuration && duration <= rules.closeMinute - rules.openMinute).sort((a, b) => a - b);
}
export function facilitySelectionReady(data: FacilityData, selection: FacilitySelection) {
  return data.calendarId === selection.calendarId && data.date === selection.date && data.resources.some((resource) => resource.id === selection.resourceId && resource.active);
}
function localMinute(date: string, minute: number) { return minute === 1440 ? `${shiftFacilityDate(date, 1)}T00:00` : `${date}T${minuteInput(minute)}`; }

export function facilitySlotPlan(data: FacilityData, selection: FacilitySelection, duration: number, now = new Date()): FacilitySlotPlan {
  const empty = (message: string): FacilitySlotPlan => ({ slots: [], message, dstOmitted: false });
  if (!selection.resourceId) return empty("Choose a resource to see its times.");
  if (!facilitySelectionReady(data, selection)) return empty("Waiting for this day’s latest schedule.");
  const { rules, timezone } = data;
  if (!rules.openDays.includes(new Date(`${selection.date}T12:00:00Z`).getUTCDay())) return empty("Closed for bookings on this day. Choose another day.");
  if (!Number.isInteger(duration) || duration < rules.minDuration || duration > rules.maxDuration || duration > rules.closeMinute - rules.openMinute) return empty("Choose a duration within the booking rules.");
  const today = localDateInTimeZone(timezone, now);
  if (selection.date < today) return empty("Choose today or a future day to book.");
  if (selection.date > shiftFacilityDate(today, rules.advanceDays)) return empty(`Bookings open up to ${rules.advanceDays} days ahead. Choose an earlier day.`);
  const occupancy = data.bookings.filter((booking) => booking.resourceId === selection.resourceId && booking.status === "confirmed");
  const starts = new Set<number>();
  for (let minute = rules.openMinute; minute + duration <= rules.closeMinute; minute += 15) starts.add(minute);
  starts.add(rules.closeMinute - duration);
  // Include exact gap boundaries, rather than hiding a short gap off the usual grid.
  for (const booking of occupancy) {
    for (const [value, adjustment] of [[booking.end, 0], [booking.start, -duration]] as const) {
      const local = localDateTimeInputInTimeZone(timezone, value);
      if (local.startsWith(selection.date)) starts.add(Number(local.slice(11, 13)) * 60 + Number(local.slice(14, 16)) + adjustment);
    }
  }
  const earliest = now.getTime() + rules.minNoticeHours * 60 * minuteMs;
  const earliestLocal = localDateTimeInputInTimeZone(timezone, new Date(Math.ceil(earliest / minuteMs) * minuteMs));
  if (earliestLocal.startsWith(selection.date)) starts.add(Number(earliestLocal.slice(11, 13)) * 60 + Number(earliestLocal.slice(14, 16)));
  const index = localDayInstants(selection.date, timezone);
  const slots: FacilitySlot[] = [];
  let dstOmitted = false;
  for (const startMinute of [...starts].sort((a, b) => a - b)) {
    if (startMinute < rules.openMinute || startMinute + duration > rules.closeMinute) continue;
    const start = localMinute(selection.date, startMinute), end = localMinute(selection.date, startMinute + duration);
    const startMatches = index.get(start), endMatches = index.get(end);
    let safe = startMatches?.length === 1 && endMatches?.length === 1 && endMatches[0] - startMatches[0] === duration * minuteMs;
    for (let minute = startMinute; safe && minute <= startMinute + duration; minute += 1) safe = index.get(localMinute(selection.date, minute))?.length === 1;
    if (!safe) { dstOmitted = true; continue; }
    const startAt = startMatches![0], endAt = endMatches![0];
    if (startAt < earliest) continue;
    const available = !occupancy.some((booking) => Date.parse(booking.start) < endAt && startAt < Date.parse(booking.end));
    slots.push({ ...selection, start, end, startInstant: new Date(startAt).toISOString(), endInstant: new Date(endAt).toISOString(), duration, available });
  }
  return { slots, dstOmitted, message: slots.some((slot) => slot.available) ? "" : "No available start times for this duration. Try another day or a shorter booking." };
}

/** Re-check immutable intent immediately before opening or submitting a confirmation. */
export function facilitySlotProblem(data: FacilityData, selection: FacilitySelection, slot: FacilitySlot, now = new Date()) {
  if (!data.canBook || data.role === "viewer") return "You have view-only access to this calendar.";
  if (slot.calendarId !== selection.calendarId || slot.date !== selection.date || slot.resourceId !== selection.resourceId || !facilitySelectionReady(data, selection)) return "The selected day or resource changed. Choose a time from the latest schedule.";
  const match = facilitySlotPlan(data, selection, slot.duration, now).slots.find((candidate) => candidate.start === slot.start && candidate.end === slot.end && candidate.startInstant === slot.startInstant && candidate.endInstant === slot.endInstant);
  if (!match?.available) return "This time is no longer available. Refresh the times and choose another slot.";
  const activeCount = data.bookings.filter((booking) => booking.own && (booking.status === "confirmed" || booking.status === "pending") && Date.parse(booking.end) > now.getTime()).length;
  if (activeCount >= data.rules.maxActiveBookings) return "You have reached the active booking limit. Manage your bookings before adding another.";
  return "";
}

/** A confirmation keeps one submission identity through retries and blocks same-tick clicks. */
export function createFacilitySlotSubmission(requestId: string) {
  let pending = false;
  return { async run(save: (requestId: string) => Promise<boolean>) {
    if (pending) return false;
    pending = true;
    try { return await save(requestId); } finally { pending = false; }
  } };
}
