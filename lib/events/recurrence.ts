import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  differenceInCalendarDays,
  format,
  parseISO,
} from "date-fns";

export type EventRecurrence = "none" | "weekly" | "fortnightly" | "monthly" | "yearly";

export type RecurringEventRecord = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  startDate: string;
  endDate: string | null;
  recurrence: EventRecurrence;
  recurrenceEndDate: string | null;
};

export type EventOccurrence<T extends RecurringEventRecord = RecurringEventRecord> = Omit<
  T,
  "startDate" | "endDate"
> & {
  startDate: string;
  endDate: string | null;
  occurrenceKey: string;
  seriesId: string | null;
};

function dateKey(value: Date) {
  return format(value, "yyyy-MM-dd");
}

function occurrenceStart(base: Date, recurrence: EventRecurrence, index: number) {
  switch (recurrence) {
    case "weekly":
      return addWeeks(base, index);
    case "fortnightly":
      return addWeeks(base, index * 2);
    case "monthly":
      return addMonths(base, index);
    case "yearly":
      return addYears(base, index);
    default:
      return base;
  }
}

function occurrenceEnd(
  start: Date,
  durationDays: number,
) {
  return addDays(start, durationDays);
}

export function expandEventOccurrences<T extends RecurringEventRecord>(input: {
  events: T[];
  from: string;
  to: string;
}) {
  const output: EventOccurrence<T>[] = [];

  for (const event of input.events) {
    const baseStart = parseISO(event.startDate);
    const durationDays = event.endDate
      ? Math.max(0, differenceInCalendarDays(parseISO(event.endDate), baseStart))
      : 0;

    if (event.recurrence === "none") {
      const end = event.endDate ?? event.startDate;
      if (event.startDate <= input.to && end >= input.from) {
        output.push({
          ...event,
          occurrenceKey: event.id,
          seriesId: null,
        });
      }
      continue;
    }

    for (let index = 0; index < 5000; index += 1) {
      const start = occurrenceStart(baseStart, event.recurrence, index);
      const startDate = dateKey(start);
      if (startDate > input.to) break;
      if (event.recurrenceEndDate && startDate > event.recurrenceEndDate) break;

      const end = occurrenceEnd(start, durationDays);
      const endDate = dateKey(end);
      if (endDate < input.from) continue;

      output.push({
        ...event,
        startDate,
        endDate: event.endDate ? endDate : null,
        occurrenceKey: `${event.id}:${startDate}`,
        seriesId: event.id,
      });
    }
  }

  return output.sort(
    (a, b) =>
      a.startDate.localeCompare(b.startDate) ||
      a.title.localeCompare(b.title) ||
      a.occurrenceKey.localeCompare(b.occurrenceKey),
  );
}

export function nextEventOccurrence<T extends RecurringEventRecord>(input: {
  events: T[];
  from: string;
  to: string;
}) {
  return expandEventOccurrences(input).find((event) => {
    const end = event.endDate ?? event.startDate;
    return end >= input.from;
  }) ?? null;
}
