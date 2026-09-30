import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { facilityDefaults, type FacilityBooking, type FacilityData } from "../lib/shared-facilities/contracts";
import { createFacilitySlotSubmission, facilityDurationOptions, facilityMonthDays, facilitySelectionReady, facilitySlotPlan, facilitySlotProblem, shiftFacilityMonth, type FacilitySelection } from "../components/shared-facilities/facility-slots";

const now = new Date("2026-10-10T00:00:00Z");
const selection: FacilitySelection = { calendarId: "calendar-a", date: "2026-10-12", resourceId: "room-a" };
function fixture(patch: Partial<FacilityData> = {}): FacilityData {
  return { calendarId: "calendar-a", date: "2026-10-12", timezone: "UTC", owner: false, role: "member", managedResourceIds: [], canBook: true, resources: ["room-a", "room-b"].map((id) => ({ id, name: id, active: true, location: "", description: "", capacity: null })), bookings: [], rules: { ...facilityDefaults, openMinute: 480, closeMinute: 720 }, updates: [], ...patch };
}
function booking(start: string, end: string, patch: Partial<FacilityBooking> = {}): FacilityBooking {
  return { id: `${start}-${end}`, resourceId: "room-a", title: "", notes: "", start: `2026-10-12T${start}:00Z`, end: `2026-10-12T${end}:00Z`, status: "confirmed", own: false, canManage: false, version: 1, ...patch };
}
const at = (data: FacilityData, time: string, duration = 30) => facilitySlotPlan(data, selection, duration, now).slots.find((slot) => slot.start === `${selection.date}T${time}`);

test("slots belong to the loaded calendar, selected resource and selected day", () => {
  const data = fixture();
  assert.equal(facilitySelectionReady(data, selection), true);
  for (const patch of [{ calendarId: "calendar-b" }, { date: "2026-10-13" }, { resourceId: "room-c" }, { resourceId: "" }]) {
    assert.equal(facilitySelectionReady(data, { ...selection, ...patch }), false);
    assert.equal(facilitySlotPlan(data, { ...selection, ...patch }, 30, now).slots.length, 0);
  }
  assert.equal(facilitySlotPlan(fixture({ resources: [{ ...data.resources[0], active: false }] }), selection, 30, now).slots.length, 0);
  const slot = at(data, "08:00")!;
  assert.match(facilitySlotProblem(data, { ...selection, date: "2026-10-13" }, slot, now), /selected day or resource changed/);
  assert.match(facilitySlotProblem(data, { ...selection, resourceId: "room-b" }, slot, now), /selected day or resource changed/);
});

test("confirmed occupancy uses half-open intervals and all overlapping shapes", () => {
  const data = fixture({ bookings: [booking("09:00", "10:00")] });
  assert.equal(at(data, "08:30")?.available, true);
  assert.equal(at(data, "08:45")?.available, false);
  assert.equal(at(data, "09:00")?.available, false);
  assert.equal(at(data, "09:30")?.available, false);
  assert.equal(at(data, "09:45")?.available, false);
  assert.equal(at(data, "10:00")?.available, true);
  assert.equal(at(data, "08:30", 120)?.available, false);
});

test("other resources, pending requests and cancelled records do not hold slots", () => {
  for (const patch of [{ resourceId: "room-b" }, { status: "pending" as const }, { status: "cancelled" as const }, { status: "declined" as const }]) {
    assert.equal(at(fixture({ bookings: [booking("08:00", "12:00", patch)] }), "09:00")?.available, true);
  }
});

test("complete day occupancy is used even beyond 500 preceding records", () => {
  const other = Array.from({ length: 502 }, (_, index) => booking("08:00", "09:00", { id: String(index), resourceId: "room-b" }));
  const data = fixture({ bookings: [...other, booking("09:00", "10:00")], bookingsTruncated: true });
  assert.equal(at(data, "09:00")?.available, false);
  assert.equal(at(data, "10:00")?.available, true);
});

test("slots include exact off-grid gaps rather than dropping usable space", () => {
  const data = fixture({ bookings: [booking("08:00", "08:07"), booking("08:37", "12:00")] });
  assert.equal(at(data, "08:07")?.available, true);
  assert.equal(facilitySlotPlan(data, selection, 30, now).slots.filter((slot) => slot.available).length, 1);
});

test("hours, closed days and configured duration bound every slot", () => {
  const data = fixture();
  const plan = facilitySlotPlan(data, selection, 60, now);
  assert.equal(plan.slots[0].start, "2026-10-12T08:00");
  assert.equal(plan.slots.at(-1)?.end, "2026-10-12T12:00");
  assert.equal(facilitySlotPlan(data, selection, 15, now).slots.length, 0);
  assert.equal(facilitySlotPlan(data, selection, 241, now).slots.length, 0);
  assert.equal(facilitySlotPlan(data, selection, 30.5, now).slots.length, 0);
  assert.match(facilitySlotPlan(fixture({ rules: { ...data.rules, openDays: [0, 6] } }), selection, 30, now).message, /Closed/);
  assert.deepEqual(facilityDurationOptions({ ...data.rules, minDuration: 37, maxDuration: 75 }), [37, 45, 60, 75]);
});

test("minimum notice uses instants with inclusive exact boundary", () => {
  const data = fixture({ rules: { ...fixture().rules, minNoticeHours: 2 } });
  const plan = facilitySlotPlan(data, selection, 30, new Date("2026-10-12T07:10:00Z"));
  assert.equal(plan.slots[0].start, "2026-10-12T09:10");
  const later = facilitySlotPlan(data, selection, 30, new Date("2026-10-12T07:10:01Z"));
  assert.equal(later.slots[0].start, "2026-10-12T09:11");
});

test("advance days and today follow the calendar timezone, not the browser timezone", () => {
  const current = new Date("2026-10-11T11:30:00Z"); // October 12 in Auckland
  const data = fixture({ timezone: "Pacific/Auckland", date: "2026-10-13", rules: { ...fixture().rules, advanceDays: 1 } });
  const chosen = { ...selection, date: data.date };
  const plan = facilitySlotPlan(data, chosen, 30, current);
  assert.ok(plan.slots.length > 0);
  assert.equal(plan.slots[0].startInstant, "2026-10-12T19:00:00.000Z");
  assert.equal(facilitySlotPlan({ ...data, date: "2026-10-14" }, { ...chosen, date: "2026-10-14" }, 30, current).slots.length, 0);
  assert.equal(facilitySlotPlan({ ...data, date: "2026-10-11" }, { ...chosen, date: "2026-10-11" }, 30, current).slots.length, 0);
});

test("closing at midnight preserves the next-day local end without occupying it", () => {
  const data = fixture({ rules: { ...fixture().rules, openMinute: 1410, closeMinute: 1440 } });
  const plan = facilitySlotPlan(data, selection, 30, now);
  assert.equal(plan.slots.length, 1);
  assert.equal(plan.slots[0].start, "2026-10-12T23:30");
  assert.equal(plan.slots[0].end, "2026-10-13T00:00");
});

test("DST gaps and folds never expose nonexistent, ambiguous or transition-spanning slots", () => {
  for (const [timezone, date, unsafePrefix] of [
    ["Pacific/Auckland", "2026-09-27", "02:"],
    ["Pacific/Auckland", "2026-04-05", "02:"],
    ["America/New_York", "2026-03-08", "02:"],
    ["America/New_York", "2026-11-01", "01:"],
  ]) {
    const data = fixture({ timezone, date, rules: { ...fixture().rules, openMinute: 0, closeMinute: 360 } });
    const plan = facilitySlotPlan(data, { ...selection, date }, 60, new Date(new Date(`${date}T00:00:00Z`).getTime() - 2 * 86400000));
    assert.equal(plan.dstOmitted, true, `${timezone} ${date}`);
    assert.ok(plan.slots.length > 0);
    for (const slot of plan.slots) {
      assert.ok(!slot.start.slice(11).startsWith(unsafePrefix));
      assert.ok(!slot.end.slice(11).startsWith(unsafePrefix));
      assert.equal(Date.parse(slot.endInstant) - Date.parse(slot.startInstant), 60 * 60_000);
    }
  }
});

test("unique endpoints still cannot span a daylight-saving clock change", () => {
  for (const date of ["2026-04-05", "2026-09-27"]) {
    const data = fixture({ timezone: "Pacific/Auckland", date, rules: { ...fixture().rules, openMinute: 0, closeMinute: 360 } });
    const plan = facilitySlotPlan(data, { ...selection, date }, 120, new Date(new Date(`${date}T00:00:00Z`).getTime() - 2 * 86400000));
    assert.equal(plan.slots.some((slot) => slot.start.endsWith("T01:30")), false);
    assert.equal(plan.slots.some((slot) => slot.start.endsWith("T04:00")), true);
  }
});

test("half-hour clock folds and gaps in Lord Howe are also suppressed", () => {
  for (const date of ["2026-04-05", "2026-10-04"]) {
    const data = fixture({ timezone: "Australia/Lord_Howe", date, rules: { ...fixture().rules, openMinute: 0, closeMinute: 300 } });
    const plan = facilitySlotPlan(data, { ...selection, date }, 30, new Date(new Date(`${date}T00:00:00Z`).getTime() - 2 * 86400000));
    assert.equal(plan.dstOmitted, true);
    assert.ok(plan.slots.every((slot) => Date.parse(slot.endInstant) - Date.parse(slot.startInstant) === 30 * 60_000));
    assert.ok(plan.slots.some((slot) => slot.start.endsWith("T04:00")));
  }
});

test("confirmation revalidates changed occupancy, rules, access, limits and the clock", () => {
  const data = fixture(), slot = at(data, "09:00")!;
  assert.equal(facilitySlotProblem(data, selection, slot, now), "");
  assert.match(facilitySlotProblem({ ...data, bookings: [booking("09:00", "10:00")] }, selection, slot, now), /no longer available/);
  assert.match(facilitySlotProblem({ ...data, rules: { ...data.rules, openDays: [0] } }, selection, slot, now), /no longer available/);
  assert.match(facilitySlotProblem({ ...data, canBook: false }, selection, slot, now), /view-only/);
  assert.match(facilitySlotProblem({ ...data, role: "viewer" }, selection, slot, now), /view-only/);
  assert.match(facilitySlotProblem(data, selection, slot, new Date("2026-10-12T09:00:01Z")), /no longer available/);
  assert.match(facilitySlotProblem({ ...data, rules: { ...data.rules, maxActiveBookings: 1 }, bookings: [booking("11:00", "12:00", { own: true, status: "pending" })] }, selection, slot, now), /active booking limit/);
});

test("calendar days stay Monday-first across leap days and year boundaries", () => {
  assert.equal(facilityMonthDays("2026-10")[0], "2026-09-28");
  assert.equal(facilityMonthDays("2026-10").at(-1), "2026-11-01");
  assert.ok(facilityMonthDays("2028-02").includes("2028-02-29"));
  assert.equal(shiftFacilityMonth("2026-12", 1), "2027-01");
});

test("same-tick repeated submissions make one call and retries retain their identity", async () => {
  const submission = createFacilitySlotSubmission("fixed-request-id");
  let release!: (value: boolean) => void;
  const pending = new Promise<boolean>((resolve) => { release = resolve; });
  const requests: string[] = [];
  const first = submission.run((id) => { requests.push(id); return pending; });
  assert.equal(await submission.run(async (id) => { requests.push(id); return true; }), false);
  release(false); assert.equal(await first, false);
  assert.equal(await submission.run(async (id) => { requests.push(id); return true; }), true);
  assert.deepEqual(requests, ["fixed-request-id", "fixed-request-id"]);
});

test("submission rejection releases the click lock for a safe same-identity retry", async () => {
  const submission = createFacilitySlotSubmission("same-id");
  await assert.rejects(submission.run(async () => { throw new Error("offline"); }), /offline/);
  assert.equal(await submission.run(async (id) => id === "same-id"), true);
});

test("planner binds immediate day changes and keeps new bookings calendar-first", async () => {
  const [page, planner, confirmation, css] = await Promise.all(["facilities-page.tsx", "facility-planner.tsx", "facility-slot-confirmation.tsx", "facilities.module.css"].map((file) => readFile(`components/shared-facilities/${file}`, "utf8")));
  assert.match(page, /selectionRef.current.date = next/);
  assert.match(page, /date && body.date !== date/);
  assert.match(page, /facilitySlotProblem\(data, currentSelection\(\), slot\)/);
  assert.match(page, /facilitySlotProblem\(data, currentSelection\(\), bookingSlot\)/);
  assert.match(page, /setDate\(next\); setLoading\(true\)/);
  assert.match(planner, /facilitySelectionReady\(data, selection\) && !loading && !loadError/);
  assert.match(planner, /ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7/);
  assert.match(planner, /tabIndex=\{day === selection.date \? 0 : -1\}/);
  assert.match(confirmation, /createFacilitySlotSubmission\(crypto.randomUUID\(\)\)/);
  assert.match(confirmation, /start: slot.start, end: slot.end/);
  assert.match(confirmation, /Refresh times/);
  assert.doesNotMatch(confirmation, /datetime-local|newBookingLocalFields/);
  assert.match(css, /min-height: 44px/);
  assert.match(css, /repeat\(7, minmax\(0, 1fr\)\)/);
  assert.doesNotMatch(page + planner + confirmation, /window.confirm|\/api\/staff|\/api\/calendar/);
});
