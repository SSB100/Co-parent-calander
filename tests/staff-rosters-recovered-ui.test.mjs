import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const source = (file) => readFile(path.join(process.cwd(), file), "utf8");

test("first Staff calendar creates its initial team atomically", async () => {
  const [action, onboarding, switcher] = await Promise.all([
    source("app/calendar/actions.ts"),
    source("components/onboarding/onboarding-shell.tsx"),
    source("components/calendars/calendar-switcher.tsx"),
  ]);
  assert.match(action, /calendarType === "staff_rosters" && value\.staffNames\.length === 0/);
  assert.match(action, /INSERT INTO staff_roster_members/);
  assert.match(action, /await sql\.transaction\(statements\)/);
  assert.match(onboarding, /name="staffNames"/);
  assert.match(switcher, /name="staffNames"/);
});

test("optional Staff profile details are manager-only and migration is additive", async () => {
  const [migration, schema, service, contracts, team] = await Promise.all([
    source("drizzle/0032_staff_roster_profile_details.sql"),
    source("lib/db/schema/staff-rosters.ts"),
    source("lib/staff-rosters/service.ts"),
    source("lib/staff-rosters/contracts.ts"),
    source("components/staff-rosters/team-page.tsx"),
  ]);
  assert.match(migration, /ADD COLUMN contact_email/);
  assert.match(migration, /ADD COLUMN contact_phone/);
  assert.match(migration, /ADD COLUMN expected_weekly_minutes/);
  assert.doesNotMatch(migration, /DELETE|DROP|TRUNCATE/);
  assert.match(schema, /staff_roster_expected_weekly_minutes_valid/);
  assert.match(contracts, /max\(320\)/);
  assert.match(contracts, /max\(10080\)/);
  assert.match(service, /if \(!capabilities\.manageTeam\)/);
  assert.match(team, /Contact email/);
  assert.match(team, /Assigned this week/);
});

test("Manager roster attendance and report stay capability-bound", async () => {
  const [service, calendar, timesheet] = await Promise.all([
    source("lib/staff-rosters/service.ts"),
    source("components/staff-rosters/roster-calendar-page.tsx"),
    source("components/staff-rosters/timesheets-page.tsx"),
  ]);
  assert.match(service, /attendancePoints = capabilities\.createShifts/);
  assert.match(service, /clock\.calendar_id = \$\{input\.session\.calendarId\}/);
  assert.match(calendar, /const attendanceByDate = useMemo/);
  assert.match(calendar, /localDateInTimeZone\(data\.calendarTimezone/);
  assert.match(timesheet, /if \(!data\?\.canReview\) return/);
  assert.match(timesheet, /covie-timesheet-/);
  assert.match(timesheet, /const safe = \/\^\[=\+@/);
});
