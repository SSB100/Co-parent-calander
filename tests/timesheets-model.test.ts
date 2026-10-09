import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_TIMESHEETS_INCREMENT, TIMESHEETS_INCREMENTS, timesheetsCommandSchema,
  timesheetsDateSchema, timesheetsTimezoneSchema, type TimesheetsEntry,
} from "../lib/timesheets/contracts";
import {
  normaliseTimesheetsTiming, resolveTimesheetsLocalTime, splitTimesheetsEntryByDay,
  timesheetsCsv, timesheetsCsvCell, timesheetsDateRange, timesheetsDayBounds,
  timesheetsDisambiguationForInstant, timesheetsLocalTime, timesheetsTotals,
  timesheetsWindow, validateTimesheetsDuration,
} from "../lib/timesheets/model";
import {
  assertTimesheetsEntryAccess, assertTimesheetsOwner, canManageTimesheetsProfile,
  canManageTimesheetsStaff, TimesheetsAccessError, type TimesheetsPolicyContext,
} from "../lib/timesheets/policy";

const staffId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const entryId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const otherId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const input = { staffId, clientId: null, projectId: null, startLocal: "2026-10-08T09:07", endLocal: "2026-10-08T09:22", notes: "Work", billable: false, organisationVersion: 1 };
const timing = { ...input, timezone: "UTC", incrementMinutes: 15 };
function entry(patch: Partial<TimesheetsEntry> = {}): TimesheetsEntry {
  return { id: entryId, staffId, workTypeId: null, workTypeName: null, clientId: null, projectId: null, start: "2026-10-08T09:07:00Z", end: "2026-10-08T09:22:00Z", timezone: "UTC", notes: "", billable: true, durationMinutes: 15, incrementMinutes: 15, version: 1, ...patch };
}

test("standalone commands have exact numeric increments and strict field boundaries", () => {
  assert.equal(DEFAULT_TIMESHEETS_INCREMENT, 15);
  assert.deepEqual(TIMESHEETS_INCREMENTS, [5, 10, 15, 30, 60]);
  for (const incrementMinutes of TIMESHEETS_INCREMENTS) assert.ok(timesheetsCommandSchema.safeParse({ action: "saveSettings", data: { name: "Company", timezone: "UTC", incrementMinutes, version: 1 } }).success);
  for (const incrementMinutes of [0, 1, 20, 14.9, "15", 90]) assert.equal(timesheetsCommandSchema.safeParse({ action: "saveSettings", data: { name: "Company", timezone: "UTC", incrementMinutes, version: 1 } }).success, false);
  assert.ok(timesheetsCommandSchema.safeParse({ action: "saveEntry", data: input }).success);
  for (const extra of [{ calendarId: otherId }, { durationMinutes: 15 }, { incrementMinutes: 5 }, { timezone: "UTC" }, { staffRosterId: otherId }]) {
    assert.equal(timesheetsCommandSchema.safeParse({ action: "saveEntry", data: { ...input, ...extra } }).success, false);
  }
  assert.equal(timesheetsCommandSchema.safeParse({ action: "saveEntry", data: input, owner: true }).success, false);
  for (const organisationVersion of [undefined, 0, -1, 1.5, "1"]) {
    assert.equal(timesheetsCommandSchema.safeParse({ action: "saveEntry", data: { ...input, organisationVersion } }).success, false);
  }
  const snapshot = timesheetsCommandSchema.parse({ action: "saveEntry", data: { ...input, id: entryId, version: 9, organisationVersion: 2 } });
  assert.equal(snapshot.action === "saveEntry" && snapshot.data.organisationVersion, 2, "Keep the loaded organisation snapshot separate from the entry revision.");
});

test("update commands require versions; ownership and project hierarchy cannot be smuggled", () => {
  assert.equal(timesheetsCommandSchema.safeParse({ action: "saveEntry", data: { ...input, id: entryId } }).success, false);
  assert.ok(timesheetsCommandSchema.safeParse({ action: "saveEntry", data: { ...input, id: entryId, version: 1 } }).success);
  assert.equal(timesheetsCommandSchema.safeParse({ action: "saveEntry", data: { ...input, projectId: otherId } }).success, false);
  const staff = { displayName: "Person", email: " Person@Example.com ", role: "member", active: true };
  const parsed = timesheetsCommandSchema.parse({ action: "saveStaff", data: staff });
  assert.equal(parsed.action === "saveStaff" && parsed.data.email, "person@example.com");
  assert.equal(timesheetsCommandSchema.safeParse({ action: "saveStaff", data: { ...staff, role: "owner" } }).success, false);
  assert.equal(timesheetsCommandSchema.safeParse({ action: "saveStaff", data: { ...staff, displayName: "x".repeat(101) } }).success, false);
  assert.equal(timesheetsCommandSchema.safeParse({ action: "saveEntry", data: { ...input, reason: " x " } }).success, false);
  assert.equal(timesheetsCommandSchema.safeParse({ action: "assignManager", data: { managerStaffId: staffId, staffId, assigned: true } }).success, false);
});

test("real date and timezone validation rejects normalised calendar errors", () => {
  for (const value of ["2026-02-29", "2026-02-30", "2026-13-01", "2026-1-01", "0000-01-01"]) assert.equal(timesheetsDateSchema.safeParse(value).success, false);
  assert.ok(timesheetsDateSchema.safeParse("2028-02-29").success);
  for (const value of ["", "Not/AZone", "+12:00"]) assert.equal(timesheetsTimezoneSchema.safeParse(value).success, false);
  for (const value of ["2026-10-08T24:00", "2026-10-08T09:07:30", "2026-10-08T09:07Z", "2026-02-30T09:00"]) {
    assert.throws(() => resolveTimesheetsLocalTime(value, "UTC"));
  }
});

test("duration increments apply to elapsed length, without snapping start or end", () => {
  assert.deepEqual(normaliseTimesheetsTiming(timing), { start: "2026-10-08T09:07:00.000Z", end: "2026-10-08T09:22:00.000Z", timezone: "UTC", durationMinutes: 15, incrementMinutes: 15 });
  assert.throws(() => normaliseTimesheetsTiming({ ...timing, endLocal: "2026-10-08T09:23" }), /exact multiple/);
  assert.equal(validateTimesheetsDuration("2026-10-08T09:07:00Z", "2026-10-08T09:22:00Z", 5), 15);
  for (const end of ["2026-10-08T09:07:00Z", "2026-10-08T09:06:00Z", "2026-10-08T09:22:01Z", "2026-10-08T09:22:00.001Z", "2026-10-09T09:12:00Z"]) {
    assert.throws(() => validateTimesheetsDuration("2026-10-08T09:07:00Z", end, 5));
  }
  assert.equal(validateTimesheetsDuration("2026-10-08T09:07:00Z", "2026-10-09T09:07:00Z", 60), 1440);
  assert.throws(() => validateTimesheetsDuration("2026-10-08T09:07:01Z", "2026-10-08T09:22:01Z", 15), /whole minutes/);
  assert.throws(() => validateTimesheetsDuration("2026-10-08T09:07", "2026-10-08T09:22", 15), /timezone offset/);
  assert.throws(() => validateTimesheetsDuration("2026-02-30T09:07:00Z", "2026-03-02T09:22:00Z", 15));
});

test("spring gaps are rejected and fall repeats require explicit disambiguation", () => {
  assert.throws(() => resolveTimesheetsLocalTime("2026-03-08T02:30", "America/New_York"), /does not exist/);
  assert.throws(() => resolveTimesheetsLocalTime("2026-11-01T01:30", "America/New_York"), /occurs twice/);
  assert.equal(resolveTimesheetsLocalTime("2026-11-01T01:30", "America/New_York", "earlier"), "2026-11-01T05:30:00.000Z");
  assert.equal(resolveTimesheetsLocalTime("2026-11-01T01:30", "America/New_York", "later"), "2026-11-01T06:30:00.000Z");
  const fold = normaliseTimesheetsTiming({ startLocal: "2026-11-01T01:30", endLocal: "2026-11-01T01:30", timezone: "America/New_York", startDisambiguation: "earlier", endDisambiguation: "later", incrementMinutes: 15 });
  assert.equal(fold.durationMinutes, 60);
  assert.equal(timesheetsDisambiguationForInstant(fold.start, fold.timezone), "earlier");
  assert.equal(timesheetsDisambiguationForInstant(fold.end, fold.timezone), "later");
  assert.equal(timesheetsDisambiguationForInstant("2026-10-08T09:07:00Z", "UTC"), undefined);
});

test("DST durations use elapsed minutes and enforce the 24-hour cap on long local days", () => {
  assert.equal(normaliseTimesheetsTiming({ ...timing, timezone: "America/New_York", startLocal: "2026-03-08T01:30", endLocal: "2026-03-08T03:30" }).durationMinutes, 60);
  assert.equal(normaliseTimesheetsTiming({ ...timing, timezone: "America/New_York", startLocal: "2026-03-08T00:00", endLocal: "2026-03-09T00:00" }).durationMinutes, 1380);
  assert.throws(() => normaliseTimesheetsTiming({ ...timing, timezone: "America/New_York", startLocal: "2026-11-01T00:00", endLocal: "2026-11-02T00:00" }), /24 elapsed hours/);
});

test("half-hour DST changes and quarter-hour standard offsets resolve exactly", () => {
  assert.throws(() => resolveTimesheetsLocalTime("2026-10-04T02:15", "Australia/Lord_Howe"), /does not exist/);
  assert.throws(() => resolveTimesheetsLocalTime("2026-04-05T01:45", "Australia/Lord_Howe"), /occurs twice/);
  const earlier = resolveTimesheetsLocalTime("2026-04-05T01:45", "Australia/Lord_Howe", "earlier");
  const later = resolveTimesheetsLocalTime("2026-04-05T01:45", "Australia/Lord_Howe", "later");
  assert.equal(Date.parse(later) - Date.parse(earlier), 30 * 60_000);
  assert.equal(resolveTimesheetsLocalTime("2026-10-08T09:07", "Asia/Kathmandu"), "2026-10-08T03:22:00.000Z");
});

test("settings changes preserve an unchanged entry's increment and timezone snapshots", () => {
  const existing = entry();
  const original = JSON.stringify(existing);
  assert.deepEqual(normaliseTimesheetsTiming({ ...timing, incrementMinutes: 60, existing }), {
    start: "2026-10-08T09:07:00.000Z", end: "2026-10-08T09:22:00.000Z", timezone: "UTC", durationMinutes: 15, incrementMinutes: 15,
  });
  const switched = normaliseTimesheetsTiming({ ...timing, timezone: "Pacific/Auckland", startLocal: "2026-10-08T22:07", endLocal: "2026-10-08T22:22", incrementMinutes: 60, existing });
  assert.equal(switched.timezone, "UTC"); assert.equal(switched.incrementMinutes, 15);
  assert.throws(() => normaliseTimesheetsTiming({ ...timing, incrementMinutes: 60, startLocal: "2026-10-08T09:08", endLocal: "2026-10-08T09:23", existing }), /exact multiple of 60/);
  assert.equal(normaliseTimesheetsTiming({ ...timing, incrementMinutes: 60, endLocal: "2026-10-08T10:07", existing }).incrementMinutes, 60);
  assert.equal(JSON.stringify(existing), original);
});

test("Monday weeks and day boundaries use actual timezone instants", () => {
  assert.deepEqual(timesheetsDateRange("2026-10-11", "week"), { first: "2026-10-05", next: "2026-10-12", dates: ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"] });
  assert.deepEqual(timesheetsDateRange("2028-02-29", "day"), { first: "2028-02-29", next: "2028-03-01", dates: ["2028-02-29"] });
  const short = timesheetsWindow("2026-03-08", "day", "America/New_York");
  const long = timesheetsWindow("2026-11-01", "day", "America/New_York");
  assert.equal((Date.parse(short.end) - Date.parse(short.start)) / 60_000, 1380);
  assert.equal((Date.parse(long.end) - Date.parse(long.start)) / 60_000, 1500);
  const skipped = timesheetsDayBounds("2011-12-30", "Pacific/Apia");
  assert.equal(skipped.start, skipped.end);
  assert.throws(() => resolveTimesheetsLocalTime("2011-12-30T12:00", "Pacific/Apia"), /does not exist/);
  assert.equal(timesheetsLocalTime("2026-10-07T20:07:00Z", "Pacific/Auckland"), "2026-10-08T09:07");
});

test("daily allocations split real midnight overlap without rounding to the entry increment", () => {
  const record = entry({ start: "2026-10-08T23:52:00Z", end: "2026-10-09T00:07:00Z" });
  assert.deepEqual(splitTimesheetsEntryByDay(record, "UTC"), [{ date: "2026-10-08", totalMinutes: 8, billableMinutes: 8 }, { date: "2026-10-09", totalMinutes: 7, billableMinutes: 7 }]);
  assert.deepEqual(splitTimesheetsEntryByDay({ ...record, billable: false }, "UTC").map(row => row.billableMinutes), [0, 0]);
  assert.deepEqual(splitTimesheetsEntryByDay(entry({ start: "2026-10-08T23:45:00Z", end: "2026-10-09T00:00:00Z" }), "UTC"), [{ date: "2026-10-08", totalMinutes: 15, billableMinutes: 15 }]);
  assert.deepEqual(splitTimesheetsEntryByDay(record, "Pacific/Auckland"), [{ date: "2026-10-09", totalMinutes: 15, billableMinutes: 15 }]);
});

test("daily and weekly totals sum only elapsed overlap, retaining separate staff and billable totals", () => {
  const records = [entry({ start: "2026-10-11T23:52:00Z", end: "2026-10-12T00:07:00Z" }), entry({ id: otherId, staffId: otherId, start: "2026-10-12T09:07:00Z", end: "2026-10-12T09:22:00Z", billable: false })];
  assert.deepEqual(timesheetsTotals(records, { date: "2026-10-11", view: "week", timezone: "UTC" }), [{ staffId, totalMinutes: 8, billableMinutes: 8 }]);
  assert.deepEqual(timesheetsTotals(records, { date: "2026-10-12", view: "day", timezone: "UTC" }), [{ staffId, totalMinutes: 7, billableMinutes: 7 }, { staffId: otherId, totalMinutes: 15, billableMinutes: 0 }]);
  assert.deepEqual(timesheetsTotals([], { date: "2026-10-12", view: "week", timezone: "UTC" }), []);
});

test("DST report allocation preserves both repeated hours and non-contiguous historical dates", () => {
  const folded = entry({ start: "2026-11-01T04:00:00Z", end: "2026-11-02T04:00:00Z" });
  assert.deepEqual(splitTimesheetsEntryByDay(folded, "America/New_York"), [{ date: "2026-11-01", totalMinutes: 1440, billableMinutes: 1440 }]);
  const midnightFold = entry({ start: "1988-10-30T01:00:00Z", end: "1988-10-30T04:00:00Z" });
  assert.deepEqual(splitTimesheetsEntryByDay(midnightFold, "America/St_Johns"), [{ date: "1988-10-29", totalMinutes: 149, billableMinutes: 149 }, { date: "1988-10-30", totalMinutes: 31, billableMinutes: 31 }]);
  const window = timesheetsWindow("1988-10-29", "day", "America/St_Johns");
  assert.equal(window.end, "1988-10-30T03:30:00.000Z", "fetch through the last ending midnight before exact date filtering");
  assert.deepEqual(timesheetsTotals([midnightFold], { date: "1988-10-29", view: "day", timezone: "America/St_Johns" }), [{ staffId, totalMinutes: 149, billableMinutes: 149 }]);
});

test("CSV escapes cells and neutralises formulas including whitespace/control prefixes", () => {
  for (const text of ["=HYPERLINK(\"https://invalid\")", "+SUM(A1)", "-1+1", "@SUM(A1)", "  =1+1", "\t=1+1", "\rplain", "\nplain"]) assert.ok(timesheetsCsvCell(text).startsWith('"\''));
  assert.equal(timesheetsCsvCell('A "quoted", value\nsecond line'), '"A ""quoted"", value\nsecond line"');
  assert.equal(timesheetsCsv([["Staff", "Minutes"], ["A, B", 15], [null, false]]), '"Staff","Minutes"\r\n"A, B","15"\r\n"","false"\r\n');
});

const assignments = [{ managerStaffId: staffId, staffId: otherId }];
const manager: TimesheetsPolicyContext = { role: "manager", ownStaffId: staffId, assignments };
const member: TimesheetsPolicyContext = { role: "member", ownStaffId: staffId, assignments };
const owner: TimesheetsPolicyContext = { role: "owner", ownStaffId: staffId, assignments: [] };

test("entry scope separates owner, assigned managers and members and never borrows another manager's assignment", () => {
  assert.equal(canManageTimesheetsStaff(owner, otherId), true);
  assert.equal(canManageTimesheetsStaff(manager, staffId), true);
  assert.equal(canManageTimesheetsStaff(manager, otherId), true);
  assert.equal(canManageTimesheetsStaff(manager, entryId), false);
  assert.equal(canManageTimesheetsStaff({ ...manager, ownStaffId: entryId }, otherId), false);
  assert.equal(canManageTimesheetsStaff(member, staffId), true);
  assert.equal(canManageTimesheetsStaff(member, otherId), false);
  assert.equal(canManageTimesheetsStaff({ ...member, ownStaffId: null }, staffId), false);
  assert.equal(canManageTimesheetsStaff(owner, ""), false);
  assert.doesNotThrow(() => assertTimesheetsOwner("owner"));
  assert.throws(() => assertTimesheetsOwner("manager"), TimesheetsAccessError);
});

test("all other-person entry mutations need a reason, and reassignment checks both sides", () => {
  for (const context of [manager, owner]) {
    for (const existing of [undefined, true, { staffId: otherId }]) {
      assert.throws(() => assertTimesheetsEntryAccess(context, otherId, { existing }), /reason/);
      assert.throws(() => assertTimesheetsEntryAccess(context, otherId, { existing, reason: " x " }), /reason/);
      assert.doesNotThrow(() => assertTimesheetsEntryAccess(context, otherId, { existing, reason: "Corrected time" }));
    }
  }
  assert.doesNotThrow(() => assertTimesheetsEntryAccess(member, staffId));
  assert.throws(() => assertTimesheetsEntryAccess(member, staffId, { existing: { staffId: otherId }, reason: "Move entry" }), TimesheetsAccessError);
  assert.throws(() => assertTimesheetsEntryAccess(manager, staffId, { existing: { staffId: entryId }, reason: "Move entry" }), TimesheetsAccessError);
});

test("profile administration is narrower than entry scope and owner role cannot be reassigned", () => {
  assert.equal(canManageTimesheetsProfile(owner, { id: otherId, role: "manager" }, "member"), true);
  assert.equal(canManageTimesheetsProfile(owner, { id: staffId, role: "owner" }, "member"), false);
  assert.equal(canManageTimesheetsProfile(owner, { id: otherId, role: "member" }, "owner"), false);
  assert.equal(canManageTimesheetsProfile(manager, { id: otherId, role: "member" }), true);
  assert.equal(canManageTimesheetsProfile(manager, { id: otherId, role: "member" }, "manager"), false);
  assert.equal(canManageTimesheetsProfile(manager, { id: otherId, role: "manager" }), false);
  assert.equal(canManageTimesheetsProfile(manager, { id: staffId, role: "manager" }), false);
  assert.equal(canManageTimesheetsProfile(member, { id: staffId, role: "member" }), false);
});


test("custom work type commands validate labels, versions and trusted snapshots", () => {
  assert.ok(timesheetsCommandSchema.safeParse({ action: "saveWorkType", data: { name: "Lunch breaks", active: true } }).success);
  for (const name of ["", "  ", "x".repeat(121)]) assert.equal(timesheetsCommandSchema.safeParse({ action: "saveWorkType", data: { name, active: true } }).success, false);
  assert.equal(timesheetsCommandSchema.safeParse({ action: "saveWorkType", data: { id: otherId, name: "Meetings", active: true } }).success, false);
  assert.equal(timesheetsCommandSchema.safeParse({ action: "saveWorkType", data: { name: "Meetings", active: true, organisationId: otherId } }).success, false);
  for (const workTypeId of [undefined, null, otherId]) assert.ok(timesheetsCommandSchema.safeParse({ action: "saveEntry", data: { ...input, workTypeId } }).success);
  for (const extra of [{ workTypeId: "invalid" }, { workTypeName: "Forged label" }]) assert.equal(timesheetsCommandSchema.safeParse({ action: "saveEntry", data: { ...input, ...extra } }).success, false);
});
