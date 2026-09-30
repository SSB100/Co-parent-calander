import { localDateTimePartsInTimeZone } from "@/lib/calendar/time";
import { salonDateSchema, type SalonSlot } from "./contracts";

export type SlotRules = { leadMinutes: number; advanceDays: number; slotMinutes: number };
export type SlotService = { durationMinutes: number; bufferBeforeMinutes: number; bufferAfterMinutes: number };
export type SlotHours = { weekday: number; startMinute: number; endMinute: number };
export type SlotBusy = { start: string; end: string };
export type SlotProvider = { id: string; hours: SlotHours[]; busy: SlotBusy[] };
type LocalMinute = { instant: number; minute: number; weekday: number; date: string };
const minuteMs = 60000;

/** Enumerate actual instants, so spring gaps disappear and autumn folds remain distinct. */
export function salonDayTimeline(timezone: string, date: string): LocalMinute[] {
  salonDateSchema.parse(date);
  // Every IANA offset is within this three-day UTC window, including date-line changes.
  const noon = Date.parse(`${date}T12:00:00Z`);
  const timeline: LocalMinute[] = [];
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  for (let at = noon - 36 * 60 * minuteMs; at < noon + 36 * 60 * minuteMs; at += minuteMs) {
    const parts = formatter.formatToParts(at);
    const part = (name: Intl.DateTimeFormatPartTypes) => parts.find(value => value.type === name)!.value;
    const localDate = `${part("year")}-${part("month")}-${part("day")}`;
    if (localDate !== date) continue;
    timeline.push({ instant: at, minute: Number(part("hour")) * 60 + Number(part("minute")), weekday: new Date(`${date}T12:00:00Z`).getUTCDay(), date });
  }
  return timeline;
}

export function salonDayBounds(timezone: string, date: string) {
  const timeline = salonDayTimeline(timezone, date);
  if (!timeline.length) throw new RangeError("That date does not exist in this business’s timezone.");
  return { start: new Date(timeline[0].instant).toISOString(), end: new Date(timeline[timeline.length - 1].instant + minuteMs).toISOString() };
}

/** Busy ranges are complete for the selected day, never sourced from a capped upcoming list. */
export function generateSalonSlots(input: { timezone: string; date: string; rules: SlotRules; service: SlotService; providers: SlotProvider[]; now?: Date }): SalonSlot[] {
  const { timezone, date, rules, service, providers } = input;
  const now = (input.now ?? new Date()).getTime();
  const earliest = now + rules.leadMinutes * minuteMs;
  const latest = now + rules.advanceDays * 86400000;
  const timeline = salonDayTimeline(timezone, date);
  const result: SalonSlot[] = [];
  for (const provider of providers) {
    // Build continuous actual-time windows. A clock fold can briefly leave a local hours
    // interval; checking only the visit endpoints would incorrectly bridge that closure.
    const openRanges: { start: number; end: number }[] = [];
    for (const minute of timeline) {
      if (!provider.hours.some(hours => hours.weekday === minute.weekday && minute.minute >= hours.startMinute && minute.minute < hours.endMinute)) continue;
      const last = openRanges[openRanges.length - 1];
      if (last && last.end === minute.instant) last.end += minuteMs;
      else openRanges.push({ start: minute.instant, end: minute.instant + minuteMs });
    }
    const busy = provider.busy.map(range => ({ start: Date.parse(range.start), end: Date.parse(range.end) }));
    for (const minute of timeline) {
      if (minute.minute % rules.slotMinutes !== 0 || minute.instant < earliest || minute.instant > latest) continue;
      const start = minute.instant;
      const end = start + service.durationMinutes * minuteMs;
      const busyStart = start - service.bufferBeforeMinutes * minuteMs;
      const busyEnd = end + service.bufferAfterMinutes * minuteMs;
      if (!openRanges.some(range => busyStart >= range.start && busyEnd <= range.end)) continue;
      if (busy.some(range => busyStart < range.end && range.start < busyEnd)) continue;
      result.push({ practitionerId: provider.id, start: new Date(start).toISOString(), end: new Date(end).toISOString() });
    }
  }
  return result.sort((a, b) => a.start.localeCompare(b.start) || a.practitionerId.localeCompare(b.practitionerId));
}

/** Handy for consumers formatting supplied ISO slot instants in the business timezone. */
export function salonSlotLocalLabel(timezone: string, instant: string) {
  const value = localDateTimePartsInTimeZone(timezone, new Date(instant));
  return `${value.date}T${value.time.slice(0, 5)}`;
}
