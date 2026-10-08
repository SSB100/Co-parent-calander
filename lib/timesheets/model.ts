import {
  MAX_TIMESHEETS_DURATION_MINUTES, timesheetsDateSchema, timesheetsIncrementSchema,
  timesheetsLocalTimeSchema, timesheetsTimezoneSchema, timesheetsViewSchema,
  type TimesheetsDisambiguation, type TimesheetsEntry, type TimesheetsIncrement,
  type TimesheetsTotal, type TimesheetsView,
} from "./contracts";

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const formatters = new Map<string, Intl.DateTimeFormat>();
const dateFormatters = new Map<string, Intl.DateTimeFormat>();
const offsetsByDate = new Map<string, readonly number[]>();
const dayStarts = new Map<string, number>();

function remember<T>(cache: Map<string, T>, key: string, value: T, limit = 1024) {
  if (cache.size >= limit) cache.delete(cache.keys().next().value!);
  cache.set(key, value);
  return value;
}

function formatter(timezone: string) {
  const existing = formatters.get(timezone);
  if (existing) return existing;
  const valid = timesheetsTimezoneSchema.parse(timezone);
  return remember(formatters, timezone, new Intl.DateTimeFormat("en-GB", {
    timeZone: valid, calendar: "iso8601", numberingSystem: "latn",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }), 64);
}

function localParts(milliseconds: number, timezone: string) {
  const parts = formatter(timezone).formatToParts(milliseconds);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)!.value;
  return `${get("year").padStart(4, "0")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}`;
}

function instantMilliseconds(value: string | Date) {
  if (typeof value === "string" && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    throw new RangeError("Use an exact time with a timezone offset.");
  }
  if (typeof value === "string") timesheetsDateSchema.parse(value.slice(0, 10));
  const milliseconds = value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(milliseconds)) throw new RangeError("Choose a valid date and time.");
  return milliseconds;
}

export function timesheetsLocalTime(instant: string | Date, timezone: string) {
  return localParts(instantMilliseconds(instant), timezone).slice(0, 16);
}

function offsetsForDate(date: string, timezone: string) {
  const key = `${timezone}:${date}`;
  const cached = offsetsByDate.get(key);
  if (cached) return cached;
  const center = Date.parse(`${date}T12:00:00Z`);
  const offsets = new Set<number>();
  // Sample both sides of even date-line changes, not just the offset at the guessed instant.
  // IANA transitions are much farther apart than this six-hour sampling interval.
  for (let hours = -48; hours <= 48; hours += 6) {
    const instant = center + hours * 60 * MINUTE;
    offsets.add(Date.parse(`${localParts(instant, timezone)}Z`) - instant);
  }
  return remember(offsetsByDate, key, [...offsets]);
}

function localCandidates(local: string, timezone: string) {
  const target = Date.parse(`${local}:00Z`);
  return [...new Set(offsetsForDate(local.slice(0, 10), timezone).map(offset => target - offset))]
    .filter(candidate => localParts(candidate, timezone) === `${local}:00`)
    .sort((a, b) => a - b);
}

export function resolveTimesheetsLocalTime(local: string, timezone: string, disambiguation?: TimesheetsDisambiguation) {
  timesheetsLocalTimeSchema.parse(local);
  timesheetsTimezoneSchema.parse(timezone);
  if (disambiguation !== undefined && disambiguation !== "earlier" && disambiguation !== "later") {
    throw new RangeError("Choose the earlier or later occurrence of this time.");
  }
  const candidates = localCandidates(local, timezone);
  if (!candidates.length) throw new RangeError("That local time does not exist in the organisation timezone. Choose another time.");
  if (candidates.length > 1 && !disambiguation) {
    throw new RangeError("That local time occurs twice. Choose the earlier or later occurrence explicitly.");
  }
  const selected = disambiguation === "later" ? candidates.at(-1)! : candidates[0];
  if (selected % MINUTE !== 0) throw new RangeError("Time entries must start and end on whole minutes.");
  return new Date(selected).toISOString();
}

/** Seed an edit form without silently choosing one side of a repeated hour. */
export function timesheetsDisambiguationForInstant(instant: string | Date, timezone: string): TimesheetsDisambiguation | undefined {
  const milliseconds = instantMilliseconds(instant);
  const candidates = localCandidates(timesheetsLocalTime(instant, timezone), timezone);
  if (candidates.length < 2) return undefined;
  if (milliseconds === candidates[0]) return "earlier";
  if (milliseconds === candidates.at(-1)) return "later";
  throw new RangeError("Time entries must start and end on whole minutes.");
}

export function validateTimesheetsDuration(start: string | Date, end: string | Date, incrementMinutes: number) {
  const increment = timesheetsIncrementSchema.parse(incrementMinutes);
  const startMilliseconds = instantMilliseconds(start), endMilliseconds = instantMilliseconds(end);
  if (startMilliseconds % MINUTE !== 0 || endMilliseconds % MINUTE !== 0) {
    throw new RangeError("Time entries must start and end on whole minutes.");
  }
  const durationMinutes = (endMilliseconds - startMilliseconds) / MINUTE;
  if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) throw new RangeError("End time must be after start time.");
  if (durationMinutes > MAX_TIMESHEETS_DURATION_MINUTES) throw new RangeError("A time entry cannot exceed 24 elapsed hours.");
  if (durationMinutes % increment !== 0) throw new RangeError(`Duration must be an exact multiple of ${increment} minutes. Times are never rounded.`);
  return durationMinutes;
}

export type TimesheetsTiming = Pick<TimesheetsEntry, "start" | "end" | "timezone" | "durationMinutes" | "incrementMinutes">;
export function normaliseTimesheetsTiming(input: {
  startLocal: string; endLocal: string; timezone: string; incrementMinutes: number;
  startDisambiguation?: TimesheetsDisambiguation; endDisambiguation?: TimesheetsDisambiguation;
  existing?: Pick<TimesheetsEntry, "start" | "end" | "timezone" | "incrementMinutes"> | null;
}): TimesheetsTiming {
  const currentIncrement = timesheetsIncrementSchema.parse(input.incrementMinutes);
  const start = resolveTimesheetsLocalTime(input.startLocal, input.timezone, input.startDisambiguation);
  const end = resolveTimesheetsLocalTime(input.endLocal, input.timezone, input.endDisambiguation);
  const unchanged = input.existing && instantMilliseconds(start) === instantMilliseconds(input.existing.start)
    && instantMilliseconds(end) === instantMilliseconds(input.existing.end);
  const incrementMinutes: TimesheetsIncrement = unchanged ? timesheetsIncrementSchema.parse(input.existing!.incrementMinutes) : currentIncrement;
  return {
    start, end, timezone: unchanged ? input.existing!.timezone : input.timezone,
    durationMinutes: validateTimesheetsDuration(start, end, incrementMinutes), incrementMinutes,
  };
}

function addDays(date: string, days: number) {
  const instant = new Date(`${date}T12:00:00Z`);
  instant.setUTCDate(instant.getUTCDate() + days);
  const result = instant.toISOString().slice(0, 10);
  timesheetsDateSchema.parse(result);
  return result;
}

export function timesheetsDateRange(date: string, view: TimesheetsView) {
  timesheetsDateSchema.parse(date);
  timesheetsViewSchema.parse(view);
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  const first = view === "week" ? addDays(date, -((weekday + 6) % 7)) : date;
  const count = view === "week" ? 7 : 1;
  return { first, next: addDays(first, count), dates: Array.from({ length: count }, (_, index) => addDays(first, index)) };
}

function startOfLocalDate(date: string, timezone: string) {
  const key = `${timezone}:${date}`;
  const cached = dayStarts.get(key);
  if (cached !== undefined) return cached;
  // Midnight can itself be skipped or repeated. The day starts at its earliest real
  // instant. An entirely skipped calendar date has an empty half-open interval.
  for (let minute = 0; minute < 1440; minute++) {
    const hour = String(Math.floor(minute / 60)).padStart(2, "0"), minutes = String(minute % 60).padStart(2, "0");
    const candidates = localCandidates(`${date}T${hour}:${minutes}`, timezone);
    if (candidates.length) return remember(dayStarts, key, candidates[0]);
  }
  const next = addDays(date, 1);
  const candidates = localCandidates(`${next}T00:00`, timezone);
  if (candidates.length) return remember(dayStarts, key, candidates[0]);
  throw new RangeError("Cannot determine the start of this date in the organisation timezone.");
}

function endOfLocalDateEnvelope(nextDate: string, timezone: string) {
  // An early occurrence of the next midnight can be followed by a backward
  // transition into the previous date. Query through its final occurrence, then
  // filter by splitTimesheetsEntryByDay for exact reporting-period membership.
  const candidates = localCandidates(`${nextDate}T00:00`, timezone);
  return candidates.at(-1) ?? startOfLocalDate(nextDate, timezone);
}

export function timesheetsDayBounds(date: string, timezone: string) {
  timesheetsDateSchema.parse(date);
  timesheetsTimezoneSchema.parse(timezone);
  const start = startOfLocalDate(date, timezone), end = endOfLocalDateEnvelope(addDays(date, 1), timezone);
  return { start: new Date(start).toISOString(), end: new Date(end).toISOString() };
}

export function timesheetsWindow(date: string, view: TimesheetsView, timezone: string) {
  const range = timesheetsDateRange(date, view);
  timesheetsTimezoneSchema.parse(timezone);
  return { ...range, start: new Date(startOfLocalDate(range.first, timezone)).toISOString(), end: new Date(endOfLocalDateEnvelope(range.next, timezone)).toISOString() };
}

export type TimesheetsDayAllocation = { date: string; totalMinutes: number; billableMinutes: number };
type ReportEntry = Pick<TimesheetsEntry, "start" | "end" | "billable">;

function entryInterval(entry: ReportEntry) {
  const start = instantMilliseconds(entry.start), end = instantMilliseconds(entry.end);
  if (start % MINUTE !== 0 || end % MINUTE !== 0 || end <= start || end - start > DAY) {
    throw new RangeError("Reports require a valid whole-minute entry of at most 24 elapsed hours.");
  }
  return { start, end };
}

export function splitTimesheetsEntryByDay(entry: ReportEntry, timezone: string): TimesheetsDayAllocation[] {
  const { start, end } = entryInterval(entry);
  timesheetsTimezoneSchema.parse(timezone);
  const format = dateFormatters.get(timezone) ?? remember(dateFormatters, timezone, new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, calendar: "iso8601", numberingSystem: "latn", year: "numeric", month: "2-digit", day: "2-digit",
  }), 64);
  const totals = new Map<string, number>();
  const add = (date: string, milliseconds: number) => totals.set(date, (totals.get(date) ?? 0) + milliseconds / MINUTE);
  // An entry is at most 1,440 whole elapsed minutes. Classifying these exact slices
  // also handles historical changes which briefly cross midnight backwards; one
  // local date is not always one contiguous UTC interval. No rounding is involved.
  for (let cursor = start; cursor < end; cursor += MINUTE) {
    const next = cursor + MINUTE, date = format.format(cursor), lastDate = format.format(next - 1);
    if (date === lastDate) { add(date, MINUTE); continue; }
    // Historical IANA offsets may contain seconds. Preserve fractional overlap at
    // midnight instead of rounding it to a whole reporting minute.
    let low = cursor, high = next;
    while (high - low > 1) {
      const middle = Math.floor((low + high) / 2);
      if (format.format(middle) === date) low = middle;
      else high = middle;
    }
    add(date, high - cursor);
    add(lastDate, next - high);
  }
  return [...totals].sort(([a], [b]) => a.localeCompare(b)).map(([date, totalMinutes]) => ({ date, totalMinutes, billableMinutes: entry.billable ? totalMinutes : 0 }));
}

export function timesheetsTotals(
  entries: readonly (ReportEntry & Pick<TimesheetsEntry, "staffId">)[],
  input: { date: string; view: TimesheetsView; timezone: string },
): TimesheetsTotal[] {
  const range = timesheetsDateRange(input.date, input.view);
  timesheetsTimezoneSchema.parse(input.timezone);
  const totals = new Map<string, TimesheetsTotal>();
  for (const entry of entries) {
    const totalMinutes = splitTimesheetsEntryByDay(entry, input.timezone)
      .filter(allocation => allocation.date >= range.first && allocation.date < range.next)
      .reduce((sum, allocation) => sum + allocation.totalMinutes, 0);
    if (!totalMinutes) continue;
    const total = totals.get(entry.staffId) ?? { staffId: entry.staffId, totalMinutes: 0, billableMinutes: 0 };
    total.totalMinutes += totalMinutes;
    if (entry.billable) total.billableMinutes += totalMinutes;
    totals.set(entry.staffId, total);
  }
  return [...totals.values()].sort((a, b) => a.staffId.localeCompare(b.staffId));
}

/** Quote every field and neutralise spreadsheet formula/control-character prefixes. */
export function timesheetsCsvCell(value: string | number | boolean | null | undefined) {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[\s\u0000-\u001f\u007f]*[=+\-@]/u.test(text) || /^[\u0000-\u001f\u007f]/u.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function timesheetsCsv(rows: readonly (readonly (string | number | boolean | null | undefined)[])[]) {
  return rows.map(row => row.map(timesheetsCsvCell).join(",")).join("\r\n") + "\r\n";
}
