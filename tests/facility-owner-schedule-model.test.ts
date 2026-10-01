import assert from "node:assert/strict";
import test from "node:test";
import { facilityDefaults, type FacilityBooking, type FacilityData } from "../lib/shared-facilities/contracts";
import { facilityOwnerScheduleModel } from "../components/shared-facilities/facility-owner-schedule-model";
import { facilitySlotPlan } from "../components/shared-facilities/facility-slots";

const date = "2026-10-12", now = new Date("2026-10-10T00:00:00Z");
function fixture(patch: Partial<FacilityData> = {}): FacilityData {
  return { calendarId: "calendar-a", date, timezone: "UTC", owner: true, role: "owner", canBook: true, managedResourceIds: [], resources: ["room-a", "room-b"].map((id) => ({ id, name: id, active: true, location: "", description: "", capacity: null })), rules: { ...facilityDefaults, openMinute: 480, closeMinute: 720 }, bookings: [], updates: [], ...patch };
}
function booking(start: string, end: string, patch: Partial<FacilityBooking> = {}): FacilityBooking {
  return { id: `${start}-${end}`, resourceId: "room-a", title: "", notes: "", start: `${date}T${start}:00Z`, end: `${date}T${end}:00Z`, status: "confirmed", own: false, version: 1, canManage: true, ...patch };
}

test("hour groups retain every exact available intent, including the only off-grid gap", () => {
  const data = fixture({ bookings: [booking("08:00", "08:07"), booking("08:37", "12:00")] });
  const model = facilityOwnerScheduleModel(data, date, "", 30, now);
  assert.equal(model.columns.length, 2);
  for (const column of model.columns) {
    const authoritative = facilitySlotPlan(data, { calendarId: data.calendarId, date, resourceId: column.resource.id }, 30, now).slots.filter((slot) => slot.available);
    assert.deepEqual(column.hours.flatMap((hour) => hour.slots), authoritative);
  }
  const hour = model.columns[0].hours[0];
  assert.deepEqual(hour.slots.map((slot) => slot.start), [`${date}T08:07`]);
  assert.deepEqual(hour.occupied, [{ start: 480, end: 487 }, { start: 517, end: 540 }]);
});

test("pending requests remain visible without painting occupied minutes or removing starts", () => {
  const data = fixture({ bookings: [booking("08:00", "09:00", { status: "pending" })] });
  const hour = facilityOwnerScheduleModel(data, date, "room-a", 30, now).columns[0].hours[0];
  assert.equal(hour.bookings[0].status, "pending");
  assert.deepEqual(hour.occupied, []);
  assert.equal(hour.slots.length, 4);
  assert.equal(facilityOwnerScheduleModel(data, date, "room-b", 30, now).columns[0].hours[0].bookings.length, 0);
});

test("full selected-day records survive upcoming truncation and booking extents survive rules changes", () => {
  const older = Array.from({ length: 502 }, (_, index) => booking("08:00", "09:00", { id: String(index), resourceId: "room-b" }));
  const data = fixture({ bookingsTruncated: true, bookings: [...older, booking("07:30", "08:07"), booking("12:00", "13:30")] });
  const model = facilityOwnerScheduleModel(data, date, "room-a", 30, now);
  assert.equal(model.hours[0], 420); assert.equal(model.hours.at(-1), 780);
  assert.deepEqual(model.columns[0].hours[0].occupied, [{ start: 450, end: 480 }]);
  assert.equal(model.columns[0].hours[0].slots.length, 0);
  assert.equal(model.columns[0].hours[1].slots[0].start, `${date}T08:07`);
});

test("stale, removed and archived selections cannot fall through to other active resources", () => {
  const data = fixture();
  assert.equal(facilityOwnerScheduleModel(data, "2026-10-13", "", 30, now).columns.length, 0);
  assert.equal(facilityOwnerScheduleModel(data, date, "missing", 30, now).columns.length, 0);
  data.resources[0].active = false;
  const archived = facilityOwnerScheduleModel(data, date, "room-a", 30, now);
  assert.equal(archived.columns.length, 0); assert.match(archived.message, /archived/);
  assert.deepEqual(facilityOwnerScheduleModel(data, date, "", 30, now).columns.map((column) => column.resource.id), ["room-b"]);
});

test("local midnight endpoints do not paint occupancy on the following day", () => {
  const data = fixture({ rules: { ...facilityDefaults, openMinute: 1380, closeMinute: 1440 }, bookings: [booking("23:30", "00:00", { end: "2026-10-13T00:00:00Z" }), booking("23:30", "00:00", { id: "previous", start: "2026-10-11T23:30:00Z", end: `${date}T00:00:00Z` })] });
  const hour = facilityOwnerScheduleModel(data, date, "room-a", 30, now).columns[0].hours[0];
  assert.equal(hour.bookings.length, 1);
  assert.deepEqual(hour.occupied, [{ start: 1410, end: 1440 }]);
});

test("DST omissions from the slot engine survive hour grouping, including half-hour transitions", () => {
  for (const [timezone, chosenDate] of [["Pacific/Auckland", "2026-09-27"], ["Pacific/Auckland", "2026-04-05"], ["Australia/Lord_Howe", "2026-10-04"], ["Australia/Lord_Howe", "2026-04-05"]]) {
    const data = fixture({ date: chosenDate, timezone, rules: { ...facilityDefaults, openMinute: 0, closeMinute: 360 } });
    const current = new Date(Date.parse(`${chosenDate}T00:00:00Z`) - 172_800_000);
    const model = facilityOwnerScheduleModel(data, chosenDate, "room-a", 60, current);
    assert.equal(model.dstOmitted, true);
    assert.deepEqual(model.columns[0].hours.flatMap((hour) => hour.slots), facilitySlotPlan(data, { calendarId: data.calendarId, date: chosenDate, resourceId: "room-a" }, 60, current).slots.filter((slot) => slot.available));
  }
});

test("clock-change occupancy marks skip nonexistent minutes and preserve repeated local hours", () => {
  const gapDate = "2026-09-27";
  const gap = fixture({ date: gapDate, timezone: "Pacific/Auckland", rules: { ...facilityDefaults, openMinute: 0, closeMinute: 360 }, bookings: [booking("00:00", "00:00", { start: "2026-09-26T13:30:00Z", end: "2026-09-26T14:30:00Z" })] });
  const model = facilityOwnerScheduleModel(gap, gapDate, "room-a", 30, new Date("2026-09-25T00:00:00Z"));
  assert.equal(model.columns[0].hours.find((hour) => hour.minute === 120)!.occupied.length, 0);
  assert.deepEqual(model.columns[0].hours.find((hour) => hour.minute === 60)!.occupied, [{ start: 90, end: 120 }]);
  assert.deepEqual(model.columns[0].hours.find((hour) => hour.minute === 180)!.occupied, [{ start: 180, end: 210 }]);
  const foldDate = "2026-04-05";
  const fold = fixture({ date: foldDate, timezone: "Pacific/Auckland", rules: gap.rules, bookings: [booking("00:00", "00:00", { start: "2026-04-04T13:45:00Z", end: "2026-04-04T14:15:00Z" })] });
  const repeated = facilityOwnerScheduleModel(fold, foldDate, "room-a", 30, new Date("2026-04-03T00:00:00Z")).columns[0].hours.find((hour) => hour.minute === 120)!;
  assert.deepEqual(repeated.occupied, [{ start: 165, end: 180 }, { start: 120, end: 135 }]);
});
