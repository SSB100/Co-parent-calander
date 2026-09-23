export type StaffClockInQualification =
  | {
      allowed: true;
      unrostered: boolean;
    }
  | {
      allowed: false;
      code:
        | "active_clock_session"
        | "unrostered_confirmation_required";
    };

export function qualifyStaffClockIn(input: {
  hasActiveSession: boolean;
  hasMatchingPublishedShift: boolean;
  confirmUnrostered: boolean;
}): StaffClockInQualification {
  if (input.hasActiveSession) {
    return {
      allowed: false,
      code: "active_clock_session",
    };
  }

  if (input.hasMatchingPublishedShift) {
    return {
      allowed: true,
      unrostered: false,
    };
  }

  if (!input.confirmUnrostered) {
    return {
      allowed: false,
      code: "unrostered_confirmation_required",
    };
  }

  return {
    allowed: true,
    unrostered: true,
  };
}
