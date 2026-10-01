import "./support/salon-dom-environment";
import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, test } from "node:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { SalonAppointment } from "../lib/salon/contracts";
import type { SalonOwnerScheduleProps } from "../components/salon/salon-owner-schedule";
import { dom, styleHooks } from "./support/salon-dom-environment";

let Schedule: typeof import("../components/salon/salon-owner-schedule").SalonOwnerSchedule;
let root: Root, container: HTMLDivElement;
let previousFetch: typeof fetch;
let requests: unknown[];
const date = "2026-10-12";
const at = (time: string) => `${date}T${time}:00Z`;
const record: SalonAppointment = {
  id: "appointment-a", practitionerId: "person-a", practitionerName: "Ari", clientName: "Taylor",
  clientEmail: "private-contact@example.invalid", clientPhone: "private-phone", notes: "private-notes",
  serviceId: "service-a", serviceName: "Cut and style", durationMinutes: 30,
  bufferBeforeMinutes: 15, bufferAfterMinutes: 15, priceMinor: null, currency: "NZD", cancellationHours: 24,
  start: at("09:00"), end: at("09:30"), busyStart: at("08:45"), busyEnd: at("09:45"),
  status: "confirmed", version: 1, ownClient: false, ownPractitioner: false,
  canManage: true, canCancel: true, canReschedule: true,
};
function fixture(patch: Partial<SalonOwnerScheduleProps> = {}): SalonOwnerScheduleProps {
  return {
    date, timezone: "UTC", practitioners: [{ id: "person-a", displayName: "Ari", active: true }],
    hours: [{ id: "hours-a", practitionerId: "person-a", weekday: 1, startMinute: 480, endMinute: 660 }],
    timeBlocks: [], appointments: [record], practitionerId: "", showCancelled: false,
    selectedAppointmentId: null, disabled: false, onSelectAppointment: () => {}, ...patch,
  };
}
async function render(patch: Partial<SalonOwnerScheduleProps> = {}) { await act(async () => root.render(<Schedule {...fixture(patch)} />)); }
async function click(button: HTMLButtonElement) { await act(async () => button.click()); }
function buttons() { return [...container.querySelectorAll<HTMLButtonElement>("button[data-appointment-id]")]; }
function firstRowButtons() { return buttons().filter(button => button.getAttribute("data-continuation") !== "true"); }
function continuationButtons() { return buttons().filter(button => button.getAttribute("data-continuation") === "true"); }

before(async () => { ({ SalonOwnerSchedule: Schedule } = await import("../components/salon/salon-owner-schedule")); });
beforeEach(() => {
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  requests = []; previousFetch = globalThis.fetch;
  globalThis.fetch = (async (...args) => { requests.push(args); throw new Error("The schedule must not perform transport"); }) as typeof fetch;
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); globalThis.fetch = previousFetch; });
after(() => { styleHooks.deregister(); dom.window.close(); });

test("compact appointment controls keep client and service visible with full accessible context", async () => {
  const selected: string[] = [];
  await render({ onSelectAppointment: id => selected.push(id) });
  const button = buttons()[0];
  assert.ok(button);
  assert.equal(firstRowButtons().length, 1);
  for (const text of ["Taylor", "Cut and style", "09:00–09:30 GMT"]) assert.ok(button.textContent!.includes(text));
  for (const text of ["Taylor", "Cut and style", "Ari", "Confirmed", "12 Oct 2026", "GMT", "View appointment"]) assert.ok(button.getAttribute("aria-label")!.includes(text));
  assert.equal(button.textContent!.includes("2026"), false);
  assert.match(container.textContent!, /Buffer before/);
  assert.match(container.textContent!, /Buffer after/);
  await click(button);
  assert.deepEqual(selected, ["appointment-a"]);
  assert.deepEqual(requests, []);
});

test("multi-row appointments show one full card and compact selectable continuations", async () => {
  const selected: string[] = [];
  await render({ hours: [], appointments: [{ ...record, end: at("11:00"), busyEnd: at("11:15") }], onSelectAppointment: id => selected.push(id) });
  assert.equal(firstRowButtons().length, 1);
  assert.equal(firstRowButtons()[0].closest("td")!.getAttribute("data-row-start"), String(Date.parse(at("08:00"))));
  const continuations = continuationButtons();
  assert.equal(continuations.length, 3);
  assert.equal(buttons().length, 4);
  for (const continuation of continuations) {
    assert.match(continuation.textContent!, /Cut and style/);
    assert.match(continuation.textContent!, /Taylor/);
    assert.match(continuation.getAttribute("aria-label")!, /12 Oct 2026/);
    assert.match(continuation.getAttribute("aria-label")!, /View appointment/);
  }
  assert.match(continuations[0].textContent!, /09:00–10:00 GMT/);
  assert.match(continuations[1].textContent!, /10:00–11:00 GMT/);
  assert.match(continuations[2].textContent!, /11:00–11:15 GMT/);
  assert.match(continuations.at(-1)!.textContent!, /Buffer after/);
  for (const button of buttons()) await click(button);
  assert.deepEqual(selected, [record.id, record.id, record.id, record.id]);
  assert.deepEqual(requests, []);
});

test("continuations with matching service names retain their client identities and record actions", async () => {
  const selected: string[] = [];
  await render({ hours: [], showCancelled: true, appointments: [
    { ...record, end: at("11:00"), busyEnd: at("11:15") },
    { ...record, id: "appointment-b", clientName: "Jordan", status: "cancelled", end: at("11:00"), busyEnd: at("11:15") },
  ], onSelectAppointment: id => selected.push(id) });
  assert.equal(firstRowButtons().length, 2);
  const jordan = continuationButtons().find(button => button.getAttribute("data-appointment-id") === "appointment-b")!;
  const taylor = continuationButtons().find(button => button.getAttribute("data-appointment-id") === record.id)!;
  assert.match(jordan.textContent!, /Jordan/);
  assert.match(jordan.textContent!, /Cancelled/);
  assert.match(jordan.getAttribute("aria-label")!, /time is not held/);
  assert.match(taylor.textContent!, /Taylor/);
  await click(jordan); await click(taylor);
  assert.deepEqual(selected, ["appointment-b", record.id]);
});

test("contacts, notes, block reasons and URLs never enter the timeline DOM", async () => {
  const block = { id: "block-a", practitionerId: "person-a", start: at("10:00"), end: at("11:00"), active: true, reason: "private-block-reason" };
  await render({ timeBlocks: [block] });
  for (const hidden of [record.clientEmail, record.clientPhone, record.notes, block.reason]) assert.equal(container.innerHTML.includes(hidden), false);
  assert.equal(container.querySelector("[href], [title]"), null);
  assert.match(container.textContent!, /Blocked time/);
  assert.match(container.textContent!, /Taylor/);
});

test("selection remains controlled; disabled snapshots cannot invoke the parent callback", async () => {
  const selected: string[] = [], onSelectAppointment = (id: string) => selected.push(id);
  await render({ selectedAppointmentId: "appointment-a", onSelectAppointment });
  assert.equal(firstRowButtons().length, 1);
  assert.ok(buttons().every(button => button.getAttribute("aria-pressed") === "true"));
  buttons()[0].focus();
  assert.equal(document.activeElement, buttons()[0]);
  await render({ disabled: true, selectedAppointmentId: "appointment-a", onSelectAppointment });
  assert.equal(container.querySelector("section")!.getAttribute("aria-busy"), "true");
  assert.ok(buttons().every(button => button.disabled));
  for (const button of buttons()) await click(button);
  assert.deepEqual(selected, []);
  await render({ selectedAppointmentId: null, onSelectAppointment });
  assert.ok(buttons().every(button => button.getAttribute("aria-pressed") === "false"));
  await click(buttons()[0]);
  assert.deepEqual(selected, ["appointment-a"]);
});

test("inactive and cancelled records stay intelligible and honour current filters", async () => {
  const cancelled = { ...record, status: "cancelled" as const };
  const practitioners = [{ id: "person-a", displayName: "Ari", active: false }];
  await render({ appointments: [cancelled], practitioners, showCancelled: true });
  assert.match(container.textContent!, /Inactive practitioner/);
  assert.match(container.textContent!, /Cancelled · time not held/);
  await render({ appointments: [cancelled], practitioners, showCancelled: false });
  assert.equal(buttons().length, 0);
  await render({ practitionerId: "missing" });
  assert.equal(buttons().length, 0);
  assert.match(container.textContent!, /selected practitioner/);
});

test("buffer-only records retain one action, compact dates and full actual service dates", async () => {
  const nextDay = { ...record, start: "2026-10-13T00:05:00Z", end: "2026-10-13T00:35:00Z", busyStart: at("23:55"), busyEnd: "2026-10-13T00:45:00Z" };
  const selected: string[] = [];
  await render({ hours: [], appointments: [nextDay], onSelectAppointment: id => selected.push(id) });
  assert.equal(buttons().length, 1);
  assert.match(buttons()[0].textContent!, /Buffer only on this day/);
  assert.match(buttons()[0].textContent!, /13 Oct 00:05–00:35 GMT/);
  assert.match(buttons()[0].getAttribute("aria-label")!, /13 Oct 2026/);
  assert.match(buttons()[0].getAttribute("aria-label")!, /Buffer before/);
  await click(buttons()[0]);
  assert.deepEqual(selected, [record.id]);
});

test("records carried over from the previous day remain selectable in the first displayed row", async () => {
  const selected: string[] = [];
  await render({ hours: [], appointments: [{ ...record,
    start: "2026-10-11T23:20:00Z", end: "2026-10-11T23:50:00Z",
    busyStart: "2026-10-11T23:10:00Z", busyEnd: at("00:10"),
  }], onSelectAppointment: id => selected.push(id) });
  assert.equal(buttons().length, 1);
  assert.equal(buttons()[0].closest("td")!.getAttribute("data-row-start"), String(Date.parse(at("00:00"))));
  assert.match(buttons()[0].textContent!, /11 Oct 23:20–23:50 GMT/);
  assert.match(buttons()[0].getAttribute("aria-label")!, /Buffer after/);
  await click(buttons()[0]);
  assert.deepEqual(selected, [record.id]);
});

test("multi-row time blocks expose their full interval once and noninteractive continuations", async () => {
  await render({ hours: [], appointments: [], timeBlocks: [{
    id: "block-a", practitionerId: "person-a", start: at("08:45"), end: at("10:00"), active: true,
  }] });
  const block = container.querySelector(".block")!;
  assert.ok(block);
  assert.equal(container.querySelectorAll(".block").length, 1);
  assert.match(block.textContent!, /08:45–10:00 GMT/);
  assert.match(block.getAttribute("aria-label")!, /12 Oct 2026/);
  assert.match(block.getAttribute("aria-label")!, /With Ari/);
  assert.equal(container.querySelectorAll(".blockContinuation").length, 1);
  assert.equal(container.querySelector("button"), null);
  assert.deepEqual(requests, []);
});

test("the scroll region has a keyboard target and descriptive hours never offer inferred slots", async () => {
  await render({ appointments: [] });
  const region = container.querySelector<HTMLElement>('[role="region"]')!;
  assert.ok(region);
  assert.equal(region.tabIndex, 0);
  region.focus(); assert.equal(document.activeElement, region);
  assert.ok(container.querySelector('th[scope="col"]'));
  assert.ok(container.querySelector('th[scope="row"]'));
  assert.match(container.textContent!, /Blank space does not confirm availability/);
  assert.match(container.textContent!, /Recorded working hours:/);
  assert.equal(container.querySelector("button"), null);
  assert.deepEqual(requests, []);
});

test("clock-fold rows show distinct offsets and navigation removes the previous day records", async () => {
  const hours = [{ id: "sunday", practitionerId: "person-a", weekday: 0, startMinute: 0, endMinute: 240 }];
  await render({ date: "2026-04-05", timezone: "Pacific/Auckland", hours, appointments: [] });
  const rows = [...container.querySelectorAll('th[scope="row"]')];
  const repeated = rows.filter(row => row.querySelector("strong")?.textContent?.startsWith("2:"));
  assert.equal(repeated.length, 2);
  assert.match(repeated[0].textContent!, /GMT\+13/);
  assert.match(repeated[1].textContent!, /GMT\+12/);
  assert.match(container.textContent!, /Rows follow actual time/);
  await render({ date: "2026-10-13", hours: [], selectedAppointmentId: "appointment-a" });
  assert.equal(buttons().length, 0);
  assert.deepEqual(requests, []);
});
