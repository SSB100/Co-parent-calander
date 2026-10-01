import { localDateTimePartsInTimeZone } from "@/lib/calendar/time";
import type {
  SalonAppointment,
  SalonPractitioner,
  SalonTimeBlock,
  SalonWorkingHours,
} from "@/lib/salon/contracts";
import { salonDayTimeline } from "@/lib/salon/slots";

export type SalonSchedulePractitioner = Pick<SalonPractitioner, "id" | "displayName" | "active">;
export type SalonScheduleAppointment = Pick<SalonAppointment,
  "id" | "practitionerId" | "practitionerName" | "clientName" | "serviceName" |
  "start" | "end" | "busyStart" | "busyEnd" | "status"
>;
export type SalonScheduleTimeBlock = Pick<SalonTimeBlock, "id" | "practitionerId" | "start" | "end" | "active">;

export type SalonOwnerScheduleInput = {
  date: string;
  timezone: string;
  practitioners: readonly SalonSchedulePractitioner[];
  hours: readonly SalonWorkingHours[];
  timeBlocks: readonly SalonScheduleTimeBlock[];
  appointments: readonly SalonScheduleAppointment[];
  practitionerId: string;
  showCancelled: boolean;
};

export type SalonScheduleRange = { start: number; end: number };
export type SalonScheduleSegment = SalonScheduleRange & { kind: "before" | "service" | "after" };
export type SalonScheduleRow = SalonScheduleRange & { id: string; label: string; offset: string };
export type SalonScheduleAppointmentEntry = {
  kind: "appointment";
  id: string;
  start: number;
  end: number;
  serviceStart: number;
  serviceEnd: number;
  practitionerId: string;
  practitionerName: string;
  clientName: string;
  serviceName: string;
  status: SalonAppointment["status"];
  bufferOnlyOnDay: boolean;
  segments: SalonScheduleSegment[];
};
export type SalonScheduleBlockEntry = {
  kind: "block";
  id: string;
  start: number;
  end: number;
  practitionerId: string;
  practitionerName: string;
};
export type SalonScheduleEntry = SalonScheduleAppointmentEntry | SalonScheduleBlockEntry;
export type SalonScheduleCell = {
  row: SalonScheduleRow;
  working: SalonScheduleRange[];
  entries: { entry: SalonScheduleEntry; firstRow: boolean; segments: SalonScheduleSegment[] }[];
};
export type SalonScheduleColumn = {
  practitioner: { id: string; displayName: string; active: boolean | null };
  working: SalonScheduleRange[];
  cells: SalonScheduleCell[];
};
export type SalonOwnerScheduleModel = {
  rows: SalonScheduleRow[];
  columns: SalonScheduleColumn[];
  appointments: SalonScheduleAppointmentEntry[];
  message: string;
  warning: string;
  clockChange: boolean;
};

const minuteMs = 60_000;
const overlaps = (a: SalonScheduleRange, b: SalonScheduleRange) => a.start < b.end && b.start < a.end;
const clip = (a: SalonScheduleRange, b: SalonScheduleRange): SalonScheduleRange => ({ start: Math.max(a.start, b.start), end: Math.min(a.end, b.end) });
const validRange = ({ start, end }: SalonScheduleRange) => Number.isFinite(start) && Number.isFinite(end) && start < end;
const byInstant = (a: SalonScheduleEntry, b: SalonScheduleEntry) => a.start - b.start || a.end - b.end || a.id.localeCompare(b.id);

/** Exact supplied instants, including dates, offsets, and sub-minute precision when present. */
export function salonScheduleTime(instant: number, timezone: string, includeDate = true) {
  const value = new Date(instant);
  return new Intl.DateTimeFormat("en-NZ", {
    timeZone: timezone,
    ...(includeDate ? { year: "numeric", month: "short", day: "numeric" } as const : {}),
    hour: "numeric",
    minute: "2-digit",
    ...(value.getUTCSeconds() || value.getUTCMilliseconds() ? { second: "2-digit" } as const : {}),
    ...(value.getUTCMilliseconds() ? { fractionalSecondDigits: 3 } as const : {}),
    timeZoneName: "shortOffset",
  }).format(value);
}

/** Compact visible range; the full date/offset context stays in the accessible label. */
export function salonScheduleCompactRange(start: number, end: number, timezone: string, selectedDate: string) {
  const parts = (instant: number) => {
    const value = new Date(instant);
    const formatted = new Intl.DateTimeFormat("en-NZ", {
      timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
      ...(value.getUTCSeconds() || value.getUTCMilliseconds() ? { second: "2-digit" } as const : {}),
      ...(value.getUTCMilliseconds() ? { fractionalSecondDigits: 3 } as const : {}),
      timeZoneName: "shortOffset",
    }).formatToParts(value);
    return {
      date: localDateTimePartsInTimeZone(timezone, value).date,
      dateLabel: new Intl.DateTimeFormat("en-NZ", { timeZone: timezone, day: "numeric", month: "short" }).format(value),
      time: formatted.filter(part => part.type !== "timeZoneName").map(part => part.value).join("").trim(),
      offset: formatted.find(part => part.type === "timeZoneName")?.value ?? timezone,
    };
  };
  const from = parts(start), to = parts(end);
  const fromLabel = `${from.date !== selectedDate ? `${from.dateLabel} ` : ""}${from.time}`;
  const toLabel = `${to.date !== from.date ? `${to.dateLabel} ` : ""}${to.time}`;
  return from.offset === to.offset
    ? `${fromLabel}–${toLabel} ${from.offset}`
    : `${fromLabel} ${from.offset}–${toLabel} ${to.offset}`;
}

function rowLabel(instant: number, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-NZ", {
    timeZone: timezone, hour: "numeric", minute: "2-digit", timeZoneName: "shortOffset",
  }).formatToParts(instant);
  return {
    label: parts.filter(part => part.type !== "timeZoneName").map(part => part.value).join("").trim(),
    offset: parts.find(part => part.type === "timeZoneName")?.value ?? timezone,
  };
}

/** Presentation only: enumerate clock instants, never generate or infer bookable slots. */
export function salonOwnerScheduleModel(input: SalonOwnerScheduleInput): SalonOwnerScheduleModel {
  const empty = (message: string): SalonOwnerScheduleModel => ({ rows: [], columns: [], appointments: [], message, warning: "", clockChange: false });
  let timeline: ReturnType<typeof salonDayTimeline>;
  try {
    timeline = salonDayTimeline(input.timezone, input.date);
  } catch {
    return empty("This day cannot be displayed. Check the calendar date and timezone.");
  }
  if (!timeline.length) return empty("This date does not exist in the calendar timezone.");
  const day = { start: timeline[0].instant, end: timeline[timeline.length - 1].instant + minuteMs };
  const rows: SalonScheduleRow[] = [];
  timeline.forEach((minute, index) => {
    const previous = timeline[index - 1];
    // Split at real hour boundaries AND clock transitions. A repeated 01:30 on
    // Lord Howe has its own row; a nonexistent local hour gets no row at all.
    if (!previous || minute.minute % 60 === 0 || minute.minute !== previous.minute + 1 || minute.instant !== previous.instant + minuteMs) {
      rows.push({ id: String(minute.instant), start: minute.instant, end: minute.instant + minuteMs, ...rowLabel(minute.instant, input.timezone) });
    } else {
      rows[rows.length - 1].end = minute.instant + minuteMs;
    }
  });

  let invalidRecords = 0;
  const appointments: SalonScheduleAppointmentEntry[] = [];
  for (const appointment of input.appointments) {
    if ((!input.showCancelled && appointment.status === "cancelled") || (input.practitionerId && appointment.practitionerId !== input.practitionerId)) continue;
    const service = { start: Date.parse(appointment.start), end: Date.parse(appointment.end) };
    const busy = { start: Date.parse(appointment.busyStart), end: Date.parse(appointment.busyEnd) };
    if (!validRange(service) || !validRange(busy) || busy.start > service.start || busy.end < service.end) {
      invalidRecords += 1;
      continue;
    }
    if (!overlaps(busy, day)) continue;
    const parts: SalonScheduleSegment[] = [
      { kind: "before", start: busy.start, end: service.start },
      { kind: "service", ...service },
      { kind: "after", start: service.end, end: busy.end },
    ];
    const segments = parts.filter(validRange);
    // Copy display fields explicitly. Pick<> alone does not remove private
    // runtime fields from the full appointment objects passed by SalonPage.
    appointments.push({
      kind: "appointment", id: appointment.id, start: busy.start, end: busy.end,
      serviceStart: service.start, serviceEnd: service.end,
      practitionerId: appointment.practitionerId, practitionerName: appointment.practitionerName,
      clientName: appointment.clientName, serviceName: appointment.serviceName,
      status: appointment.status, bufferOnlyOnDay: !overlaps(service, day), segments,
    });
  }
  appointments.sort(byInstant);
  const blocks: SalonScheduleBlockEntry[] = [];
  for (const block of input.timeBlocks) {
    if (!block.active || (input.practitionerId && block.practitionerId !== input.practitionerId)) continue;
    const range = { start: Date.parse(block.start), end: Date.parse(block.end) };
    if (!validRange(range)) { invalidRecords += 1; continue; }
    if (!overlaps(range, day)) continue;
    blocks.push({ kind: "block", id: block.id, ...range, practitionerId: block.practitionerId,
      practitionerName: input.practitioners.find(person => person.id === block.practitionerId)?.displayName ?? "Practitioner not listed" });
  }
  const entries: SalonScheduleEntry[] = [...appointments, ...blocks].sort(byInstant);
  const visibleIds = new Set(entries.map(entry => entry.practitionerId));
  const practitioners: SalonScheduleColumn["practitioner"][] = input.practitioners
    .filter(person => (!input.practitionerId || person.id === input.practitionerId) && (person.active || visibleIds.has(person.id) || person.id === input.practitionerId))
    .map(person => ({ id: person.id, displayName: person.displayName, active: person.active }));
  // A retained record must not disappear just because its profile is absent.
  for (const entry of entries) {
    if (!practitioners.some(person => person.id === entry.practitionerId)) {
      practitioners.push({ id: entry.practitionerId, displayName: entry.practitionerName || "Practitioner not listed", active: null });
    }
  }
  practitioners.sort((a, b) => a.displayName.localeCompare(b.displayName) || a.id.localeCompare(b.id));
  const working = new Map<string, SalonScheduleRange[]>();
  for (const person of practitioners) {
    const intervals = input.hours.filter(hour => hour.practitionerId === person.id && hour.weekday === timeline[0].weekday);
    const ranges: SalonScheduleRange[] = [];
    for (const minute of timeline) {
      if (!intervals.some(hour => minute.minute >= hour.startMinute && minute.minute < hour.endMinute)) continue;
      const previous = ranges.at(-1);
      if (previous?.end === minute.instant) previous.end += minuteMs;
      else ranges.push({ start: minute.instant, end: minute.instant + minuteMs });
    }
    working.set(person.id, ranges);
  }
  const extents = [...entries, ...[...working.values()].flat()];
  const firstRow = rows.findIndex(row => extents.some(range => overlaps(range, row)));
  let lastRow = firstRow;
  for (let index = firstRow; index < rows.length && index >= 0; index += 1) {
    if (extents.some(range => overlaps(range, rows[index]))) lastRow = index;
  }
  // Show the whole interval between the first/last recorded item or working
  // hour. Never turn those descriptive hours or the intervening blank cells
  // into a promise that a service can be booked.
  const visibleRows = firstRow < 0 ? [] : rows.slice(firstRow, lastRow + 1);
  const columns = practitioners.map((practitioner): SalonScheduleColumn => {
    const ranges = working.get(practitioner.id) ?? [];
    const records = entries.filter(entry => entry.practitionerId === practitioner.id);
    return {
      practitioner, working: ranges,
      cells: visibleRows.map(row => ({ row,
        working: ranges.filter(range => overlaps(range, row)).map(range => clip(range, row)),
        entries: records.filter(entry => overlaps(entry, row)).map(entry => ({ entry,
          firstRow: Math.max(entry.start, day.start) >= row.start,
          segments: entry.kind === "appointment" ? entry.segments.filter(segment => overlaps(segment, row)).map(segment => ({ ...clip(segment, row), kind: segment.kind })) : [],
        })),
      })),
    };
  });
  const startParts = localDateTimePartsInTimeZone(input.timezone, new Date(day.start));
  return {
    rows: visibleRows, columns, appointments,
    message: !columns.length
      ? input.practitionerId ? "The selected practitioner is not present in this schedule." : "No practitioners are listed in this schedule."
      : !visibleRows.length ? "No appointments, active time blocks or recorded working hours for this day." : "",
    warning: invalidRecords ? `${invalidRecords} ${invalidRecords === 1 ? "record has" : "records have"} invalid time ranges and cannot be placed. Refresh the schedule to check the source records.` : "",
    clockChange: timeline.length !== 1440 || startParts.time !== "00:00:00" || timeline.some((minute, index) => index > 0 && minute.minute !== timeline[index - 1].minute + 1),
  };
}
