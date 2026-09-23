import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { staffRosterCapabilities } from "../lib/staff-rosters/capabilities";
import {
  staffAvailabilityRangeSchema,
  staffAvailabilitySchema,
  staffShiftSchema,
} from "../lib/staff-rosters/contracts";
import {
  staffLeaveRequestSchema,
  staffLeaveReviewSchema,
} from "../lib/staff-rosters/workforce-contracts";

const root = process.cwd();
const memberId = "00000000-0000-4000-8000-000000000001";
const otherId = "00000000-0000-4000-8000-000000000002";

async function source(file: string) {
  return readFile(path.join(root, file), "utf8");
}

function section(text: string, start: string, end: string) {
  const from = text.indexOf(start);
  const to = text.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `Expected section ${start} before ${end}`);
  return text.slice(from, to);
}

test("Stage 8 grants staff own availability and leave, with team actions reserved for writable managers", () => {
  for (const permission of ["viewer", "editor", "owner"] as const) {
    const staff = staffRosterCapabilities({ accessRole: "staff", permission });
    assert.equal(staff.editOwnAvailability, true);
    assert.equal(staff.requestOwnLeave, true);
    assert.equal(staff.manageAllAvailability, false);
    assert.equal(staff.reviewLeave, false);
    assert.equal(staff.createShifts, false);
  }

  for (const accessRole of ["manager", "owner"] as const) {
    const viewer = staffRosterCapabilities({ accessRole, permission: "viewer" });
    const editor = staffRosterCapabilities({ accessRole, permission: "editor" });
    assert.equal(viewer.manageAllAvailability, false);
    assert.equal(viewer.reviewLeave, false);
    assert.equal(viewer.createShifts, false);
    assert.equal(editor.manageAllAvailability, true);
    assert.equal(editor.reviewLeave, true);
    assert.equal(editor.createShifts, true);
  }
});

test("Stage 8 validates local date and time ranges at the request boundary", () => {
  const base = {
    memberId,
    date: "2026-09-23",
    status: "unavailable" as const,
    startTime: "09:00",
    endTime: "12:00",
  };
  assert.deepEqual(staffAvailabilitySchema.parse({ ...base, note: "  Busy  " }), {
    ...base,
    note: "Busy",
  });
  assert.equal(staffAvailabilitySchema.parse({ ...base, startTime: "", endTime: "" }).startTime, null);
  assert.equal(staffAvailabilitySchema.safeParse({ ...base, startTime: "09:00", endTime: "" }).success, false);
  assert.equal(staffAvailabilitySchema.safeParse({ ...base, endTime: "09:00" }).success, false);
  assert.equal(staffAvailabilitySchema.safeParse({ ...base, date: "2026-02-30" }).success, false);
  assert.equal(staffAvailabilityRangeSchema.safeParse({ from: "2026-09-24", to: "2026-09-23" }).success, false);

  const leave = { startDate: "2026-09-23", endDate: "2026-09-24", allDay: false, startTime: "09:00", endTime: "12:00" };
  assert.equal(staffLeaveRequestSchema.safeParse(leave).success, true);
  assert.equal(staffLeaveRequestSchema.safeParse({ ...leave, endTime: "09:00" }).success, false);
  assert.equal(staffLeaveRequestSchema.safeParse({ ...leave, endDate: "2026-09-22" }).success, false);
  assert.equal(staffLeaveRequestSchema.safeParse({ ...leave, allDay: true }).success, false);
});

test("Stage 8 mutation contracts discard caller-supplied calendar and actor identity", () => {
  const availability = staffAvailabilitySchema.parse({
    memberId, date: "2026-09-23", status: "unavailable", startTime: null, endTime: null,
    calendarId: otherId, actorMemberId: otherId,
  });
  const leave = staffLeaveRequestSchema.parse({
    startDate: "2026-09-23", endDate: "2026-09-23", allDay: true,
    calendarId: otherId, memberId: otherId,
  });
  const review = staffLeaveReviewSchema.parse({
    leaveRequestId: memberId, decision: "approved", calendarId: otherId, memberId: otherId,
  });
  const shift = staffShiftSchema.parse({
    memberId, date: "2026-09-23", startTime: "09:00", endTime: "12:00",
    calendarId: otherId, actorMemberId: otherId,
  });
  for (const parsed of [availability, leave, review, shift]) {
    assert.equal("calendarId" in parsed, false);
    assert.equal("actorMemberId" in parsed, false);
  }
  assert.equal("memberId" in leave, false);
  assert.equal("memberId" in review, false);
  assert.equal(shift.overrideAvailabilityConflict, false);
  assert.equal(staffShiftSchema.parse({
    memberId, date: "2026-09-23", startTime: "09:00", endTime: "12:00",
    overrideAvailabilityConflict: true,
  }).overrideAvailabilityConflict, true);
});

test("Stage 8 availability reads and mutations bind the selected calendar, active target and own-member rights", async () => {
  const service = await source("lib/staff-rosters/service.ts");
  const read = section(service, "export async function getAvailability", "export async function createAvailability");
  const create = section(service, "export async function createAvailability", "export async function deleteAvailability");
  const remove = section(service, "export async function deleteAvailability", "export async function getRosterSetup");

  assert.match(read, /eq\(staffRosterAvailability\.calendarId, input\.session\.calendarId\)/);
  assert.match(read, /: eq\(staffRosterAvailability\.memberId, current\.id\)/);
  assert.match(read, /canManageAll: capabilities\.manageAllAvailability/);
  assert.match(read, /calendarTimezone: input\.session\.calendarTimezone/);
  assert.match(create, /!capabilities\.manageAllAvailability && input\.memberId !== actor\.id/);
  assert.match(create, /eq\(staffRosterMembers\.calendarId, input\.session\.calendarId\)/);
  assert.match(create, /eq\(staffRosterMembers\.active, true\)/);
  assert.match(create, /target\.active = true/);
  assert.match(remove, /calendar_id = \$\{input\.session\.calendarId\}/);
  assert.match(remove, /capabilities\.manageAllAvailability[\s\S]*member_id = \$\{actor\.id\}/);
});

test("Stage 8 availability overlap and deletion use database winner rows for audit", async () => {
  const service = await source("lib/staff-rosters/service.ts");
  const create = section(service, "export async function createAvailability", "export async function deleteAvailability");
  const remove = section(service, "export async function deleteAvailability", "export async function getRosterSetup");

  assert.match(create, /sql\.transaction\(\[/);
  assert.match(create, /pg_advisory_xact_lock/);
  assert.match(create, /NOT EXISTS \([\s\S]*existing\.calendar_id = \$\{input\.session\.calendarId\}[\s\S]*existing\.member_id = target\.id AND existing\.availability_date = \$\{input\.date\}/);
  assert.match(create, /existing\.start_time IS NULL OR \$\{input\.startTime\}::time IS NULL/);
  assert.match(create, /existing\.start_time < \$\{input\.endTime\}::time AND existing\.end_time > \$\{input\.startTime\}::time/);
  assert.match(create, /FROM created/);
  assert.match(create, /if \(!result\[1\]\[0\]\)/);
  assert.match(remove, /WITH removed AS \([\s\S]*DELETE FROM staff_roster_availability[\s\S]*RETURNING \*/);
  assert.match(remove, /FROM removed/);
  assert.match(remove, /if \(!removed\[0\]\)/);
});

test("Stage 8 leave changes bind the authenticated member and audit only changed rows", async () => {
  const workforce = await source("lib/staff-rosters/workforce-service.ts");
  const read = section(workforce, "export async function getLeaveRequests", "export async function createLeaveRequest");
  const request = section(workforce, "export async function createLeaveRequest", "export async function cancelLeaveRequest");
  const cancel = section(workforce, "export async function cancelLeaveRequest", "export async function reviewLeaveRequest");
  const review = workforce.slice(workforce.indexOf("export async function reviewLeaveRequest"));

  assert.match(read, /eq\(staffRosterLeaveRequests\.calendarId, input\.session\.calendarId\)/);
  assert.match(read, /capabilities\.reviewLeave[\s\S]*: eq\(staffRosterLeaveRequests\.memberId, current\.id\)/);
  assert.match(read, /calendarTimezone: input\.session\.calendarTimezone/);
  assert.doesNotMatch(read, /reviewedByMembershipId:|reviewerName:/);
  assert.match(request, /sql\.transaction\(\[/);
  assert.match(request, /pg_advisory_xact_lock/);
  assert.match(request, /existing\.status = 'pending'/);
  assert.match(request, /existing\.member_id = \$\{current\.id\}/);
  assert.match(request, /FROM created/);
  assert.match(cancel, /member_id = \$\{current\.id\}/);
  assert.match(cancel, /FOR UPDATE/);
  assert.match(cancel, /request\.status IN \('pending', 'approved'\)/);
  assert.match(cancel, /FROM changed/);
  assert.match(review, /if \(!capabilities\.reviewLeave\)/);
  assert.match(review, /calendar_id = \$\{input\.session\.calendarId\}/);
  assert.match(review, /FOR UPDATE/);
  assert.match(review, /request\.status = 'pending' AND original\.status = 'pending'/);
  assert.match(review, /FROM changed/);
});

test("Stage 8 roster conflicts distinguish pending warning, approved block and inactive leave", async () => {
  const service = await source("lib/staff-rosters/service.ts");
  const conflicts = section(service, "async function shiftConflictState", "export async function getRosterWeek");
  const create = section(service, "export async function createShift", "export async function updateShift");
  const update = section(service, "export async function updateShift", "export async function deleteShift");

  assert.match(conflicts, /staffRosterLeaveRequests\.status\} IN \('pending', 'approved'\)/);
  assert.match(conflicts, /approvedLeave: leave\.filter\(\(item\) => item\.status === "approved"\)/);
  assert.match(conflicts, /pendingLeave: leave\.filter\(\(item\) => item\.status === "pending"\)/);
  for (const mutation of [create, update]) {
    assert.match(mutation, /if \(conflicts\.approvedLeave\.length > 0\)/);
    assert.match(mutation, /"approved_leave_conflict"/);
    assert.match(mutation, /conflicts\.pendingLeave\.length > 0\) &&[\s\S]*!input\.overrideAvailabilityConflict/);
    assert.match(mutation, /"pending_leave_conflict" : "availability_conflict"/);
    assert.match(mutation, /availability_override =|availability_override,/);
    assert.match(mutation, /conflicts\.unavailable\.length > 0 \|\| conflicts\.pendingLeave\.length > 0/);
    assert.doesNotMatch(mutation, /staff_roster_published_shifts|staff_roster_clock_sessions/);
  }
});

test("Stage 8 routes require selected calendar session and same-origin mutations", async () => {
  for (const file of [
    "app/api/staff-roster/availability/route.ts",
    "app/api/staff-roster/leave/route.ts",
    "app/api/staff-roster/shifts/route.ts",
  ]) {
    const route = await source(file);
    assert.match(route, /getCalendarSession/);
    assert.match(route, /isSameOriginMutation/);
  }
});
