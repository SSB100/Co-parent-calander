import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { facilityDefaults, type FacilityBooking, type FacilityData } from "../lib/shared-facilities/contracts";
import { bookingLocalFields, bookingResourceOptions, canChangeFacilityBooking, canEditFacilityResource, canReviewFacilityBooking, facilityBookingsForView, newBookingLocalFields, shiftFacilityDate } from "../components/shared-facilities/facilities-ui";

const now = new Date("2026-10-10T00:00:00Z");
const booking: FacilityBooking = { id: "booking", resourceId: "room-a", title: "Study group", notes: "", start: "2026-10-12T10:00:00Z", end: "2026-10-12T11:00:00Z", status: "confirmed", own: true, version: 3, canManage: true };
const base: FacilityData = { resources: [{ id: "room-a", name: "Room A", location: "", description: "", capacity: null, active: true }, { id: "room-b", name: "Room B", location: "", description: "", capacity: null, active: true }, { id: "archived", name: "Old room", location: "", description: "", capacity: null, active: false }], bookings: [booking], rules: facilityDefaults, updates: [], owner: false, role: "member", managedResourceIds: [], canBook: true, timezone: "Pacific/Auckland", date: "2026-10-12" };

test("resource editing is owner or explicitly scoped manager only", () => {
  assert.equal(canEditFacilityResource(base, "room-a"), false);
  assert.equal(canEditFacilityResource({ ...base, owner: true, role: "owner" }, "room-b"), true);
  const manager = { ...base, role: "manager" as const, managedResourceIds: ["room-a"] };
  assert.equal(canEditFacilityResource(manager, "room-a"), true);
  assert.equal(canEditFacilityResource(manager, "room-b"), false);
  assert.equal(canEditFacilityResource({ ...manager, role: "viewer" }, "room-a"), false);
});

test("own pending bookings do not grant approval and managers stay in scope", () => {
  const pending = { ...booking, status: "pending" as const };
  const manager = { ...base, role: "manager" as const, managedResourceIds: ["room-a"] };
  assert.equal(canReviewFacilityBooking(base, pending, now), false);
  assert.equal(canReviewFacilityBooking(manager, pending, now), true);
  assert.equal(canReviewFacilityBooking(manager, { ...pending, resourceId: "room-b" }, now), false);
  assert.equal(canReviewFacilityBooking(manager, { ...pending, canManage: false }, now), false);
  assert.equal(canReviewFacilityBooking(manager, booking, now), false);
  assert.equal(canReviewFacilityBooking(manager, pending, new Date("2026-10-13T00:00:00Z")), false);
});

test("booking changes require server capability, booking permission and future active state", () => {
  assert.equal(canChangeFacilityBooking(base, booking, now), true);
  assert.equal(canChangeFacilityBooking({ ...base, canBook: false }, booking, now), false);
  assert.equal(canChangeFacilityBooking(base, { ...booking, canManage: false }, now), false);
  for (const status of ["cancelled", "declined"] as const) assert.equal(canChangeFacilityBooking(base, { ...booking, status }, now), false);
  assert.equal(canChangeFacilityBooking(base, booking, new Date("2026-10-13T00:00:00Z")), false);
});

test("manager editing another member's booking cannot select an unmanaged resource", () => {
  const manager = { ...base, role: "manager" as const, managedResourceIds: ["room-a"] };
  assert.deepEqual(bookingResourceOptions(manager, { ...booking, own: false }).map((resource) => resource.id), ["room-a"]);
  assert.deepEqual(bookingResourceOptions(manager, booking).map((resource) => resource.id), ["room-a", "room-b"]);
  assert.deepEqual(bookingResourceOptions(base).map((resource) => resource.id), ["room-a", "room-b"]);
});

test("day schedule uses calendar timezone and excludes bookings ending at midnight", () => {
  assert.equal(facilityBookingsForView(base, "availability", "", now).length, 1);
  assert.equal(facilityBookingsForView({ ...base, date: "2026-10-13" }, "availability", "", now).length, 0);
  assert.equal(facilityBookingsForView(base, "availability", "room-b", now).length, 0);
  assert.equal(facilityBookingsForView({ ...base, bookings: [{ ...booking, status: "cancelled" }] }, "availability", "", now).length, 0);
});

test("personal upcoming excludes other people and ended bookings but retains requests", () => {
  const data = { ...base, bookings: [booking, { ...booking, id: "pending", status: "pending" as const }, { ...booking, id: "other", own: false }, { ...booking, id: "past", end: "2026-10-01T00:00:00Z" }] };
  assert.deepEqual(facilityBookingsForView(data, "mine", "", now).map((item) => item.id), ["booking", "pending"]);
});

test("booking editors round-trip calendar-local times and handle midnight end dates", () => {
  assert.deepEqual(bookingLocalFields(booking, "Pacific/Auckland"), { start: "2026-10-12T23:00", end: "2026-10-13T00:00" });
  assert.deepEqual(newBookingLocalFields("2026-10-12", { ...facilityDefaults, openMinute: 1410, closeMinute: 1440 }), { start: "2026-10-12T23:30", end: "2026-10-13T00:00" });
  assert.equal(shiftFacilityDate("2026-12-31", 1), "2027-01-01");
  assert.equal(shiftFacilityDate("2026-03-01", -1), "2026-02-28");
});

test("facilities UI keeps request races, duplicate submits and stale versions bounded", async () => {
  const [page, dialogs, rules, styles] = await Promise.all(["facilities-page.tsx", "facility-dialogs.tsx", "facility-rules-form.tsx", "facilities.module.css"].map((file) => readFile(`components/shared-facilities/${file}`, "utf8")));
  assert.match(page, /currentRequest\.current\?\.abort\(\)/);
  assert.match(page, /sequence !== requestSequence\.current/);
  assert.match(page, /if \(mutationLock\.current\) return false/);
  assert.match(page, /request may have reached Covie/);
  assert.match(dialogs, /useState\(\(\) => crypto\.randomUUID\(\)\)/);
  assert.match(dialogs, /id: booking\.id, version: booking\.version/);
  assert.match(dialogs, /: \{ requestId \}/);
  assert.match(page, /version: confirmation\.booking\.version/);
  assert.match(page, /CovieConfirmDialog/);
  assert.match(dialogs, /CovieDialog/);
  assert.match(rules, /facilityRulesSchema\.safeParse/);
  assert.match(page, /tool === "booking-rules" \? data.owner/);
  assert.match(page, /if \(!enabled\) return null/);
  assert.doesNotMatch(page + dialogs + rules, /window\.confirm|alert\(|\/api\/staff-roster/);
  assert.doesNotMatch(styles, /gradient|font-size:\s*(?:9|10)px/);
  assert.match(styles, /minmax\(0, 1fr\)/);
  assert.match(styles, /\.stack :global\(\.covie-dialog-description\) \{ display: block/);
});
