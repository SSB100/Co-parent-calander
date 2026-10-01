import assert from "node:assert/strict";
import test from "node:test";
import type { SalonAppointment } from "../lib/salon/contracts";
import {
  salonOwnerScheduleModel,
  salonScheduleCompactRange,
  salonScheduleTime,
  type SalonOwnerScheduleInput,
  type SalonScheduleAppointment,
} from "../components/salon/salon-owner-schedule-model";

const date = "2026-10-12";
const at = (time: string) => `${date}T${time}:00Z`;
function appointment(patch: Partial<SalonScheduleAppointment> = {}): SalonScheduleAppointment {
  return {
    id: "appointment-a", practitionerId: "person-a", practitionerName: "Ari",
    clientName: "Taylor", serviceName: "Cut and style", status: "confirmed",
    start: at("09:00"), end: at("09:30"), busyStart: at("08:45"), busyEnd: at("09:45"),
    ...patch,
  };
}
function fixture(patch: Partial<SalonOwnerScheduleInput> = {}): SalonOwnerScheduleInput {
  return {
    date, timezone: "UTC", practitionerId: "", showCancelled: false,
    practitioners: [{ id: "person-a", displayName: "Ari", active: true }],
    hours: [{ id: "hours-a", practitionerId: "person-a", weekday: 1, startMinute: 480, endMinute: 1020 }],
    appointments: [], timeBlocks: [], ...patch,
  };
}

test("keeps before/after buffers separately, with exact non-rounded appointment instants", () => {
  const record = appointment({ start: at("09:07"), end: at("09:37"), busyStart: at("08:57"), busyEnd: at("09:42") });
  const model = salonOwnerScheduleModel(fixture({ appointments: [record] }));
  const item = model.appointments[0];
  assert.equal(item.serviceStart, Date.parse(record.start));
  assert.equal(item.serviceEnd, Date.parse(record.end));
  assert.deepEqual(item.segments, [
    { kind: "before", start: Date.parse(at("08:57")), end: Date.parse(at("09:07")) },
    { kind: "service", start: Date.parse(at("09:07")), end: Date.parse(at("09:37")) },
    { kind: "after", start: Date.parse(at("09:37")), end: Date.parse(at("09:42")) },
  ]);
  const first = model.columns[0].cells[0].entries[0];
  assert.deepEqual(first.segments, [{ kind: "before", start: Date.parse(at("08:57")), end: Date.parse(at("09:00")) }]);
});

test("preserves both buffer-only midnight overlaps and uses exclusive day endpoints", () => {
  const before = appointment({ id: "before-next-day", start: "2026-10-13T00:05:00Z", end: "2026-10-13T00:35:00Z", busyStart: at("23:55"), busyEnd: "2026-10-13T00:45:00Z" });
  const after = appointment({ id: "after-previous-day", start: "2026-10-11T23:20:00Z", end: "2026-10-11T23:50:00Z", busyStart: "2026-10-11T23:10:00Z", busyEnd: at("00:10") });
  const endedAtMidnight = appointment({ id: "ends-at-midnight", start: "2026-10-11T23:00:00Z", end: "2026-10-11T23:30:00Z", busyStart: "2026-10-11T22:45:00Z", busyEnd: at("00:00") });
  const startsTomorrow = appointment({ id: "starts-tomorrow", start: "2026-10-13T00:10:00Z", end: "2026-10-13T00:40:00Z", busyStart: "2026-10-13T00:00:00Z", busyEnd: "2026-10-13T00:45:00Z" });
  const model = salonOwnerScheduleModel(fixture({ hours: [], appointments: [before, endedAtMidnight, startsTomorrow, after] }));
  assert.deepEqual(model.appointments.map(item => item.id), [after.id, before.id]);
  assert.ok(model.appointments.every(item => item.bufferOnlyOnDay));
  assert.deepEqual(model.columns[0].cells[0].entries[0].segments.map(segment => segment.kind), ["after"]);
  assert.deepEqual(model.columns[0].cells.at(-1)!.entries[0].segments.map(segment => segment.kind), ["before"]);
  assert.equal(model.rows[0].start, Date.parse(at("00:00")));
  assert.equal(model.rows.at(-1)!.end, Date.parse("2026-10-13T00:00:00Z"));
  for (const item of model.appointments) {
    const cells = model.columns[0].cells.flatMap(cell => cell.entries.filter(value => value.entry.id === item.id));
    assert.equal(cells.filter(value => value.firstRow).length, 1);
    assert.equal(cells[0].firstRow, true);
  }
});

test("only the first overlapping row starts a record, and exact row endpoints stay exclusive", () => {
  const model = salonOwnerScheduleModel(fixture({ hours: [], appointments: [appointment({
    start: at("09:00"), end: at("11:00"), busyStart: at("08:45"), busyEnd: at("11:15"),
  })], timeBlocks: [{ id: "block-a", practitionerId: "person-a", start: at("09:00"), end: at("10:00"), active: true }] }));
  const appointmentCells = model.columns[0].cells.flatMap(cell => cell.entries.filter(value => value.entry.kind === "appointment"));
  assert.deepEqual(appointmentCells.map(value => value.firstRow), [true, false, false, false]);
  assert.deepEqual(appointmentCells.map(value => value.segments.map(segment => segment.kind)), [["before"], ["service"], ["service"], ["after"]]);
  const blockCells = model.columns[0].cells.filter(cell => cell.entries.some(value => value.entry.kind === "block"));
  assert.equal(blockCells.length, 1);
  assert.equal(blockCells[0].row.start, Date.parse(at("09:00")));
  assert.equal(blockCells[0].entries.find(value => value.entry.kind === "block")!.firstRow, true);
});

test("day clipping follows the calendar timezone rather than the UTC date", () => {
  const model = salonOwnerScheduleModel(fixture({ timezone: "Pacific/Auckland", hours: [], appointments: [appointment({
    start: "2026-10-11T10:20:00Z", end: "2026-10-11T10:50:00Z",
    busyStart: "2026-10-11T10:10:00Z", busyEnd: "2026-10-11T11:10:00Z",
  })] }));
  assert.equal(model.rows.length, 1);
  assert.equal(model.rows[0].start, Date.parse("2026-10-11T11:00:00Z"));
  assert.equal(model.appointments[0].bufferOnlyOnDay, true);
  const displayed = model.columns[0].cells[0].entries[0];
  assert.equal(displayed.firstRow, true);
  assert.deepEqual(displayed.segments, [{ kind: "after", start: Date.parse("2026-10-11T11:00:00Z"), end: Date.parse("2026-10-11T11:10:00Z") }]);
});

test("inactive practitioners with displayed appointments or blocks remain; inactive empty profiles do not", () => {
  const model = salonOwnerScheduleModel(fixture({
    practitioners: [
      { id: "person-a", displayName: "Ari", active: true },
      { id: "person-b", displayName: "Blair", active: false },
      { id: "person-c", displayName: "Casey", active: false },
      { id: "person-d", displayName: "Dev", active: false },
    ],
    appointments: [appointment({ practitionerId: "person-b", practitionerName: "Blair" })],
    timeBlocks: [
      { id: "active-block", practitionerId: "person-c", start: at("10:00"), end: at("11:00"), active: true },
      { id: "removed-block", practitionerId: "person-d", start: at("10:00"), end: at("11:00"), active: false },
    ],
  }));
  assert.deepEqual(model.columns.map(column => column.practitioner.id), ["person-a", "person-b", "person-c"]);
  assert.equal(model.columns[1].practitioner.active, false);
  assert.equal(model.columns[2].practitioner.active, false);
});

test("cancelled visibility is explicit, filtered selections never fall through, and missing profiles keep records", () => {
  const input = fixture({ appointments: [appointment({ status: "cancelled" })] });
  assert.equal(salonOwnerScheduleModel(input).appointments.length, 0);
  assert.equal(salonOwnerScheduleModel({ ...input, showCancelled: true }).appointments[0].status, "cancelled");
  const missing = salonOwnerScheduleModel({ ...input, practitionerId: "missing" });
  assert.equal(missing.columns.length, 0);
  assert.match(missing.message, /selected practitioner/);
  const retained = salonOwnerScheduleModel(fixture({ practitioners: [], hours: [], appointments: [appointment()] }));
  assert.equal(retained.columns[0].practitioner.displayName, "Ari");
  assert.equal(retained.columns[0].practitioner.active, null);
  assert.equal(retained.appointments.length, 1);
});

test("numeric instant order wins over input order and lexicographic offset timestamps", () => {
  const early = appointment({ id: "early", start: "2026-10-12T12:00:00+03:00", end: "2026-10-12T12:30:00+03:00", busyStart: "2026-10-12T11:45:00+03:00", busyEnd: "2026-10-12T12:45:00+03:00" });
  const later = appointment({ id: "later", start: at("10:00"), end: at("10:30"), busyStart: at("09:45"), busyEnd: at("10:45") });
  assert.deepEqual(salonOwnerScheduleModel(fixture({ appointments: [later, early] })).appointments.map(item => item.id), ["early", "later"]);
});

test("spring gaps omit invented hours; autumn folds keep independent real rows and offsets", () => {
  const make = (day: string) => fixture({ date: day, timezone: "Pacific/Auckland", hours: [{ id: "sunday", practitionerId: "person-a", weekday: 0, startMinute: 0, endMinute: 360 }] });
  const gap = salonOwnerScheduleModel(make("2026-09-27"));
  assert.equal(gap.clockChange, true);
  assert.equal(gap.rows.length, 5);
  assert.equal(gap.rows.some(row => row.label.startsWith("2:")), false);
  const fold = salonOwnerScheduleModel(make("2026-04-05"));
  assert.equal(fold.clockChange, true);
  assert.equal(fold.rows.length, 7);
  const repeated = fold.rows.filter(row => row.label.startsWith("2:"));
  assert.equal(repeated.length, 2);
  assert.notEqual(repeated[0].offset, repeated[1].offset);
  assert.equal(repeated[1].start - repeated[0].start, 3_600_000);
  assert.ok(fold.rows.every((row, index) => !index || row.start === fold.rows[index - 1].end));
});

test("half-hour clock changes keep the actual 01:30 repeat and 02:30 start", () => {
  const make = (day: string) => fixture({ date: day, timezone: "Australia/Lord_Howe", hours: [{ id: "sunday", practitionerId: "person-a", weekday: 0, startMinute: 0, endMinute: 240 }] });
  const fold = salonOwnerScheduleModel(make("2026-04-05"));
  assert.equal(fold.clockChange, true);
  const repeated = fold.rows.find(row => row.label.startsWith("1:30"));
  assert.ok(repeated);
  assert.equal(repeated.end - repeated.start, 30 * 60_000);
  const gap = salonOwnerScheduleModel(make("2026-10-04"));
  const later = gap.rows.find(row => row.label.startsWith("2:30"));
  assert.ok(later);
  assert.equal(later.end - later.start, 30 * 60_000);
  assert.equal(gap.rows.some(row => row.label.startsWith("2:00")), false);
});

test("working hours describe both sides of a fold without bridging a local closure", () => {
  const model = salonOwnerScheduleModel(fixture({ date: "2026-04-05", timezone: "Pacific/Auckland", hours: [{ id: "sunday", practitionerId: "person-a", weekday: 0, startMinute: 105, endMinute: 135 }] }));
  const working = model.columns[0].working;
  assert.equal(working.length, 2);
  assert.equal(working[0].end - working[0].start, 30 * 60_000);
  assert.equal(working[1].end - working[1].start, 15 * 60_000);
  assert.ok(working[1].start > working[0].end);
});

test("runtime projections discard contact details and notes without mutating source data", () => {
  const source = {
    ...appointment(), clientEmail: "private-contact@example.invalid", clientPhone: "private-phone",
    notes: "private-notes", serviceId: "service-a", durationMinutes: 30,
    bufferBeforeMinutes: 15, bufferAfterMinutes: 15, priceMinor: null, currency: "NZD",
    cancellationHours: 24, version: 1, ownClient: false, ownPractitioner: false,
    canManage: true, canCancel: true, canReschedule: true,
  } satisfies SalonAppointment;
  const block = { id: "block-a", practitionerId: "person-a", start: at("10:00"), end: at("11:00"), active: true, reason: "private-block-reason" };
  const input = fixture({ appointments: Object.freeze([Object.freeze(source)]), timeBlocks: [block] });
  const original = JSON.stringify(input);
  const projected = JSON.stringify(salonOwnerScheduleModel(input));
  assert.match(projected, /Taylor/);
  for (const hidden of ["clientEmail", "clientPhone", "notes", "private-contact", "private-phone", "private-notes", "private-block-reason"]) assert.equal(projected.includes(hidden), false);
  assert.equal(JSON.stringify(input), original);
});

test("invalid dates and skipped dates are explicit; malformed time ranges are never invented", () => {
  assert.match(salonOwnerScheduleModel(fixture({ date: "2026-02-30" })).message, /cannot be displayed/);
  assert.match(salonOwnerScheduleModel(fixture({ timezone: "Invalid/Timezone" })).message, /cannot be displayed/);
  assert.match(salonOwnerScheduleModel(fixture({ date: "2011-12-30", timezone: "Pacific/Apia" })).message, /does not exist/);
  const model = salonOwnerScheduleModel(fixture({ appointments: [appointment({ busyEnd: at("08:00") })] }));
  assert.equal(model.appointments.length, 0);
  assert.match(model.warning, /invalid time ranges/);
});

test("invalid source ranges are discarded without clamping or manufacturing buffer segments", () => {
  const malformed = [
    appointment({ id: "unparseable", start: "not-an-instant" }),
    appointment({ id: "empty-service", end: at("09:00") }),
    appointment({ id: "inverted-service", end: at("08:30") }),
    appointment({ id: "busy-start-too-late", busyStart: at("09:01") }),
    appointment({ id: "busy-end-too-early", busyEnd: at("09:29") }),
  ];
  const model = salonOwnerScheduleModel(fixture({ hours: [], appointments: malformed, timeBlocks: [
    { id: "invalid-block", practitionerId: "person-a", start: at("10:00"), end: at("09:00"), active: true },
    { id: "removed-invalid-block", practitionerId: "person-a", start: "invalid", end: "invalid", active: false },
  ] }));
  assert.equal(model.appointments.length, 0);
  assert.equal(model.rows.length, 0);
  assert.match(model.warning, /^6 records have invalid time ranges/);
});

test("exact labels distinguish fold offsets and retain sub-minute precision", () => {
  const first = salonScheduleTime(Date.parse("2026-04-04T13:15:12.123Z"), "Pacific/Auckland");
  const repeated = salonScheduleTime(Date.parse("2026-04-04T14:15:12.123Z"), "Pacific/Auckland");
  assert.notEqual(first, repeated);
  assert.match(first, /12\.123/);
  assert.match(first, /GMT\+13/);
  assert.match(repeated, /GMT\+12/);
});

test("compact ranges retain day changes, fold offsets and exact sub-minute precision", () => {
  assert.match(salonScheduleCompactRange(Date.parse(at("09:00")), Date.parse(at("09:30")), "UTC", date), /^09:00–09:30 GMT(?:\+0)?$/);
  assert.match(salonScheduleCompactRange(Date.parse(at("23:55")), Date.parse("2026-10-13T00:15:00Z"), "UTC", date), /^23:55–13 Oct 00:15 GMT(?:\+0)?$/);
  assert.match(salonScheduleCompactRange(Date.parse("2026-10-13T00:05:00Z"), Date.parse("2026-10-13T00:35:00Z"), "UTC", date), /^13 Oct 00:05–00:35 GMT(?:\+0)?$/);
  assert.equal(salonScheduleCompactRange(Date.parse("2026-04-04T13:15:12.123Z"), Date.parse("2026-04-04T14:15:12.123Z"), "Pacific/Auckland", "2026-04-05"), "02:15:12.123 GMT+13–02:15:12.123 GMT+12");
});
