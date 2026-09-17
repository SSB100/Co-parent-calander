import { addDays, format, parseISO } from "date-fns";
import { getSql } from "@/lib/db";

export type CalendarSyncJobType = "range" | "full" | "reconcile";

export function buildCalendarSyncJobStatement(
  sql: ReturnType<typeof getSql>,
  input: {
    calendarId: string;
    jobType?: CalendarSyncJobType;
    rangeStart?: string | null;
    rangeEnd?: string | null;
  },
) {
  const jobType = input.jobType ?? "range";
  const rangeStart = input.rangeStart ?? null;
  const rangeEnd = input.rangeEnd ?? null;
  return sql`
    INSERT INTO calendar_sync_jobs (
      connection_id,
      calendar_id,
      job_type,
      range_start,
      range_end,
      status,
      available_at,
      created_at,
      updated_at
    )
    SELECT
      connection.id,
      connection.calendar_id,
      ${jobType},
      ${rangeStart},
      ${rangeEnd},
      'pending',
      now(),
      now(),
      now()
    FROM google_calendar_connections AS connection
    WHERE connection.calendar_id = ${input.calendarId}
      AND connection.status IN ('initial_sync', 'active', 'error')
  `;
}

export function expandGoogleSyncRange(start: string, end = start) {
  return {
    from: format(addDays(parseISO(start), -1), "yyyy-MM-dd"),
    to: format(addDays(parseISO(end), 1), "yyyy-MM-dd"),
  };
}
