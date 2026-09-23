export type AttendanceBreak = { startedAt: string; endedAt: string | null };

/** Elapsed instants, never payroll rules. Sum milliseconds before rounding. */
export function attendanceDurations(input: {
  clockInAt: string | Date;
  clockOutAt: string | Date | null;
  breaks: AttendanceBreak[];
  now?: Date;
}) {
  const start = new Date(input.clockInAt).getTime();
  const end = input.clockOutAt ? new Date(input.clockOutAt).getTime() : (input.now ?? new Date()).getTime();
  const elapsed = Math.max(0, end - start);
  const breakMs = input.breaks.reduce((sum, entry) => {
    const from = Math.max(start, new Date(entry.startedAt).getTime());
    const to = Math.min(end, entry.endedAt ? new Date(entry.endedAt).getTime() : end);
    return sum + Math.max(0, to - from);
  }, 0);
  const elapsedMinutes = Math.floor(elapsed / 60_000);
  const breakMinutes = Math.floor(Math.min(elapsed, breakMs) / 60_000);
  return { elapsedMinutes, breakMinutes, workedMinutes: elapsedMinutes - breakMinutes };
}
