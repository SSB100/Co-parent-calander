import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  instantFromLocalDateTimeInTimeZone,
  localDateTimeInputInTimeZone,
  mondayWeekStartInTimeZone,
} from "../lib/calendar/time";
import { staffRosterCapabilities } from "../lib/staff-rosters/capabilities";
import { classifyTimesheetSession } from "../lib/staff-rosters/timesheet-policy";
import {
  staffTimesheetCorrectionReviewSchema,
  staffTimesheetCorrectionSchema,
  staffTimesheetManagerCorrectionSchema,
} from "../lib/staff-rosters/workforce-contracts";

const root = process.cwd();

async function source(file: string) {
  return readFile(path.join(root, file), "utf8");
}

test("Stage 7 preserves Staff viewer and Manager editor timesheet authority", () => {
  const staff = staffRosterCapabilities({
    accessRole: "staff",
    permission: "viewer",
  });
  const manager = staffRosterCapabilities({
    accessRole: "manager",
    permission: "editor",
  });

  assert.equal(staff.requestOwnTimesheetCorrection, true);
  assert.equal(staff.reviewTimesheets, false);
  assert.equal(manager.reviewTimesheets, true);
});

test("Stage 7 converts datetime-local values using the roster calendar timezone", () => {
  const instant = instantFromLocalDateTimeInTimeZone(
    "Pacific/Auckland",
    "2026-09-23T09:30",
  );

  assert.equal(instant.toISOString(), "2026-09-22T21:30:00.000Z");
  assert.equal(
    localDateTimeInputInTimeZone("Pacific/Auckland", instant),
    "2026-09-23T09:30",
  );
  assert.equal(
    mondayWeekStartInTimeZone(
      "Pacific/Auckland",
      new Date("2026-09-27T00:30:00.000Z"),
    ),
    "2026-09-21",
  );
});

test("Stage 7 distinguishes an active current session from a historical missing clock-out", () => {
  const now = new Date("2026-09-23T02:00:00.000Z");

  assert.equal(
    classifyTimesheetSession({
      clockInAt: "2026-09-22T21:00:00.000Z",
      clockOutAt: null,
      scheduledDate: "2026-09-23",
      timeZone: "Pacific/Auckland",
      now,
    }),
    "in_progress",
  );

  assert.equal(
    classifyTimesheetSession({
      clockInAt: "2026-09-21T21:00:00.000Z",
      clockOutAt: null,
      scheduledDate: "2026-09-22",
      timeZone: "Pacific/Auckland",
      now,
    }),
    "missing_clock_out",
  );
});

test("Stage 7 mutation contracts strip browser-supplied Staff identity", () => {
  const correction = staffTimesheetCorrectionSchema.parse({
    clockSessionId: "00000000-0000-4000-8000-000000000001",
    requestedClockOutAt: "2026-09-23T05:00:00.000Z",
    reason: "Missed the finish time.",
    memberId: "00000000-0000-4000-8000-000000000002",
    calendarId: "00000000-0000-4000-8000-000000000003",
  });
  const review = staffTimesheetCorrectionReviewSchema.parse({
    correctionId: "00000000-0000-4000-8000-000000000004",
    decision: "approved",
    memberId: "00000000-0000-4000-8000-000000000002",
  });
  const manager = staffTimesheetManagerCorrectionSchema.parse({
    clockSessionId: "00000000-0000-4000-8000-000000000005",
    clockInAt: "2026-09-23T01:00:00.000Z",
    clockOutAt: "2026-09-23T05:00:00.000Z",
    memberId: "00000000-0000-4000-8000-000000000002",
  });

  assert.equal("memberId" in correction, false);
  assert.equal("calendarId" in correction, false);
  assert.equal("memberId" in review, false);
  assert.equal("memberId" in manager, false);
});

test("Stage 7 own Timesheets remain calendar/member bounded and compare published roster snapshots", async () => {
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
    /eq\(staffRosterClockSessions\.calendarId, input\.session\.calendarId\)/,
  );
  assert.match(
    timesheet,
    /eq\(staffRosterClockSessions\.memberId, current\.id\)/,
  );
  assert.match(
    timesheet,
    /eq\(staffRosterTimesheetCorrections\.memberId, current\.id\)/,
  );
  assert.doesNotMatch(timesheet, /staffRosterShifts/);
});

test("Stage 7 correction creation is own-session bounded, rejects no-op state and serializes duplicates", async () => {
  const workforce = await source("lib/staff-rosters/workforce-service.ts");
  const request = workforce.slice(
    workforce.indexOf("export async function requestTimesheetCorrection"),
    workforce.indexOf("export async function reviewTimesheetCorrection"),
  );

  assert.match(request, /clock_session\.calendar_id = \$\{input\.session\.calendarId\}/);
  assert.match(request, /clock_session\.member_id = \$\{current\.id\}/);
  assert.match(request, /pg_advisory_xact_lock/);
  assert.match(request, /existing_pending/);
  assert.match(request, /qualified\.has_change/);
  assert.match(request, /'no_change'/);
  assert.match(request, /effective_clock_out_at > qualified\.effective_clock_in_at/);
  assert.match(request, /staff_roster\.timesheet_correction\.request/);
  assert.match(request, /before_state, after_state/);
});

test("Stage 7 Manager review has one atomic pending transition winner", async () => {
  const workforce = await source("lib/staff-rosters/workforce-service.ts");
  const review = workforce.slice(
    workforce.indexOf("export async function reviewTimesheetCorrection"),
    workforce.indexOf("export async function correctTimesheetSession"),
  );

  assert.match(review, /pg_advisory_xact_lock/);
  assert.match(review, /correction\.status = 'pending'/);
  assert.match(review, /FROM transitioned/);
  assert.match(review, /WHERE \$\{input\.decision\}::text = 'approved'/);
  assert.match(review, /FROM transitioned[\s\S]*staff_roster\.timesheet_correction\.review/);
  assert.match(review, /already_reviewed/);
});

test("Stage 7 direct Manager correction is calendar bounded and supersedes pending requests audibly", async () => {
  const workforce = await source("lib/staff-rosters/workforce-service.ts");
  const direct = workforce.slice(
    workforce.indexOf("export async function correctTimesheetSession"),
    workforce.indexOf("export async function getLeaveRequests"),
  );

  assert.match(direct, /pg_advisory_xact_lock/);
  assert.match(direct, /clock_session\.calendar_id = \$\{input\.session\.calendarId\}/);
  assert.match(direct, /status = 'cancelled'/);
  assert.match(direct, /staff_roster\.timesheet_correction\.supersede/);
  assert.match(direct, /staff_roster\.timesheet\.manager_correct/);
  assert.doesNotMatch(direct, /DELETE FROM staff_roster_clock_sessions/);
});

test("Stage 7 routes retain same-origin mutation protection and authoritative session lookup", async () => {
  const [timesheetRoute, correctionRoute] = await Promise.all([
    source("app/api/staff-roster/timesheet/route.ts"),
    source("app/api/staff-roster/timesheet-corrections/route.ts"),
  ]);

  assert.match(timesheetRoute, /isSameOriginMutation/);
  assert.match(timesheetRoute, /getCalendarSession/);
  assert.match(timesheetRoute, /mondayWeekStartInTimeZone/);
  assert.match(correctionRoute, /isSameOriginMutation/);
  assert.match(correctionRoute, /getCalendarSession/);
});

test("Stage 7 Timesheet UI uses roster timezone inputs, current-session language and correction status", async () => {
  const page = await source("components/staff-rosters/timesheets-page.tsx");

  assert.match(page, /instantFromLocalDateTimeInTimeZone/);
  assert.match(page, /localDateTimeInputInTimeZone/);
  assert.match(page, /mondayWeekStartInTimeZone/);
  assert.match(page, /In progress/);
  assert.match(page, /Missing clock-out/);
  assert.match(page, /Correction pending/);
  assert.match(page, /Original recorded time/);
  assert.match(page, /Reviewed corrections/);
  assert.doesNotMatch(page, /getTimezoneOffset/);
  assert.doesNotMatch(page, /new Date\(requestedIn\)\.toISOString/);
  assert.doesNotMatch(page, /new Date\(managerClockIn\)\.toISOString/);
  assert.doesNotMatch(page, /Forgot to clock out/);
});

test("Stage 7 production Timesheet surfaces contain no mock workforce records", async () => {
  const files = await Promise.all([
    source("components/staff-rosters/timesheets-page.tsx"),
    source("lib/staff-rosters/workforce-service.ts"),
  ]);

  for (const file of files) {
    assert.doesNotMatch(file, /Alex|Jordan|Sam|Main site|Second site/);
  }
});
