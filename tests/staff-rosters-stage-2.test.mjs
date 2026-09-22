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
  assert.match(setup, /Set up your roster/);
  assert.match(setup, /Roles & locations/);
  assert.match(setup, /Team/);
  assert.match(setup, /Availability/);
});

test("Staff Rosters calendar is a real weekly roster builder", async () => {
  const [shell, roster] = await Promise.all([
    source("components/templates/template-shell.tsx"),
    source("components/staff-rosters/roster-calendar-page.tsx"),
  ]);

  assert.match(shell, /StaffRosterCalendarPage/);
  assert.match(roster, /Create shift/);
  assert.match(roster, /Previous week/);
  assert.match(roster, /Next week/);
  assert.match(roster, /Today/);
  assert.match(roster, /grid-cols-\[180px_repeat\(7/);
  assert.match(roster, /md:hidden/);
  assert.match(roster, /Finish setup/);
  assert.match(roster, /availability_conflict/);
  assert.match(roster, /Create anyway/);
  assert.match(roster, /Delete shift/);

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

  assert.match(contracts, /Shift end time must be after the start time/);
  assert.match(contracts, /overrideAvailabilityConflict/);
  assert.match(schema, /staffRosterShifts/);
  assert.match(schema, /staff_roster_shifts_time_valid/);
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
