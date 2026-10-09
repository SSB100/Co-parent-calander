import type { TimesheetsAssignment, TimesheetsRole, TimesheetsStaff } from "./contracts";

/** Construct only from current, calendar-scoped server records, never request JSON. */
export type TimesheetsPolicyContext = {
  role: TimesheetsRole;
  ownStaffId: string | null;
  assignments: readonly TimesheetsAssignment[];
};

export class TimesheetsAccessError extends Error {
  readonly status = 403;
  constructor(message = "You do not have access to this Timesheets record.") {
    super(message);
    this.name = "TimesheetsAccessError";
  }
}

export function assertTimesheetsOwner(role: TimesheetsRole) {
  if (role !== "owner") throw new TimesheetsAccessError("Only the owner can change organisation settings and manager assignments.");
}

/** Entry/report scope. Profile administration is intentionally narrower. */
export function canManageTimesheetsStaff(context: TimesheetsPolicyContext, staffId: string) {
  if (!staffId) return false;
  if (context.role === "owner") return true;
  if (context.role !== "manager" && context.role !== "member") return false;
  if (context.ownStaffId === staffId) return true;
  return context.role === "manager" && context.ownStaffId !== null && context.assignments.some(
    assignment => assignment.managerStaffId === context.ownStaffId && assignment.staffId === staffId,
  );
}

export function canManageTimesheetsProfile(
  context: TimesheetsPolicyContext,
  staff: Pick<TimesheetsStaff, "id" | "role">,
  nextRole: TimesheetsRole = staff.role,
) {
  if (staff.role === "owner" || nextRole === "owner") return false;
  if (context.role === "owner") return true;
  return context.role === "manager" && staff.role === "member" && nextRole === "member"
    && context.ownStaffId !== null && context.assignments.some(
      assignment => assignment.managerStaffId === context.ownStaffId && assignment.staffId === staff.id,
    );
}

export function assertTimesheetsEntryAccess(
  context: TimesheetsPolicyContext,
  staffId: string,
  options: { existing?: { staffId: string } | boolean; reason?: string } = {},
) {
  // Check both sides when moving an entry; destination access cannot grant source access.
  const previousStaffId = typeof options.existing === "object" ? options.existing.staffId : staffId;
  if (!canManageTimesheetsStaff(context, staffId) || !canManageTimesheetsStaff(context, previousStaffId)) {
    throw new TimesheetsAccessError();
  }
  if ((staffId !== context.ownStaffId || previousStaffId !== context.ownStaffId) && (options.reason?.trim().length ?? 0) < 3) {
    throw new TimesheetsAccessError("Add a reason of at least 3 characters when creating, changing or deleting another person's time entry.");
  }
}
