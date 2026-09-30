import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { salonBookingSchema, salonDateSchema, salonHoursSchema, salonManualBookingSchema, salonSettingsSchema } from "../lib/salon/contracts";
import { generateSalonSlots, salonDayBounds, salonSlotLocalLabel } from "../lib/salon/slots";

const practitionerId = randomUUID();
const service = { durationMinutes: 60, bufferBeforeMinutes: 15, bufferAfterMinutes: 15 };
const rules = { leadMinutes: 0, advanceDays: 365, slotMinutes: 15 };
const hours = [{ weekday: 4, startMinute: 9 * 60, endMinute: 17 * 60 }];
const input = { timezone: "Pacific/Auckland", date: "2026-10-01", rules, service, providers: [{ id: practitionerId, hours, busy: [] }], now: new Date("2026-09-30T00:00:00Z") };

test("Salon schemas reject forged account/role fields and malformed local dates", () => {
  const booking = { requestId: randomUUID(), practitionerId, serviceId: randomUUID(), start: "2026-10-01T10:00:00+13:00", clientName: "Synthetic client", expectedTerms: { serviceName: "Cut", durationMinutes: 60, priceMinor: null, currency: "NZD", cancellationHours: 24 } };
  assert.ok(salonBookingSchema.safeParse(booking).success);
  assert.equal(salonBookingSchema.safeParse({ ...booking, expectedTerms: undefined }).success, false);
  assert.equal(salonBookingSchema.safeParse({ ...booking, expectedTerms: { ...booking.expectedTerms, approved: true } }).success, false);
  for (const key of ["userId", "actor", "clientUserId", "role", "calendarId", "notes"]) assert.equal(salonBookingSchema.safeParse({ ...booking, [key]: "forged" }).success, false);
  assert.equal(salonManualBookingSchema.safeParse({ ...booking, clientUserId: randomUUID() }).success, false);
  assert.equal(salonBookingSchema.safeParse({ ...booking, start: "2026-10-01T10:00" }).success, false);
  assert.equal(salonDateSchema.safeParse("2026-02-30").success, false);
  assert.equal(salonDateSchema.safeParse("2028-02-29").success, true);
  assert.equal(salonSettingsSchema.safeParse({ businessName: "Salon", publicEnabled: false, leadMinutes: 0, advanceDays: 90, slotMinutes: 7, cancellationHours: 24 }).success, false);
});

test("Working hours accept separate daily sessions but reject overlap and overnight ambiguity", () => {
  assert.ok(salonHoursSchema.safeParse({ practitionerId, hours: [...hours, { weekday: 5, startMinute: 540, endMinute: 720 }] }).success);
  assert.equal(salonHoursSchema.safeParse({ practitionerId, hours: [...hours, ...hours] }).success, false);
  assert.equal(salonHoursSchema.safeParse({ practitionerId, hours: [{ weekday: 0, startMinute: 1200, endMinute: 300 }] }).success, false);
});

test("Entire appointment and both buffers fit hours; adjacent busy boundaries are allowed", () => {
  const slots = generateSalonSlots(input);
  assert.equal(salonSlotLocalLabel(input.timezone, slots[0].start), "2026-10-01T09:15");
  assert.equal(salonSlotLocalLabel(input.timezone, slots.at(-1)!.start), "2026-10-01T15:45");
  const blocked = generateSalonSlots({ ...input, providers: [{ id: practitionerId, hours, busy: [{ start: "2026-09-30T22:00:00Z", end: "2026-09-30T23:00:00Z" }] }] });
  const labels = blocked.map(slot => salonSlotLocalLabel(input.timezone, slot.start));
  assert.ok(labels.includes("2026-10-01T09:45")); // Busy ends exactly at 11:00.
  assert.ok(labels.includes("2026-10-01T12:15")); // Before buffer starts exactly at noon.
  assert.ok(!labels.includes("2026-10-01T10:00"));
  assert.ok(!labels.includes("2026-10-01T12:00"));
});

test("Selected-day busy calculation honors every busy interval without an upcoming-list cap", () => {
  const busy = Array.from({ length: 600 }, (_, i) => ({ start: new Date(Date.parse("2026-09-30T00:00Z") + i * 60000).toISOString(), end: new Date(Date.parse("2026-09-30T00:00Z") + (i + 1) * 60000).toISOString() }));
  busy.push({ start: "2026-09-30T20:00:00Z", end: "2026-10-01T04:00:00Z" });
  assert.deepEqual(generateSalonSlots({ ...input, providers: [{ id: practitionerId, hours, busy }] }), []);
});

test("Lead time and horizon use instants and exclude closed-day slots", () => {
  const slots = generateSalonSlots({ ...input, rules: { ...rules, leadMinutes: 60 }, now: new Date("2026-09-30T21:00:00Z") });
  assert.equal(salonSlotLocalLabel(input.timezone, slots[0].start), "2026-10-01T11:00");
  assert.deepEqual(generateSalonSlots({ ...input, rules: { ...rules, advanceDays: 1 }, now: new Date("2026-09-01T00:00:00Z") }), []);
  assert.deepEqual(generateSalonSlots({ ...input, date: "2026-10-02" }), []);
});

test("Auckland DST spring gap never invents missing local times", () => {
  const result = generateSalonSlots({ ...input, date: "2026-09-27", now: new Date("2026-09-01T00:00Z"), service: { durationMinutes: 30, bufferBeforeMinutes: 0, bufferAfterMinutes: 0 }, providers: [{ id: practitionerId, hours: [{ weekday: 0, startMinute: 60, endMinute: 240 }], busy: [] }] });
  assert.ok(result.length > 0);
  assert.ok(result.every(slot => !salonSlotLocalLabel(input.timezone, slot.start).includes("T02:")));
  const bounds = salonDayBounds(input.timezone, "2026-09-27");
  assert.equal(Date.parse(bounds.end) - Date.parse(bounds.start), 23 * 3600000);
});

test("Auckland DST autumn fold returns distinct instants and never bridges closed local hours", () => {
  const base = { ...input, date: "2027-04-04", now: new Date("2027-04-01T00:00Z"), service: { durationMinutes: 30, bufferBeforeMinutes: 0, bufferAfterMinutes: 0 }, providers: [{ id: practitionerId, hours: [{ weekday: 0, startMinute: 120, endMinute: 240 }], busy: [] }] };
  const slots = generateSalonSlots(base);
  const folded = slots.filter(slot => salonSlotLocalLabel(input.timezone, slot.start) === "2027-04-04T02:15");
  assert.equal(folded.length, 2);
  assert.equal(Date.parse(folded[1].start) - Date.parse(folded[0].start), 3600000);
  const partial = generateSalonSlots({ ...base, service: { ...base.service, durationMinutes: 60 }, providers: [{ id: practitionerId, hours: [{ weekday: 0, startMinute: 150, endMinute: 210 }], busy: [] }] });
  assert.ok(!partial.some(slot => slot.start === "2027-04-03T13:30:00.000Z")); // Would cross the closed second 02:00–02:30.
  const bounds = salonDayBounds(input.timezone, base.date);
  assert.equal(Date.parse(bounds.end) - Date.parse(bounds.start), 25 * 3600000);
});

test("A skipped date at a date-line transition does not invent availability", () => {
  assert.throws(() => salonDayBounds("Pacific/Apia", "2011-12-30"), /does not exist/);
});
