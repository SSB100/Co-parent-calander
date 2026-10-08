import "./support/salon-dom-environment";
import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, test } from "node:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { salonDefaults, type SalonData } from "../lib/salon/contracts";
import { dom, styleHooks } from "./support/salon-dom-environment";

let Page: typeof import("../components/salon/salon-page").SalonPage;
let root: Root, container: HTMLDivElement;
const originalFetch = globalThis.fetch;
const calendarId = "10000000-0000-4000-8000-000000000001";
const practitionerId = "20000000-0000-4000-8000-000000000001";
const otherPractitionerId = "20000000-0000-4000-8000-000000000002";
const serviceId = "30000000-0000-4000-8000-000000000001";
const appointmentId = "40000000-0000-4000-8000-000000000001";
const date = "2026-10-02", base = `/calendar-types/salon-bookings?date=${date}`;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
function fixture(day = date): SalonData {
  return {
    calendarId, date: day, timezone: "UTC", role: "owner", ownPractitionerId: practitionerId,
    canOrganise: true, canPublish: true, settings: { ...salonDefaults, businessName: "Synthetic Salon", leadMinutes: 0 },
    practitioners: [
      { id: practitionerId, displayName: "Alice", bio: "", role: "owner", kind: "staff", active: true, bookable: true, own: true, serviceIds: [serviceId] },
      { id: otherPractitionerId, displayName: "Blair", bio: "", role: "practitioner", kind: "contractor", active: true, bookable: true, own: false, serviceIds: [serviceId] },
    ],
    services: [{ id: serviceId, name: "Synthetic cut", description: "", durationMinutes: 30, bufferBeforeMinutes: 10, bufferAfterMinutes: 10, priceMinor: 5000, currency: "NZD", active: true, bookable: true }],
    hours: [{ id: "hours", practitionerId, weekday: new Date(`${day}T12:00:00Z`).getUTCDay(), startMinute: 480, endMinute: 1080 }],
    appointments: [{ id: appointmentId, practitionerId, practitionerName: "Alice", serviceId, serviceName: "Synthetic cut", durationMinutes: 30, bufferBeforeMinutes: 10, bufferAfterMinutes: 10, priceMinor: 5000, currency: "NZD", cancellationHours: 24, start: `${day}T09:00:00Z`, end: `${day}T09:30:00Z`, busyStart: `${day}T08:50:00Z`, busyEnd: `${day}T09:40:00Z`, status: "confirmed", version: 1, clientName: "Synthetic Client", clientEmail: "private@example.invalid", clientPhone: "Private phone", notes: "Private appointment note", ownClient: false, ownPractitioner: true, canManage: true, canCancel: true, canReschedule: true }],
    appointmentsTruncated: false, updates: [], invitations: [],
    timeBlocks: [{ id: "50000000-0000-4000-8000-000000000001", practitionerId, start: `${day}T12:00:00Z`, end: `${day}T13:00:00Z`, reason: "Private block reason", active: true }],
  };
}
function button(label: string, scope: ParentNode = container) {
  const found = [...scope.querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent?.trim() === label);
  assert.ok(found, `Missing button ${label}`); return found;
}
function element<T extends Element = HTMLElement>(selector: string, scope: ParentNode = container): T {
  const found = scope.querySelector<T>(selector); assert.ok(found, `Missing ${selector}`); return found;
}
async function settle(check: () => void) {
  let last: unknown;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
    try { check(); return; } catch (error) { last = error; }
  }
  throw last;
}
async function click(target: HTMLElement) { await act(async () => target.click()); }
async function choose(target: HTMLSelectElement, value: string) {
  await act(async () => { target.value = value; target.dispatchEvent(new Event("change", { bubbles: true })); });
}
async function focusRefresh() { await act(async () => window.dispatchEvent(new Event("focus"))); }
async function render(initialRecord = "") {
  await act(async () => root.render(<Page calendarId={calendarId} section="calendar" initialDate={date} initialRecord={initialRecord} />));
  await settle(() => assert.equal(container.textContent?.includes("Loading salon…"), false));
}
const dayPanel = () => element('[aria-label="Selected day workspace"]');
const timelineButton = () => element<HTMLButtonElement>(`[data-salon-owner-schedule] button[data-appointment-id="${appointmentId}"]`);
before(async () => { ({ SalonPage: Page } = await import("../components/salon/salon-page")); });
beforeEach(() => {
  window.history.replaceState(null, "", base);
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  globalThis.fetch = async () => json(fixture());
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); globalThis.fetch = originalFetch; });
after(() => { styleHooks.deregister(); dom.window.close(); });

test("strict owner workspace keeps visible tools and mounted timetable across Back, Forward and Close", async () => {
  await render(); const schedule = element("[data-salon-owner-schedule]");
  for (const label of ["Team", "Services", "Booking settings", "Updates", "Book an appointment"]) assert.equal(button(label).disabled, false);
  await click(button("Booking settings")); assert.ok(element('[role="dialog"]'));
  assert.equal(element("[data-salon-owner-schedule]"), schedule);
  await act(async () => window.history.back()); await settle(() => assert.equal(container.querySelector('[role="dialog"]'), null));
  await act(async () => window.history.forward()); await settle(() => element('[role="dialog"]'));
  await click(button("Back to calendar")); await settle(() => assert.equal(container.querySelector('[role="dialog"]'), null));
  assert.equal(window.location.search, `?date=${date}`);
});

for (const role of ["manager", "practitioner"] as const) test(`${role} retains the existing planner even with owner panel parameters`, async () => {
  const current = fixture(); current.role = role; current.canOrganise = role === "manager"; current.canPublish = false;
  window.history.replaceState(null, "", `${base}&panel=services`); globalThis.fetch = async () => json(current);
  await render(); assert.equal(container.querySelector("[data-owner-workspace]"), null);
  assert.ok(element('[aria-label="Choose appointment day"]')); assert.equal(container.querySelector('[role="dialog"]'), null);
  assert.equal(new URL(window.location.href).searchParams.has("panel"), false);
});

test("timeline projects private fields while selected detail resolves the current authorized record", async () => {
  let current = fixture(); globalThis.fetch = async () => json(current); await render();
  const schedule = element("[data-salon-owner-schedule]");
  assert.doesNotMatch(schedule.outerHTML, /private@example|Private phone|Private appointment note|Private block reason/);
  await click(timelineButton()); assert.match(dayPanel().textContent ?? "", /private@example.invalid/);
  current = fixture(); current.appointments[0].clientEmail = "updated@example.invalid";
  await focusRefresh(); await settle(() => assert.match(dayPanel().textContent ?? "", /updated@example.invalid/));
  current = fixture(); current.appointments = [];
  await focusRefresh(); await settle(() => assert.match(dayPanel().textContent ?? "", /no longer available/));
  assert.doesNotMatch(container.textContent ?? "", /private@example|updated@example|Private appointment note/);
});

test("day navigation hides all stale schedule and selected detail, ignores late responses and clears selection", async () => {
  const pending: { day: string; resolve: (response: Response) => void }[] = [];
  let first = true;
  globalThis.fetch = async input => {
    if (first) { first = false; return json(fixture()); }
    const day = new URL(String(input), window.location.href).searchParams.get("date")!;
    return new Promise(resolve => pending.push({ day, resolve }));
  };
  await render(); await click(timelineButton());
  await click(element<HTMLButtonElement>('button[aria-label="Next day"]'));
  await settle(() => assert.equal(pending[0]?.day, "2026-10-03"));
  assert.equal(container.querySelector("[data-salon-owner-schedule]"), null); assert.doesNotMatch(dayPanel().textContent ?? "", /private@example/);
  await click(element<HTMLButtonElement>('button[aria-label="Next day"]'));
  await settle(() => assert.equal(pending[1]?.day, "2026-10-04"));
  await act(async () => pending[0].resolve(json(fixture("2026-10-03"))));
  assert.equal(container.querySelector("[data-salon-owner-schedule]"), null);
  await act(async () => pending[1].resolve(json(fixture("2026-10-04"))));
  await settle(() => element("[data-salon-owner-schedule]"));
  assert.match(dayPanel().textContent ?? "", /Appointments this day/); assert.doesNotMatch(dayPanel().textContent ?? "", /private@example/);
});

test("Back drops nested unsaved forms and Forward returns only to the parent tool", async () => {
  await render(); await click(button("Services")); await click(button("Add service"));
  assert.equal(container.querySelectorAll('[role="dialog"]').length, 2);
  await act(async () => window.history.back()); await settle(() => assert.equal(container.querySelector('[role="dialog"]'), null));
  await act(async () => window.history.forward()); await settle(() => assert.equal(container.querySelectorAll('[role="dialog"]').length, 1));
  assert.equal(container.querySelector("#salon-service-form"), null);
});

test("direct owner panel dismissal preserves date, source record and unrelated parameters", async () => {
  window.history.replaceState(null, "", `${base}&record=${appointmentId}&context=personal&panel=services`);
  await render(appointmentId); await settle(() => element('[role="dialog"]'));
  await click(button("Back to calendar")); await settle(() => assert.equal(container.querySelector('[role="dialog"]'), null));
  const url = new URL(window.location.href); assert.equal(url.searchParams.get("record"), appointmentId); assert.equal(url.searchParams.get("context"), "personal"); assert.equal(url.searchParams.get("date"), date); assert.equal(url.searchParams.has("panel"), false);
  assert.match(dayPanel().textContent ?? "", /Appointment from Personal/);
});

test("owner demotion closes tool and nested editor while restoring manager planner", async () => {
  let current = fixture(); globalThis.fetch = async () => json(current); await render();
  await click(button("Services")); await click(button("Add service"));
  current = { ...fixture(), role: "manager", canPublish: false }; await focusRefresh();
  await settle(() => assert.equal(container.querySelector('[role="dialog"]'), null));
  assert.equal(container.querySelector("[data-owner-workspace]"), null); assert.ok(element('[aria-label="Choose appointment day"]'));
  assert.equal(new URL(window.location.href).searchParams.has("panel"), false);
});

test("failed revalidation clears the private workspace and retry returns a current snapshot", async () => {
  let rejected = false; globalThis.fetch = async () => rejected ? json({ error: "Salon access changed. Reload this page." }, 403) : json(fixture());
  await render(); await click(timelineButton()); await click(button("Services")); await click(button("Add service"));
  rejected = true; await focusRefresh(); await settle(() => assert.match(container.textContent ?? "", /Salon access changed/));
  assert.equal(container.querySelector("[data-owner-workspace]"), null); assert.equal(container.querySelector('[role="dialog"]'), null);
  assert.doesNotMatch(container.textContent ?? "", /Synthetic Client|private@example/);
  rejected = false; await click(button("Try again")); await settle(() => element("[data-salon-owner-schedule]"));
  assert.equal(container.querySelector('[role="dialog"]'), null);
});

test("cancelled Personal appointment on inactive profile remains readable without exposing a bookable slot", async () => {
  const current = fixture(); current.practitioners[0].active = false; current.appointments[0].status = "cancelled"; current.appointments[0].canCancel = false; current.appointments[0].canReschedule = false;
  globalThis.fetch = async () => json(current); await render(appointmentId);
  assert.match(dayPanel().textContent ?? "", /Appointment from Personal|Cancelled/); assert.match(dayPanel().textContent ?? "", /Synthetic Client/);
  assert.equal(container.querySelectorAll("button.slot").length, 0);
  assert.match(element<HTMLSelectElement>('[data-owner-workspace] select').textContent ?? "", /Alice · inactive/);
  const checkbox = element<HTMLInputElement>('input[type="checkbox"]'); await click(checkbox);
  assert.match(element('[data-salon-owner-schedule]').textContent ?? "", /Inactive practitioner/);
  const filter = element<HTMLSelectElement>('[data-owner-workspace] select'); assert.match(filter.textContent ?? "", /Alice · inactive/);
});

test("practitioner and cancelled filters clear selected detail and retained records remain reachable", async () => {
  await render(); await click(timelineButton());
  const filter = element<HTMLSelectElement>('[data-owner-workspace] select'); await choose(filter, otherPractitionerId);
  assert.match(dayPanel().textContent ?? "", /No appointments/); assert.doesNotMatch(dayPanel().textContent ?? "", /private@example/);
  await choose(filter, ""); await click(timelineButton()); await click(element<HTMLInputElement>('input[type="checkbox"]'));
  assert.match(dayPanel().textContent ?? "", /Appointments this day/); assert.doesNotMatch(dayPanel().textContent ?? "", /private@example/);
});

test("owner booking uses server-returned practitioner slot, preserves terms and retry request identity", async () => {
  let current = fixture(); const posted: { action: string; data: Record<string, unknown> }[] = []; const requests: URL[] = []; const headers: string[] = [];
  globalThis.fetch = async (input, init) => {
    headers.push(new Headers(init?.headers).get("x-covie-calendar-id") ?? "");
    if (init?.method === "POST") { posted.push(JSON.parse(String(init.body))); throw new TypeError("Interrupted response"); }
    const url = new URL(String(input), window.location.href); requests.push(url);
    if (url.searchParams.has("serviceId")) return json({ calendarId, date, slots: [{ practitionerId: otherPractitionerId, start: `${date}T10:07:00Z`, end: `${date}T10:37:00Z` }] });
    return json(current);
  };
  await render(); await click(button("Book an appointment"));
  const dialog = element('[role="dialog"]'); const selects = [...dialog.querySelectorAll<HTMLSelectElement>("select")];
  await choose(selects[0], otherPractitionerId); await choose(selects[1], serviceId);
  await settle(() => element("button.slot", dialog)); await click(element("button.slot", dialog));
  const confirmation = element('[aria-labelledby="salon-booking-confirmation"]'); assert.match(confirmation.textContent ?? "", /Blair|10:07/);
  const submit = async () => act(async () => element("#salon-booking-form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  await submit(); assert.equal(posted.length, 1);
  assert.equal(posted[0].data.practitionerId, otherPractitionerId); assert.equal(posted[0].data.start, `${date}T10:07:00Z`);
  assert.equal(requests.at(-1)?.searchParams.get("practitionerId"), otherPractitionerId);
  const reviewed = element(".summary", confirmation).textContent;
  current = fixture(); current.services[0].name = "Changed cut"; current.services[0].priceMinor = 7500;
  await focusRefresh(); await settle(() => assert.equal(button("Book an appointment").disabled, false));
  assert.equal(element(".summary", confirmation).textContent, reviewed); await submit(); assert.deepEqual(posted[1], posted[0]); assert.ok(headers.every(value => value === calendarId));
  await click(button("Refresh details and times", confirmation)); await settle(() => assert.equal(container.querySelector('[aria-labelledby="salon-booking-confirmation"]'), null));
});

for (const action of ["cancel", "reschedule"] as const) test(`owner ${action} retains reviewed version after current record refresh`, async () => {
  let current = fixture(); const posted: { action: string; data: { id: string; version: number; start?: string } }[] = [];
  globalThis.fetch = async (input, init) => {
    if (init?.method === "POST") { posted.push(JSON.parse(String(init.body))); return json({ error: "This appointment changed. Refresh and review it." }, 409); }
    const url = new URL(String(input), window.location.href);
    if (url.searchParams.has("appointmentId")) return json({ calendarId, date, slots: [{ practitionerId, start: `${date}T14:07:00Z`, end: `${date}T14:37:00Z` }] });
    return json(current);
  };
  await render(); await click(timelineButton()); await click(button(action === "cancel" ? "Cancel appointment" : "Move appointment", dayPanel()));
  if (action === "reschedule") { await settle(() => element("button.slot")); await click(element("button.slot")); }
  const dialog = element('[role="dialog"]'); current = fixture(); current.appointments[0].version = 2;
  await focusRefresh(); await settle(() => assert.equal(button("Book an appointment").disabled, false));
  await click(button(action === "cancel" ? "Cancel appointment" : "Confirm new time", dialog));
  assert.equal(posted[0].data.version, 1); assert.equal(posted[0].data.id, appointmentId); assert.equal(posted[0].action, action);
  if (action === "reschedule") assert.equal(posted[0].data.start, `${date}T14:07:00Z`);
});


test("an inactive practitioner filter remains labelled when its cancelled records are hidden", async () => {
  const current = fixture(); current.practitioners[0].active = false; current.appointments[0].status = "cancelled";
  globalThis.fetch = async () => json(current); await render();
  const checkbox = element<HTMLInputElement>('input[type="checkbox"]'); await click(checkbox);
  const filter = element<HTMLSelectElement>('[data-owner-workspace] select'); await choose(filter, practitionerId); await click(checkbox);
  assert.equal(filter.value, practitionerId); assert.match(filter.selectedOptions[0].textContent ?? "", /Alice · inactive/);
  assert.match(dayPanel().textContent ?? "", /No appointments on this day/);
});

test("setup checks remain available after revisit and lead to the missing configuration", async () => {
  const current = fixture(); current.practitioners = []; current.hours = []; current.appointments = [];
  globalThis.fetch = async () => json(current); await render();
  assert.match(dayPanel().textContent ?? "", /Finish the booking basics/);
  await click(button("Add a practitioner", dayPanel()));
  assert.match(element('[role="dialog"]').textContent ?? "", /Add myself/);
  await click(button("Back to calendar")); await settle(() => assert.equal(container.querySelector('[role="dialog"]'), null));
  assert.ok(dayPanel().querySelector('[aria-label="Salon setup"]'));
});

test("private saved-booking preview is local, excludes client data and survives only its parent panel", async () => {
  const requests: string[] = []; globalThis.fetch = async input => { requests.push(String(input)); return json(fixture()); };
  await render(); await click(button("Booking settings"));
  assert.equal([...container.querySelectorAll("button")].some(item => item.textContent === "Copy booking link"), false);
  const count = requests.length;
  await click(button("Preview saved booking details"));
  const preview = element('[aria-labelledby="salon-owner-booking-preview"]');
  assert.match(preview.textContent ?? "", /Synthetic Salon|Synthetic cut|Alice|Clients sign in/);
  assert.doesNotMatch(preview.textContent ?? "", /Synthetic Client|private@example|Private phone|Private appointment note|Private block reason/);
  assert.equal(requests.length, count);
  await click(button("Close preview", preview)); assert.equal(container.querySelector('[aria-labelledby="salon-owner-booking-preview"]'), null);
  await click(button("Preview saved booking details")); await act(async () => window.history.back());
  await settle(() => assert.equal(container.querySelector('[role="dialog"]'), null));
  await act(async () => window.history.forward()); await settle(() => assert.equal(container.querySelectorAll('[role="dialog"]').length, 1));
  assert.equal(container.querySelector('[aria-labelledby="salon-owner-booking-preview"]'), null);
});

test("enabled booking page copies only the current calendar URL and clipboard failures remain recoverable", async () => {
  const current = fixture(); current.settings.publicEnabled = true; globalThis.fetch = async () => json(current);
  let copied = ""; let denied = false;
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (value: string) => { if (denied) throw new Error("Denied"); copied = value; } } });
  await render(); await click(button("Booking settings")); await click(button("Copy booking link"));
  assert.equal(copied, `https://covie.example.invalid/booking/${calendarId}`); assert.match(container.textContent ?? "", /Booking link copied/);
  const link = element<HTMLAnchorElement>('a[href^="/booking/"]'); assert.equal(link.target, "_blank"); assert.match(link.rel, /noopener/);
  denied = true; await click(button("Copy booking link")); assert.match(container.textContent ?? "", /Could not copy/);
  delete (navigator as { clipboard?: unknown }).clipboard;
});

test("preview closes on refresh and is not resurrected after a fresh snapshot or demotion", async () => {
  let current = fixture(); globalThis.fetch = async () => json(current);
  await render(); await click(button("Booking settings")); await click(button("Preview saved booking details"));
  await focusRefresh(); await settle(() => assert.equal(button("Book an appointment").disabled, false));
  assert.equal(container.querySelector('[aria-labelledby="salon-owner-booking-preview"]'), null);
  await click(button("Preview saved booking details")); current = { ...fixture(), role: "manager", canPublish: false }; await focusRefresh();
  await settle(() => assert.equal(container.querySelector('[role="dialog"]'), null));
  assert.equal(container.querySelector('[aria-label="Salon setup"]'), null);
});

test("Escape dismisses only the nested saved-booking preview and restores its trigger", async () => {
  await render(); await click(button("Booking settings"));
  assert.equal(container.querySelectorAll('[role="dialog"]').length, 1);
  const trigger = button("Preview saved booking details"); trigger.focus(); await click(trigger);
  const preview = element('[aria-labelledby="salon-owner-booking-preview"]');
  await act(async () => preview.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
  assert.equal(container.querySelector('[aria-labelledby="salon-owner-booking-preview"]'), null);
  assert.equal(container.querySelectorAll('[role="dialog"]').length, 1);
  assert.equal(new URL(window.location.href).searchParams.get("panel"), "booking-settings");
  assert.equal(document.activeElement, trigger);
  await click(button("Preview saved booking details"));
  assert.equal(container.querySelectorAll('[role="dialog"]').length, 2);
});

test("owner shell bounds long calendar names without changing the shared switcher", async () => {
  const { readFileSync } = await import("node:fs");
  const css = readFileSync(new URL("../components/workspace/owner-calendar-workspace.module.css", import.meta.url), "utf8");
  const shell = readFileSync(new URL("../components/templates/template-shell.tsx", import.meta.url), "utf8");
  assert.match(css, /\.ownerHeader :global\(\.calendar-switcher > summary\) \{ max-width: 100%; \}/);
  assert.match(shell, /workspaceRole === "owner" \|\| staffAccessRole === "owner" \? ownerWorkspaceStyles.ownerHeader/);
});
