import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { staffRosterCapabilities } from "../lib/staff-rosters/capabilities";
import { qualifyStaffClockIn } from "../lib/staff-rosters/clocking-policy";
import { staffClockActionSchema } from "../lib/staff-rosters/workforce-contracts";

const root = process.cwd();

async function source(file: string) {
  return readFile(path.join(root, file), "utf8");
}

test("Stage 6 keeps Staff as viewer with bounded self-service only", () => {
  const staff = staffRosterCapabilities({
    accessRole: "staff",
    permission: "viewer",
  });
  const manager = staffRosterCapabilities({
    accessRole: "manager",
    permission: "editor",
  });

  assert.equal(staff.viewRoster, true);
  assert.equal(staff.clockOwnTime, true);
  assert.equal(staff.requestOwnTimesheetCorrection, true);
  assert.equal(staff.requestOwnLeave, true);
  assert.equal(staff.manageTeam, false);
  assert.equal(staff.manageStructure, false);
  assert.equal(staff.createShifts, false);
  assert.equal(staff.publishRoster, false);
  assert.equal(staff.reviewTimesheets, false);
  assert.equal(staff.reviewLeave, false);

  assert.equal(manager.manageTeam, true);
  assert.equal(manager.createShifts, true);
  assert.equal(manager.publishRoster, true);
  assert.equal(manager.reviewTimesheets, true);
  assert.equal(manager.reviewLeave, true);
});

test("Stage 6 clock-in policy distinguishes rostered, unrostered and duplicate intent", () => {
  assert.deepEqual(
    qualifyStaffClockIn({
      hasActiveSession: false,
      hasMatchingPublishedShift: true,
      confirmUnrostered: false,
    }),
    { allowed: true, unrostered: false },
  );

  assert.deepEqual(
    qualifyStaffClockIn({
      hasActiveSession: false,
      hasMatchingPublishedShift: false,
      confirmUnrostered: false,
    }),
    { allowed: false, code: "unrostered_confirmation_required" },
  );

  assert.deepEqual(
    qualifyStaffClockIn({
      hasActiveSession: false,
      hasMatchingPublishedShift: false,
      confirmUnrostered: true,
    }),
    { allowed: true, unrostered: true },
  );

  assert.deepEqual(
    qualifyStaffClockIn({
      hasActiveSession: true,
      hasMatchingPublishedShift: true,
      confirmUnrostered: true,
    }),
    { allowed: false, code: "active_clock_session" },
  );
});

test("Stage 6 clock request never accepts browser-supplied Staff or session identity", () => {
  const parsed = staffClockActionSchema.parse({
    action: "clock_in",
    confirmUnrostered: true,
    memberId: "00000000-0000-4000-8000-000000000001",
    clockSessionId: "00000000-0000-4000-8000-000000000002",
  });

  assert.deepEqual(parsed, {
    action: "clock_in",
    confirmUnrostered: true,
  });
});

test("Stage 6 Staff roster and clock matching use published snapshots, not Manager drafts", async () => {
  const [service, workforce] = await Promise.all([
    source("lib/staff-rosters/service.ts"),
    source("lib/staff-rosters/workforce-service.ts"),
  ]);

  assert.match(
    service,
    /const visibleShifts = capabilities\.createShifts \? liveShifts : publishedShifts/,
  );
  assert.match(
    service,
    /eq\(staffRosterPublishedShifts\.memberId, current\.id\)/,
  );

  const finder = workforce.slice(
    workforce.indexOf("async function findPublishedShiftForClockIn"),
    workforce.indexOf("export async function getClockState"),
  );
  assert.match(finder, /staffRosterPublishedShifts/);
  assert.match(finder, /staffRosterWeekPublications/);
  assert.match(
    finder,
    /eq\(staffRosterWeekPublications\.calendarId, session\.calendarId\)/,
  );
  assert.match(finder, /eq\(staffRosterPublishedShifts\.memberId, memberId\)/);
  assert.doesNotMatch(finder, /staffRosterShifts/);
});

test("Stage 6 clocking resolves authenticated Staff identity server-side and rejects inactive profiles", async () => {
  const [service, workforce, route] = await Promise.all([
    source("lib/staff-rosters/service.ts"),
    source("lib/staff-rosters/workforce-service.ts"),
    source("app/api/staff-roster/clock/route.ts"),
  ]);

  const ensureMember = service.slice(
    service.indexOf("export async function ensureStaffRosterMember"),
    service.indexOf("async function assertReferenceBelongsToCalendar"),
  );
  assert.match(ensureMember, /session\.calendarId/);
  assert.match(ensureMember, /session\.membershipId/);
  assert.match(ensureMember, /Your staff profile is inactive for this roster/);

  const clockIn = workforce.slice(
    workforce.indexOf("export async function clockIn"),
    workforce.indexOf("export async function clockOut"),
  );
  assert.match(clockIn, /ensureStaffRosterMember\(input\.session\)/);
  assert.match(clockIn, /current\.id/);
  assert.match(clockIn, /qualifyStaffClockIn/);
  assert.doesNotMatch(clockIn, /input\.memberId|input\.clockSessionId/);

  assert.match(route, /getCalendarSession/);
  assert.match(route, /isSameOriginMutation/);
  assert.match(route, /staffClockActionSchema/);
});

test("Stage 6 relies on the database uniqueness invariant for repeated or concurrent clock-in", async () => {
  const migration = await source("drizzle/0026_staff_roster_attendance_leave.sql");

  assert.match(
    migration,
    /CREATE UNIQUE INDEX[\s\S]*staff_roster_clock_sessions_member_active_unique[\s\S]*WHERE "clock_out_at" IS NULL/,
  );
});

test("Stage 6 clock-out is one atomic own-session transition and repeated clock-out is not reported as success", async () => {
  const workforce = await source("lib/staff-rosters/workforce-service.ts");
  const clockOut = workforce.slice(
    workforce.indexOf("export async function clockOut"),
    workforce.indexOf("export async function getTimesheet"),
  );

  assert.match(clockOut, /WITH ended AS/);
  assert.match(clockOut, /UPDATE staff_roster_clock_sessions/);
  assert.match(clockOut, /calendar_id = \$\{session\.calendarId\}/);
  assert.match(clockOut, /member_id = \$\{current\.id\}/);
  assert.match(clockOut, /clock_out_at IS NULL/);
  assert.match(clockOut, /RETURNING entity_id AS "id"/);
  assert.match(clockOut, /if \(!ended\[0\]\)/);
  assert.match(clockOut, /"no_active_clock_session"/);
});

test("Stage 6 re-reads authoritative clock state after mutations and ambiguous network responses", async () => {
  const workspace = await source("components/staff-rosters/my-roster-page.tsx");

  assert.match(workspace, /Checking your clock status/);
  assert.match(workspace, /await refreshClock\(\)/);
  assert.match(workspace, /const authoritative = await refreshClock\(\)/);
  assert.match(
    workspace,
    /Covie refreshed your clock status after the connection response was unclear/,
  );
  assert.match(workspace, /setClock\(null\)/);
  assert.match(workspace, /Clocking in…/);
  assert.match(workspace, /Clocking out…/);
});

test("Stage 6 Staff workspace exposes bounded self-service without Manager structure actions", async () => {
  const [workspace, nav, route] = await Promise.all([
    source("components/staff-rosters/my-roster-page.tsx"),
    source("components/templates/template-workspace-nav.tsx"),
    source("components/templates/template-route.tsx"),
  ]);

  assert.match(workspace, /My time/);
  assert.match(workspace, /organiser\/timesheets/);
  assert.match(workspace, /Request or check leave/);
  assert.match(workspace, /organiser\/availability/);
  assert.match(workspace, /Roster updates/);
  assert.match(workspace, /staff-rosters\/updates/);
  assert.match(workspace, /Clock in without a rostered shift/);
  assert.doesNotMatch(workspace, /Publish roster|Copy previous week|Send updates|Roles & locations|Team management/);

  assert.match(nav, /staffMode \? "My roster" : "Calendar"/);
  assert.match(nav, /<span>Timesheet<\/span>/);
  assert.match(nav, /<span>Leave<\/span>/);
  assert.match(route, /staffAccessRole === "staff"/);
  assert.match(route, /activeToolKey !== "availability"/);
  assert.match(route, /activeToolKey !== "timesheets"/);
  assert.match(route, /redirect\("\/calendar-types\/staff-rosters"\)/);
});

test("Stage 6 own timesheet remains calendar and member bounded and uses published scheduled work", async () => {
  const workforce = await source("lib/staff-rosters/workforce-service.ts");
  const timesheet = workforce.slice(
    workforce.indexOf("export async function getTimesheet"),
    workforce.indexOf("export async function requestTimesheetCorrection"),
  );

  assert.match(timesheet, /staffRosterPublishedShifts/);
  assert.match(
    timesheet,
    /eq\(staffRosterWeekPublications\.calendarId, input\.session\.calendarId\)/,
  );
  assert.match(
    timesheet,
    /eq\(staffRosterClockSessions\.memberId, current\.id\)/,
  );
  assert.match(
    timesheet,
    /eq\(staffRosterPublishedShifts\.memberId, current\.id\)/,
  );
  assert.match(
    timesheet,
    /eq\(staffRosterClockSessions\.calendarId, input\.session\.calendarId\)/,
  );
});

test("Stage 6 production Staff surfaces contain no mock workforce records", async () => {
  const files = await Promise.all([
    source("components/staff-rosters/my-roster-page.tsx"),
    source("components/staff-rosters/timesheets-page.tsx"),
    source("components/staff-rosters/updates-page.tsx"),
  ]);

  for (const file of files) {
    assert.doesNotMatch(file, /Alex|Jordan|Sam|Main site|Second site/);
  }
});
