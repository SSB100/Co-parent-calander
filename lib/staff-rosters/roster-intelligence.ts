import { rosterShiftDuration } from "@/lib/staff-rosters/roster-interactions";

export function rosterDaySummary(
  shifts: Array<{
    memberId: string;
    startTime: string;
    endTime: string;
  }>,
) {
  return {
    staffCount: new Set(shifts.map((shift) => shift.memberId)).size,
    shiftCount: shifts.length,
    rosterMinutes: shifts.reduce(
      (sum, shift) => sum + rosterShiftDuration(shift),
      0,
    ),
  };
}

export function monthShiftVisibility(input: {
  shiftCount: number;
  hasLeave: boolean;
  hasUnavailable: boolean;
  maxRows?: number;
}) {
  const maxRows = input.maxRows ?? 3;
  const reservedRows =
    (input.hasLeave ? 1 : 0) + (input.hasUnavailable ? 1 : 0);
  const visibleShiftCount = Math.max(0, maxRows - reservedRows);
  return {
    visibleShiftCount,
    hiddenShiftCount: Math.max(0, input.shiftCount - visibleShiftCount),
  };
}
