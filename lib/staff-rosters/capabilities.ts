export type StaffRosterAccessRole = "owner" | "manager" | "staff";
export type CalendarPermission = "owner" | "editor" | "viewer";

export function staffRosterCapabilities(input: {
  accessRole: StaffRosterAccessRole;
  permission: CalendarPermission;
}) {
  const canWrite = input.permission !== "viewer";
  const isManager =
    input.accessRole === "owner" || input.accessRole === "manager";

  return {
    viewRoster: true,
    editOwnAvailability: true,
    manageAllAvailability: canWrite && isManager,
    manageTeam: canWrite && isManager,
    manageManagers: canWrite && input.accessRole === "owner",
    manageStructure: canWrite && isManager,
    createShifts: canWrite && isManager,
    publishRoster: canWrite && isManager,
    clockOwnTime: true,
    requestOwnTimesheetCorrection: true,
    requestOwnLeave: true,
    reviewTimesheets: canWrite && isManager,
    reviewLeave: canWrite && isManager,
  } as const;
}
