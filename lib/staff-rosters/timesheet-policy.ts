import { localDateInTimeZone } from "@/lib/calendar/time";

export type TimesheetSessionState =
  | "completed"
  | "in_progress"
  | "missing_clock_out";

export function classifyTimesheetSession(input: {
  clockInAt: Date | string;
  clockOutAt: Date | string | null;
  scheduledDate: string | null;
  timeZone: string;
  now?: Date;
}): TimesheetSessionState {
  if (input.clockOutAt) {
    return "completed";
  }

  const clockIn =
    input.clockInAt instanceof Date
      ? input.clockInAt
      : new Date(input.clockInAt);
  const sessionDate =
    input.scheduledDate ?? localDateInTimeZone(input.timeZone, clockIn);
  const today = localDateInTimeZone(input.timeZone, input.now ?? new Date());

  return sessionDate < today ? "missing_clock_out" : "in_progress";
}
