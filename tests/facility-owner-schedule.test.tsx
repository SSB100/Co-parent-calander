import "./support/salon-dom-environment";
import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, test } from "node:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { facilityDefaults, type FacilityData } from "../lib/shared-facilities/contracts";
import type { FacilitySlot } from "../components/shared-facilities/facility-slots";
import { dom, styleHooks } from "./support/salon-dom-environment";

let Schedule: typeof import("../components/shared-facilities/facility-owner-schedule").FacilityOwnerSchedule;
let root: Root, container: HTMLDivElement;
const date = new Date(Date.now() + 172_800_000).toISOString().slice(0, 10);
function fixture(): FacilityData {
  return { calendarId: "calendar-a", date, timezone: "UTC", owner: true, role: "owner", canBook: true, managedResourceIds: [], resources: ["room-a", "room-b"].map((id) => ({ id, name: id, active: true, location: "", description: "", capacity: null })), rules: { ...facilityDefaults, openMinute: 480, closeMinute: 600 }, bookings: [], updates: [] };
}
function start(resourceId = "room-a", hour = 480) { const element = container.querySelector<HTMLButtonElement>(`td[data-resource="${resourceId}"][data-hour="${hour}"] button.start`); assert.ok(element); return element; }
async function click(element: HTMLElement) { await act(async () => element.click()); }
async function render(data = fixture(), options: { disabled?: boolean; date?: string; resourceId?: string; duration?: number; onSlot?: (slot: FacilitySlot) => void; onBooking?: (id: string) => void } = {}) { await act(async () => root.render(<Schedule data={data} date={options.date ?? date} resourceId={options.resourceId ?? ""} duration={options.duration ?? 30} disabled={options.disabled ?? false} onSlot={options.onSlot ?? (() => {})} onBooking={options.onBooking ?? (() => {})} />)); }
before(async () => { ({ FacilityOwnerSchedule: Schedule } = await import("../components/shared-facilities/facility-owner-schedule")); });
beforeEach(() => { container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
after(() => { styleHooks.deregister(); dom.window.close(); });

test("all resource columns offer exact starts and choosing a candidate closes the chooser", async () => {
  const slots: FacilitySlot[] = [];
  await render(fixture(), { onSlot: (slot) => slots.push(slot) });
  await click(start("room-b"));
  const dialog = document.querySelector('[role="dialog"]')!;
  assert.match(dialog.textContent ?? "", /Choose a start time/);
  const choices = dialog.querySelectorAll<HTMLButtonElement>(".choices button");
  assert.equal(choices.length, 4);
  await click(choices[1]);
  assert.equal(slots.length, 1); assert.equal(slots[0].resourceId, "room-b"); assert.equal(slots[0].start, `${date}T08:15`);
  assert.equal(document.querySelector('[role="dialog"]'), null);
});

test("one off-grid candidate goes directly to the existing confirmation callback", async () => {
  const data = fixture(), slots: FacilitySlot[] = [];
  data.bookings = [["08:00", "08:07"], ["08:37", "10:00"]].map(([from, to]) => ({ id: from, resourceId: "room-a", start: `${date}T${from}:00Z`, end: `${date}T${to}:00Z`, title: "", notes: "", own: false, canManage: true, status: "confirmed", version: 1 }));
  await render(data, { onSlot: (slot) => slots.push(slot) });
  await click(start());
  assert.equal(slots[0].start, `${date}T08:07`);
  assert.equal(document.querySelector('[role="dialog"]'), null);
  assert.ok(container.querySelector('[data-occupied-start="480"][data-occupied-end="487"]'));
});

test("pending booking inspection is separate from available starts and has no occupancy mark", async () => {
  const data = fixture(), viewed: string[] = [];
  data.bookings = [{ id: "pending", resourceId: "room-a", start: `${date}T08:00:00Z`, end: `${date}T09:00:00Z`, title: "Tentative", notes: "", own: false, canManage: true, status: "pending", version: 1 }];
  await render(data, { onBooking: (id) => viewed.push(id) });
  assert.equal(start().disabled, false);
  assert.equal(container.querySelector("[data-occupied-start]"), null);
  const booking = container.querySelector<HTMLButtonElement>('button[data-pending-only="true"]')!;
  assert.match(booking.textContent ?? "", /Request/);
  await click(booking); assert.deepEqual(viewed, ["pending"]);
});

test("a short-booking cluster stays individually inspectable in a chooser", async () => {
  const data = fixture(), viewed: string[] = [];
  data.bookings = [["08:00", "08:07"], ["08:15", "08:22"]].map(([from, to]) => ({ id: from, resourceId: "room-a", start: `${date}T${from}:00Z`, end: `${date}T${to}:00Z`, title: from, notes: "", own: false, canManage: true, status: "confirmed", version: 1 }));
  await render(data, { onBooking: (id) => viewed.push(id) });
  await click(container.querySelector<HTMLButtonElement>("button.booking")!);
  assert.match(document.querySelector('[role="dialog"]')?.textContent ?? "", /Bookings in this hour/);
  const choices = document.querySelectorAll<HTMLButtonElement>(".bookingChoices button");
  assert.equal(choices.length, 2); await click(choices[1]);
  assert.deepEqual(viewed, ["08:15"]); assert.equal(document.querySelector('[role="dialog"]'), null);
});

test("disabled, stale and permission changes block actions and discard an open chooser", async () => {
  const data = fixture(), slots: FacilitySlot[] = [];
  const onSlot = (slot: FacilitySlot) => slots.push(slot);
  await render(data, { onSlot }); await click(start());
  assert.ok(document.querySelector('[role="dialog"]'));
  await render(data, { disabled: true, onSlot });
  assert.equal(document.querySelector('[role="dialog"]'), null);
  assert.equal(start().disabled, true); await click(start()); assert.equal(slots.length, 0);
  await render(data, { onSlot }); assert.equal(document.querySelector('[role="dialog"]'), null);
  await click(start()); await render({ ...data }, { onSlot });
  assert.equal(document.querySelector('[role="dialog"]'), null);
  await click(start()); await render({ ...data, canBook: false }, { onSlot });
  assert.equal(document.querySelector('[role="dialog"]'), null); assert.equal(start().disabled, true); await click(start()); assert.equal(slots.length, 0);
  await render({ ...data, owner: false, role: "viewer", canBook: true }, { onSlot });
  assert.equal(start().disabled, true); await click(start()); assert.equal(slots.length, 0);
  await render(data, { date: "2000-01-01", onSlot });
  assert.equal(container.querySelector("table"), null); assert.equal(slots.length, 0);
});

test("navigation and duration changes discard candidates, and Escape restores the hour action", async () => {
  const data = fixture();
  await render(data); const trigger = start(); trigger.focus(); await click(trigger);
  const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
  await act(async () => dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  assert.equal(document.querySelector('[role="dialog"]'), null); assert.equal(document.activeElement, trigger);
  await click(trigger); await render(data, { duration: 60 }); assert.equal(document.querySelector('[role="dialog"]'), null);
  await click(start()); await render(data, { resourceId: "room-b" }); assert.equal(document.querySelector('[role="dialog"]'), null);
  assert.equal(container.querySelector('td[data-resource="room-a"]'), null);
  data.resources[1].active = false;
  await render({ ...data }, { resourceId: "room-b" });
  assert.match(container.textContent ?? "", /archived/); assert.equal(container.querySelector("table"), null);
});
