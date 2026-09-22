import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

async function source(file) {
  return readFile(path.join(root, file), "utf8");
}

test("all calendars support archive restore and permanent deletion through Covie Core", async () => {
  const [actions, navigation, session, switcher, lifecycle] = await Promise.all([
    source("app/calendar/actions.ts"),
    source("lib/calendars/navigation.ts"),
    source("lib/security/session.ts"),
    source("components/calendars/calendar-switcher.tsx"),
    source("components/calendars/calendar-lifecycle-controls.tsx"),
  ]);

  assert.match(actions, /export async function archiveCalendar/);
  assert.match(actions, /export async function restoreCalendar/);
  assert.match(actions, /export async function deleteCalendar/);
  assert.match(actions, /membership\.permission = 'owner'/);
  assert.match(actions, /DELETE FROM parenting_schedules/);
  assert.match(actions, /DELETE FROM parenting_assignments/);
  assert.match(actions, /DELETE FROM responsibilities/);
  assert.match(actions, /DELETE FROM expenses/);
  assert.match(actions, /DELETE FROM expense_recurring_series/);
  assert.match(actions, /DELETE FROM staff_roster_timesheet_corrections/);
  assert.match(actions, /DELETE FROM staff_roster_clock_sessions/);
  assert.match(actions, /DELETE FROM staff_roster_updates/);
  assert.match(actions, /DELETE FROM staff_roster_published_shifts/);
  assert.match(actions, /DELETE FROM staff_roster_week_publications/);
  assert.match(actions, /DELETE FROM staff_roster_leave_requests/);
  assert.match(actions, /DELETE FROM staff_roster_invites/);
  assert.match(actions, /DELETE FROM staff_roster_shifts/);
  assert.match(actions, /DELETE FROM calendars/);
  assert.match(actions, /calendar\.archived_at IS NULL/);
  assert.match(actions, /calendarName !== calendar\.name/);

  assert.match(navigation, /listArchivedCalendarNavigationOptions/);
  assert.match(navigation, /isNull\(calendars\.archivedAt\)/);
  assert.match(navigation, /isNotNull\(calendars\.archivedAt\)/);
  assert.match(session, /isNull\(calendars\.archivedAt\)/);

  assert.match(switcher, /CalendarLifecycleControls/);
  assert.match(lifecycle, /Archive calendar/);
  assert.match(lifecycle, /Delete permanently/);
  assert.match(lifecycle, /Archived calendars/);
  assert.match(lifecycle, /Restore/);
  assert.match(lifecycle, /Type .* to/);
  assert.doesNotMatch(lifecycle, /window\.confirm/);
});

test("new Staff Rosters calendars open directly into the calendar", async () => {
  const [actions, route, setup] = await Promise.all([
    source("app/calendar/actions.ts"),
    source("app/calendar-types/staff-rosters/setup/page.tsx"),
    source("components/staff-rosters/setup-page.tsx"),
  ]);

  assert.doesNotMatch(
    actions,
    /calendarType === "staff_rosters"[\s\S]*calendar-types\/staff-rosters\/setup/,
  );
  assert.match(actions, /redirect\(calendarPathForType\(parsed\.data\.calendarType\)\)/);
  assert.match(route, /session\.calendarType !== "staff_rosters"/);
  assert.match(route, /staffMember\.accessRole === "staff"/);
  assert.match(route, /redirect\("\/calendar-types\/staff-rosters"\)/);
  assert.match(setup, /Set up your roster/);
  assert.match(setup, /Roles & locations/);
  assert.match(setup, /Team/);
  assert.match(setup, /Availability/);
});

test("Staff Rosters calendar is a calendar-first weekly roster builder", async () => {
  const [shell, roster] = await Promise.all([
    source("components/templates/template-shell.tsx"),
    source("components/staff-rosters/roster-calendar-page.tsx"),
  ]);

  assert.match(shell, /StaffRosterCalendarPage/);
  assert.match(roster, /Create shift/);
  assert.match(roster, /Previous week/);
  assert.match(roster, /Next week/);
  assert.match(roster, /Today/);
  assert.match(roster, /Week/);
  assert.match(roster, /Month/);
  assert.match(roster, /Drag onto calendar/);
  assert.match(roster, /grid-cols-\[210px_minmax\(0,1fr\)\]/);
  assert.match(roster, /layoutOverlappingShifts/);
  assert.match(roster, /handleTimelineDrop/);
  assert.match(roster, /beginResize/);
  assert.match(roster, /SNAP_MINUTES = 15/);
  assert.match(roster, /weeklyMinutesByMember/);
  assert.match(roster, /Copy previous week/);
  assert.match(roster, /inactive staff/);
  assert.match(roster, /outdated role\/location details/);
  assert.match(roster, /Publish roster/);
  assert.match(roster, /Send updates/);
  assert.match(roster, /Changes pending/);
  assert.match(roster, /Start your roster/);
  assert.match(roster, /changedShiftCount/);
  assert.match(roster, /sendUpdatesConfirmOpen/);
  assert.match(roster, /md:hidden/);
  assert.match(roster, /availability_conflict/);
  assert.match(roster, /pending_leave_conflict/);
  assert.match(roster, /Save anyway/);
  assert.match(roster, /Delete shift/);
  assert.doesNotMatch(roster, /Finish setup/);

  for (const mock of ["Alex", "Jordan", "Sam", "Main site", "Morning shift"]) {
    assert.doesNotMatch(roster, new RegExp(mock));
  }
});

test("shift service blocks overlaps and requires explicit unavailability override", async () => {
  const [service, contracts, schema] = await Promise.all([
    source("lib/staff-rosters/service.ts"),
    source("lib/staff-rosters/contracts.ts"),
    source("lib/db/schema/staff-rosters.ts"),
  ]);

  assert.match(service, /shiftConflictState/);
  assert.match(service, /shift_overlap/);
  assert.match(service, /availability_conflict/);
  assert.match(service, /overrideAvailabilityConflict/);
  assert.match(service, /capabilities\.createShifts/);
  assert.match(service, /staff_roster\.shift\.create/);
  assert.match(service, /staff_roster\.shift\.update/);
  assert.match(service, /staff_roster\.shift\.delete/);
  assert.match(service, /export async function copyPreviousRosterWeek/);
  assert.match(service, /availabilitySkipped/);
  assert.match(service, /overlapSkipped/);
  assert.match(service, /inactiveStaffSkipped/);
  assert.match(service, /staleReferenceAdjusted/);
  assert.match(service, /activeMemberIds/);
  assert.match(service, /activeRoleIds/);
  assert.match(service, /activeLocationIds/);

  assert.match(contracts, /Shift end time must be after the start time/);
  assert.match(contracts, /copyStaffRosterWeekSchema/);
  assert.match(contracts, /overrideAvailabilityConflict/);
  assert.match(schema, /staffRosterShifts/);
  assert.match(schema, /staff_roster_shifts_time_valid/);
});


test("Staff roster publication keeps live drafts separate from Staff-visible snapshots", async () => {
  const [service, route, schema] = await Promise.all([
    source("lib/staff-rosters/service.ts"),
    source("app/api/staff-roster/publication/route.ts"),
    source("lib/db/schema/staff-rosters.ts"),
  ]);

  assert.match(service, /staffRosterWeekPublications/);
  assert.match(service, /staffRosterPublishedShifts/);
  assert.match(service, /visibleShifts = capabilities\.createShifts \? liveShifts : publishedShifts/);
  assert.match(service, /publicationStatus/);
  assert.match(service, /changedShiftCount/);
  assert.match(service, /changes_pending/);
  assert.match(service, /export async function publishRosterWeek/);
  assert.match(service, /pg_advisory_xact_lock/);
  assert.match(service, /staff_roster_updates/);
  assert.match(service, /shift_changed/);
  assert.match(service, /DELETE FROM staff_roster_published_shifts/);
  assert.match(service, /INSERT INTO staff_roster_published_shifts/);
  assert.match(route, /publishRosterWeek/);
  assert.match(route, /isSameOriginMutation/);
  assert.match(schema, /staffRosterWeekPublications/);
  assert.match(schema, /staffRosterPublishedShifts/);
  assert.match(schema, /staffRosterUpdates/);
});

test("Staff gets a materially separate personal workspace and manager routes stay server guarded", async () => {
  const [route, shell, nav, myRoster, service] = await Promise.all([
    source("components/templates/template-route.tsx"),
    source("components/templates/template-shell.tsx"),
    source("components/templates/template-workspace-nav.tsx"),
    source("components/staff-rosters/my-roster-page.tsx"),
    source("lib/staff-rosters/service.ts"),
  ]);

  assert.match(route, /staffAccessRole === "staff"/);
  assert.match(route, /activeToolKey !== "availability"/);
  assert.match(route, /activeToolKey !== "timesheets"/);
  assert.match(shell, /StaffMyRosterPage/);
  assert.match(nav, /My roster/);
  assert.match(nav, /Timesheet/);
  assert.match(nav, /Leave/);
  assert.match(myRoster, /Clock in/);
  assert.match(myRoster, /Clock out/);
  assert.match(service, /if \(!capabilities\.manageTeam\)/);
  assert.match(service, /canManageSetup: false/);
  assert.match(service, /roleCount: 0/);
  assert.match(service, /locationCount: 0/);
  assert.match(service, /memberCount: 0/);
  assert.match(service, /if \(!capabilities\.manageStructure\)/);
});

test("Staff self-service attendance, corrections and leave stay bounded", async () => {
  const [capabilities, workforce, clockRoute, correctionRoute, leaveRoute, schema] =
    await Promise.all([
      source("lib/staff-rosters/capabilities.ts"),
      source("lib/staff-rosters/workforce-service.ts"),
      source("app/api/staff-roster/clock/route.ts"),
      source("app/api/staff-roster/timesheet-corrections/route.ts"),
      source("app/api/staff-roster/leave/route.ts"),
      source("lib/db/schema/staff-rosters.ts"),
    ]);

  assert.match(capabilities, /clockOwnTime: true/);
  assert.match(capabilities, /requestOwnTimesheetCorrection: true/);
  assert.match(capabilities, /requestOwnLeave: true/);
  assert.match(capabilities, /reviewTimesheets: canWrite && isManager/);
  assert.match(capabilities, /reviewLeave: canWrite && isManager/);
  assert.match(workforce, /unrostered_confirmation_required/);
  assert.match(workforce, /staff_roster\.clock\.in/);
  assert.match(workforce, /staff_roster\.clock\.out/);
  assert.match(workforce, /staff_roster\.timesheet_correction\.request/);
  assert.match(workforce, /staff_roster\.timesheet_correction\.review/);
  assert.match(workforce, /staff_roster\.leave\.request/);
  assert.match(workforce, /staff_roster\.leave\.review/);
  assert.match(clockRoute, /isSameOriginMutation/);
  assert.match(correctionRoute, /isSameOriginMutation/);
  assert.match(leaveRoute, /isSameOriginMutation/);
  assert.match(schema, /staff_roster_clock_sessions_member_active_unique/);
  assert.match(schema, /staffRosterTimesheetCorrections/);
  assert.match(schema, /staffRosterLeaveRequests/);
});

test("approved leave blocks rostering while pending leave is an explicit warning", async () => {
  const service = await source("lib/staff-rosters/service.ts");

  assert.match(service, /approved_leave_conflict/);
  assert.match(service, /pending_leave_conflict/);
  assert.match(service, /conflicts\.approvedLeave\.length > 0/);
  assert.match(service, /conflicts\.pendingLeave\.length > 0/);
});

test("archiving linked Staff revokes access but preserves upcoming shift safety", async () => {
  const service = await source("lib/staff-rosters/service.ts");

  assert.match(service, /upcoming_shifts/);
  assert.match(service, /Remove or reassign this person’s upcoming shifts/);
  assert.match(service, /UPDATE staff_roster_invites/);
  assert.match(service, /DELETE FROM calendar_memberships/);
  assert.match(service, /accountAccessRevoked/);
});


test("Staff invitations link existing team profiles without co-parent participants", async () => {
  const [service, join, team, schema] = await Promise.all([
    source("lib/staff-rosters/invitations-service.ts"),
    source("app/calendar/actions.ts"),
    source("components/staff-rosters/team-page.tsx"),
    source("lib/db/schema/staff-rosters.ts"),
  ]);

  assert.match(service, /UPDATE staff_roster_members member/);
  assert.match(service, /membership_id = membership\.id/);
  assert.match(service, /already linked to another team member/);
  assert.match(service, /Only the calendar owner can invite another manager/);
  assert.doesNotMatch(service, /INSERT INTO participants/);
  assert.match(join, /acceptStaffRosterInviteCode/);
  assert.match(team, /Invite to Covie/);
  assert.match(team, /links their account to this existing team profile/);
  assert.match(schema, /staffRosterInvites/);
});

test("Staff setup completion is persisted but does not force optional data", async () => {
  const [service, schema, setup] = await Promise.all([
    source("lib/staff-rosters/service.ts"),
    source("lib/db/schema/staff-rosters.ts"),
    source("components/staff-rosters/setup-page.tsx"),
  ]);

  assert.match(service, /staffRosterSettings/);
  assert.match(service, /setup_completed_at/);
  assert.match(service, /ON CONFLICT \(calendar_id\)/);
  assert.match(schema, /staffRosterSettings/);
  assert.match(schema, /setupCompletedAt/);
  assert.match(setup, /Roles, locations and availability are optional/);
});

test("archived calendars are excluded from onboarding and active switching", async () => {
  const [onboarding, openAction, navigation] = await Promise.all([
    source("app/onboarding/page.tsx"),
    source("app/calendar/actions.ts"),
    source("lib/calendars/navigation.ts"),
  ]);

  assert.match(onboarding, /listCalendarNavigationOptions/);
  assert.match(onboarding, /listArchivedCalendarNavigationOptions/);
  assert.match(openAction, /calendar\.archived_at IS NULL/);
  assert.match(navigation, /isNull\(calendars\.archivedAt\)/);
});
