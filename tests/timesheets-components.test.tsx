import "./support/salon-dom-environment";
import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, test } from "node:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { TimesheetsData } from "../lib/timesheets/contracts";
import { calendarPathForType, calendarTemplateManifests, getCalendarTemplateBySlug } from "../lib/templates/calendar-templates";
import { workspaceOrganiserTools } from "../lib/templates/workspace-navigation";
import { dom, styleHooks } from "./support/salon-dom-environment";

let TimesheetsPage: typeof import("../components/timesheets/timesheets-page").TimesheetsPage;
let root: Root, container: HTMLDivElement;
const originalFetch = globalThis.fetch;
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const requests: { url: string; init?: RequestInit }[] = [];
function fixture(calendarId = "calendar-a", role: "owner" | "manager" | "member" = "owner"): TimesheetsData {
  return { calendarId, date: "2026-10-08", view: "week", role, ownStaffId: "self", organisation: { id: "org", name: "Sample organisation", timezone: "UTC", incrementMinutes: 15, version: 3 },
    staff: [{ id: "self", displayName: "Morgan", email: "morgan@example.test", role, active: true, own: true, linked: true, version: 1 }, { id: "staff", displayName: "Taylor", email: "taylor@example.test", role: "member", active: true, own: false, linked: false, version: 2 }, { id: "manager", displayName: "Jamie", email: "jamie@example.test", role: "manager", active: true, own: false, linked: true, version: 1 }],
    clients: [{ id: "client", name: "Sample client", active: true, version: 1 }], projects: [{ id: "project", clientId: "client", name: "Sample project", active: true, version: 1 }], assignments: [{ managerStaffId: role === "manager" ? "self" : "manager", staffId: "staff" }], invitations: [],
    entries: [{ id: "entry", staffId: "self", clientId: "client", projectId: "project", start: "2026-10-08T09:00:00Z", end: "2026-10-08T10:00:00Z", timezone: "UTC", notes: "Private work note", billable: true, durationMinutes: 60, incrementMinutes: 15, version: 1 }, { id: "other-entry", staffId: "staff", clientId: null, projectId: null, start: "2026-10-08T10:00:00Z", end: "2026-10-08T10:30:00Z", timezone: "UTC", notes: "Team work note", billable: false, durationMinutes: 30, incrementMinutes: 15, version: 2 }], totals: [{ staffId: "self", totalMinutes: 60, billableMinutes: 60 }, { staffId: "staff", totalMinutes: 30, billableMinutes: 0 }] };
}
function element<T extends Element = HTMLElement>(selector: string, scope: ParentNode = container): T { const node = scope.querySelector<T>(selector); assert.ok(node, `Missing ${selector}`); return node; }
function button(text: string, scope: ParentNode = container) { const node = [...scope.querySelectorAll("button")].find(node => node.textContent?.trim() === text); assert.ok(node, `Missing button ${text}`); return node; }
async function click(node: HTMLElement) { await act(async () => node.click()); }
async function change(node: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  await act(async () => {
    const prototype = node.tagName === "SELECT" ? dom.window.HTMLSelectElement.prototype : node.tagName === "TEXTAREA" ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(node, value);
    node.dispatchEvent(new Event(node.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
  });
}
async function settle(check: () => void) { let failure: unknown; for (let i = 0; i < 60; i++) { await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); }); try { check(); return; } catch (error) { failure = error; } } throw failure; }
async function render(calendarId = "calendar-a", section: "calendar" | "organiser" | "updates" = "calendar", tool?: string) { await act(async () => root.render(<TimesheetsPage calendarId={calendarId} section={section} tool={tool} initialDate="2026-10-08" />)); }
function installFetch(data = fixture()) {
  globalThis.fetch = async (input, init) => { requests.push({ url: String(input), init }); if (init?.method === "POST") return json({ ok: true }); const url = new URL(String(input), "https://covie.example.invalid"); return json({ ...data, date: url.searchParams.get("date") ?? data.date, view: url.searchParams.get("view") ?? data.view }); };
}
before(async () => { ({ TimesheetsPage } = await import("../components/timesheets/timesheets-page")); });
beforeEach(() => { Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: 1440 }); container = document.createElement("div"); document.body.append(container); root = createRoot(container); requests.length = 0; installFetch(); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); globalThis.fetch = originalFetch; });
after(() => { styleHooks.deregister(); dom.window.close(); });

test("Timesheets has its own type, route and role-scoped organisation tools", () => {
  assert.equal(getCalendarTemplateBySlug("timesheets").id, "timesheets");
  assert.equal(calendarPathForType("timesheets"), "/calendar-types/timesheets");
  assert.equal(calendarTemplateManifests.timesheets.primaryScheduledEntity, "Work block");
  assert.deepEqual(workspaceOrganiserTools("timesheets", "owner").map(tool => tool.key), ["team", "clients-projects", "settings"]);
  assert.deepEqual(workspaceOrganiserTools("timesheets", "manager").map(tool => tool.key), ["team"]);
  assert.deepEqual(workspaceOrganiserTools("timesheets", "member"), []);
  assert.equal(calendarTemplateManifests.staff_rosters.organiserTools.find(tool => tool.key === "timesheets")?.label, "Time & attendance");
});

test("week/day work calendar, exact totals, staff filters and scoped requests", async () => {
  await render(); await settle(() => assert.match(container.textContent!, /Private work note/));
  assert.equal(container.querySelectorAll('.day').length, 7);
  assert.equal(button("Week").getAttribute("aria-pressed"), "true");
  assert.match(element('[aria-label="Selected period totals"]').textContent!, /1h 0mTotal recorded1h 0mBillable0h 0mNon-billable/);
  assert.equal(new Headers(requests[0].init?.headers).get("x-covie-calendar-id"), "calendar-a");
  assert.equal(requests[0].init?.cache, "no-store");
  await change(element("select"), "all"); assert.match(container.textContent!, /Team work note/);
  await click(button("Day")); await settle(() => assert.equal(container.querySelectorAll('.day').length, 1));
  assert.match(container.textContent!, /Team work note/);
  assert.match(element('[aria-label="Selected period totals"]').textContent!, /1h 30mTotal recorded/);
});

test("entry editor rejects inexact durations and sends a versioned edit once", async () => {
  await render(); await settle(() => assert.match(container.textContent!, /Private work note/));
  await click(element('.block'));
  const times = container.querySelectorAll<HTMLInputElement>('input[type="datetime-local"]');
  await change(times[1], "2026-10-08T10:07");
  assert.equal(button("Save work block").disabled, true); assert.match(container.textContent!, /exact multiple of 15 minutes/);
  await change(times[1], "2026-10-08T10:15");
  let resolve!: (response: Response) => void;
  globalThis.fetch = async (input, init) => { requests.push({ url: String(input), init }); return init?.method === "POST" ? new Promise(done => { resolve = done; }) : json(fixture()); };
  const save = button("Save work block"); await act(async () => { save.click(); save.click(); });
  assert.equal(requests.filter(request => request.init?.method === "POST").length, 1);
  const payload = JSON.parse(requests.find(request => request.init?.method === "POST")!.init!.body as string);
  assert.equal(payload.action, "saveEntry"); assert.equal(payload.data.id, "entry"); assert.equal(payload.data.version, 1); assert.equal(payload.data.organisationVersion, 3); assert.equal(payload.data.endLocal, "2026-10-08T10:15");
  await act(async () => resolve(json({ ok: true })));
  await settle(() => assert.equal(Boolean(container.querySelector('[role="dialog"]')), false));
});

test("owner and manager corrections to another staff member require a reason", async () => {
  installFetch(fixture("calendar-a", "manager")); await render(); await settle(() => assert.match(container.textContent!, /Private work note/));
  await change(element("select"), "staff"); await click(element('.block'));
  assert.match(container.textContent!, /Reason for this correction/);
  await act(async () => element<HTMLFormElement>("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  assert.equal(requests.filter(request => request.init?.method === "POST").length, 0);
  assert.match(container.textContent!, /at least 3 characters/);
  await change(element('textarea[maxlength="500"]'), "Corrected from work record");
  await click(button("Save work block"));
  await settle(() => assert.equal(requests.filter(request => request.init?.method === "POST").length, 1));
  assert.equal(JSON.parse(requests.find(request => request.init?.method === "POST")!.init!.body as string).data.reason, "Corrected from work record");
});

test("failed revalidation clears records, dialogs, totals and staff details", async () => {
  await render(); await settle(() => assert.match(container.textContent!, /Private work note/)); await click(element('.block'));
  globalThis.fetch = async () => json({ error: "Revoked" }, 403);
  await act(async () => window.dispatchEvent(new Event("pageshow")));
  await settle(() => assert.match(container.textContent!, /timesheets are unavailable/));
  assert.equal(Boolean(container.querySelector('[role="dialog"]')), false);
  assert.doesNotMatch(container.textContent!, /Private work note|Morgan|Sample organisation|Billable/);
});

test("superseded calendar read is aborted and cannot restore private records", async () => {
  let resolveOld!: (response: Response) => void, oldSignal: AbortSignal | undefined;
  globalThis.fetch = async (_input, init) => { oldSignal = init?.signal ?? undefined; return new Promise(resolve => { resolveOld = resolve; }); };
  await render(); await settle(() => assert.equal(typeof resolveOld, "function"));
  const empty = { ...fixture("calendar-b"), entries: [], staff: [], ownStaffId: null, totals: [] };
  installFetch(empty); await render("calendar-b"); await settle(() => assert.match(container.textContent!, /No work recorded/));
  assert.equal(oldSignal?.aborted, true);
  await act(async () => resolveOld(json(fixture())));
  assert.doesNotMatch(container.textContent!, /Private work note|Morgan/);
});

test("cross-tab invalidation clears snapshots and a mismatched response never renders", async () => {
  await render(); await settle(() => assert.match(container.textContent!, /Private work note/));
  globalThis.fetch = async () => json(fixture("wrong-calendar"));
  await act(async () => window.dispatchEvent(new Event("storage")));
  assert.doesNotMatch(container.textContent!, /Private work note/);
  await settle(() => assert.match(container.textContent!, /timesheets are unavailable/));
});

test("staff sees own work and cannot open organisation settings", async () => {
  const data = fixture("calendar-a", "member"); data.staff = data.staff.filter(person => person.own); data.entries = data.entries.filter(entry => entry.staffId === "self"); data.totals = data.totals.filter(total => total.staffId === "self"); installFetch(data);
  await render(); await settle(() => assert.match(container.textContent!, /Your own work only/));
  assert.doesNotMatch(container.textContent!, /Show work for|Team totals/);
  await render("calendar-a", "organiser", "settings"); await settle(() => assert.match(container.textContent!, /Only the organisation owner/));
  assert.equal(container.querySelector('form'), null);
});

test("settings expose permitted increments and never imply rounding old entries", async () => {
  await render("calendar-a", "organiser", "settings"); await settle(() => assert.ok(container.querySelector("select")));
  assert.deepEqual([...element<HTMLSelectElement>("select").options].map(option => option.value), ["5", "10", "15", "30", "60"]);
  assert.equal(element<HTMLSelectElement>("select").value, "15");
  assert.match(container.textContent!, /leaves existing entries unchanged/);
  await change(element("select"), "30"); await click(button("Save settings"));
  await settle(() => assert.equal(requests.filter(request => request.init?.method === "POST").length, 1));
  assert.equal(JSON.parse(requests.find(request => request.init?.method === "POST")!.init!.body as string).data.incrementMinutes, 30);
});

test("owner invitations expose profile email and returned personal link without email sending", async () => {
  await render("calendar-a", "organiser", "team"); await settle(() => assert.match(container.textContent!, /taylor@example.test/));
  assert.equal(container.querySelector('input[readonly]'), null);
  globalThis.fetch = async (input, init) => { requests.push({ url: String(input), init }); return json(init?.method === "POST" ? { ok: true, invitationUrl: "/timesheets/invite/synthetic-token" } : fixture()); };
  await click(button("Create invitation link"));
  await settle(() => assert.equal(element<HTMLInputElement>('input[readonly]').value, "https://covie.example.invalid/timesheets/invite/synthetic-token"));
  assert.match(container.textContent!, /no email was sent/);
  assert.equal(JSON.parse(requests.find(request => request.init?.method === "POST")!.init!.body as string).action, "createInvite");
});

test("linked profile emails are immutable and managers cannot add or assign staff", async () => {
  installFetch(fixture("calendar-a", "manager")); await render("calendar-a", "organiser", "team"); await settle(() => assert.match(container.textContent!, /taylor@example.test/));
  assert.doesNotMatch(container.textContent!, /Add staff member|Assigned managers/);
  assert.equal([...container.querySelectorAll("button")].filter(node => node.textContent === "Edit profile").length, 1);
  await click(button("Edit profile")); assert.equal(element<HTMLSelectElement>('select').disabled, true);
  await click(button("Cancel"));
  installFetch(fixture()); await render("calendar-b", "organiser", "team");
  // The wrong response identity is rejected rather than displaying another calendar's profiles.
  await settle(() => assert.match(container.textContent!, /timesheets are unavailable/));
});

test("unchanged old entry time preserves its increment while display follows organisation timezone", async () => {
  const data = fixture(); data.organisation.timezone = "Pacific/Auckland"; data.organisation.incrementMinutes = 30;
  data.entries[0] = { ...data.entries[0], start: "2026-10-07T20:00:00Z", end: "2026-10-07T20:15:00Z", incrementMinutes: 15, durationMinutes: 15 };
  installFetch(data); await render(); await settle(() => assert.match(container.textContent!, /Private work note/)); await click(element('.block'));
  assert.equal(element<HTMLInputElement>('input[type="datetime-local"]').value, "2026-10-08T09:00");
  assert.equal(button("Save work block").disabled, false);
  assert.match(container.textContent!, /15-minute increments/);
});

test("owner cannot retarget a linked staff account or an existing project", async () => {
  await render("calendar-a", "organiser", "team"); await settle(() => assert.match(container.textContent!, /jamie@example.test/));
  const article = [...container.querySelectorAll("article")].find(article => article.textContent?.includes("jamie@example.test"))!;
  await click(button("Edit profile", article));
  assert.equal(element<HTMLInputElement>('input[type="email"]').disabled, true);
  await render("calendar-a", "organiser", "clients-projects"); await settle(() => assert.match(container.textContent!, /Sample project/));
  await click(button("Edit Sample project"));
  assert.equal(element<HTMLSelectElement>('select').disabled, true);
  assert.match(container.textContent!, /client of an existing project cannot change/);
});

test("work block history is scoped, descriptive and cancelled with the dialog", async () => {
  await render(); await settle(() => assert.match(container.textContent!, /Private work note/)); await click(element('.block'));
  let historySignal: AbortSignal | undefined;
  globalThis.fetch = async (input, init) => { requests.push({ url: String(input), init }); historySignal = init?.signal ?? undefined; return json({ calendarId: "calendar-a", history: [{ id: "change", action: "update", reason: "Corrected client notes", createdAt: "2026-10-08T11:00:00Z", ownActor: false, actorName: "Casey", before: fixture().entries[0], after: { ...fixture().entries[0], notes: "Reviewed project outline" } }] }); };
  await click(button("View change history")); await settle(() => assert.match(container.textContent!, /Corrected client notes/));
  assert.match(container.textContent!, /Updated by Casey/);
  const history = element('[aria-label="Work block change history"]');
  await click(element("summary", history));
  assert.match(history.textContent!, /Private work note/);
  assert.match(history.textContent!, /Reviewed project outline/);
  assert.match(history.textContent!, /Sample client/);
  assert.match(history.textContent!, /Sample project/);
  assert.match(history.textContent!, /2026-10-08 09:00/);
  assert.ok(requests.at(-1)!.url.includes("entryId=entry"));
  assert.equal(new Headers(requests.at(-1)!.init?.headers).get("x-covie-calendar-id"), "calendar-a");
  await click(button("Cancel")); assert.equal(historySignal?.aborted, true);
  assert.doesNotMatch(container.textContent!, /Corrected client notes/);
});

test("Escape dismisses the editor without changing work and restores focus", async () => {
  await render(); await settle(() => assert.match(container.textContent!, /Private work note/));
  const block = element<HTMLButtonElement>('.block');
  await act(async () => block.focus()); await click(block);
  await act(async () => element('[role="dialog"]').dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  assert.equal(Boolean(container.querySelector('[role="dialog"]')), false);
  assert.equal(document.activeElement === block, true);
  assert.equal(requests.filter(request => request.init?.method === "POST").length, 0);
});

test("a mutation started in one calendar cannot update the next calendar", async () => {
  await render(); await settle(() => assert.match(container.textContent!, /Private work note/)); await click(element('.block'));
  let finish!: (response: Response) => void, mutationSignal: AbortSignal | undefined;
  globalThis.fetch = async (_input, init) => { mutationSignal = init?.signal ?? undefined; return new Promise(resolve => { finish = resolve; }); };
  await click(button("Save work block")); await settle(() => assert.equal(typeof finish, "function"));
  installFetch({ ...fixture("calendar-b"), entries: [], staff: [], totals: [], ownStaffId: null });
  await render("calendar-b"); await settle(() => assert.match(container.textContent!, /No work recorded/));
  assert.equal(mutationSignal?.aborted, true);
  await act(async () => finish(json({ ok: true, invitationUrl: "/timesheets/invite/not-for-this-calendar" })));
  assert.doesNotMatch(container.textContent!, /Saved\.|Private work note|not-for-this-calendar/);
});

test("CSV export uses the current scope and discards a download after navigation", async () => {
  await render(); await settle(() => assert.match(container.textContent!, /Private work note/));
  let finish!: (response: Response) => void;
  globalThis.fetch = async (input, init) => { requests.push({ url: String(input), init }); return new Promise(resolve => { finish = resolve; }); };
  await click(button("Export period CSV")); await click(button("Exporting…"));
  const csvRequests = requests.filter(request => request.url.includes("format=csv"));
  assert.equal(csvRequests.length, 1); assert.equal(new Headers(csvRequests[0].init?.headers).get("x-covie-calendar-id"), "calendar-a");
  installFetch({ ...fixture("calendar-b"), entries: [], staff: [], totals: [], ownStaffId: null });
  await render("calendar-b"); await settle(() => assert.match(container.textContent!, /No work recorded/));
  await act(async () => finish(new Response("staff,minutes\nMorgan,60", { headers: { "content-type": "text/csv" } })));
  assert.doesNotMatch(container.textContent!, /Morgan|Private work note/);
});


test("organisation settings conflicts discard the stale editor and reload current timezone before retry", async () => {
  await render(); await settle(() => assert.match(container.textContent!, /Private work note/)); await click(element('.block'));
  await change(element('textarea[maxlength="4000"]'), "Unsaved note in old timezone");
  const current = fixture(); current.organisation = { ...current.organisation, version: 4, timezone: "Pacific/Auckland", incrementMinutes: 30 };
  globalThis.fetch = async (input, init) => { requests.push({ url: String(input), init }); return init?.method === "POST" ? json({ error: "Organisation settings changed. Reload before saving." }, 409) : json(current); };
  await click(button("Save work block"));
  await settle(() => assert.match(container.textContent!, /Organisation settings changed/));
  const mutation = requests.find(request => request.init?.method === "POST")!;
  assert.equal(JSON.parse(mutation.init!.body as string).data.organisationVersion, 3);
  assert.equal(Boolean(container.querySelector('[role="dialog"]')), false);
  assert.doesNotMatch(container.textContent!, /Unsaved note in old timezone/);
  assert.match(container.textContent!, /Pacific\/Auckland/);
  await click(element('.block'));
  assert.equal(element<HTMLInputElement>('input[type="datetime-local"]').value, "2026-10-08T22:00");
  assert.equal(element<HTMLTextAreaElement>('textarea[maxlength="4000"]').value, "Private work note");
});


async function viewport(width: number) {
  await act(async () => { Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: width }); window.dispatchEvent(new Event("resize")); });
}

test("narrow calendars default to Day and an explicit view survives resizing, dates and refresh", async () => {
  await viewport(390); await render();
  await settle(() => assert.equal(button("Day").getAttribute("aria-pressed"), "true"));
  assert.equal(container.querySelectorAll('.day').length, 1);
  assert.ok(requests.every(request => new URL(request.url, "https://covie.example.invalid").searchParams.get("view") === "day"));
  await click(button("Week")); await settle(() => assert.equal(container.querySelectorAll('.day').length, 7));
  assert.equal(element('[data-timesheets-date="2026-10-08"]').getAttribute("aria-current"), "date");
  await viewport(1440); await viewport(320);
  assert.equal(button("Week").getAttribute("aria-pressed"), "true");
  await click(element('[aria-label="Next week"]'));
  await settle(() => assert.equal(element<HTMLInputElement>('[aria-label="Selected date"]').value, "2026-10-15"));
  assert.equal(button("Week").getAttribute("aria-pressed"), "true");
  await click(button("Day")); await settle(() => assert.equal(container.querySelectorAll('.day').length, 1));
  await viewport(1440); assert.equal(button("Day").getAttribute("aria-pressed"), "true");
  await click(element('[aria-label="Refresh timesheets"]'));
  await settle(() => assert.equal(button("Day").getAttribute("aria-pressed"), "true"));
});

test("choosing the default Day explicitly keeps it when moving to a wide screen", async () => {
  await viewport(320); await render(); await settle(() => assert.equal(button("Day").getAttribute("aria-pressed"), "true"));
  await click(button("Day")); await viewport(1440);
  assert.equal(button("Day").getAttribute("aria-pressed"), "true");
  assert.equal(container.querySelectorAll('.day').length, 1);
});

test("week selection scrolls only its own calendar horizontally toward the selected day", async () => {
  await viewport(320); await render(); await settle(() => assert.equal(button("Day").getAttribute("aria-pressed"), "true"));
  const prototype = dom.window.HTMLElement.prototype;
  const originalRect = prototype.getBoundingClientRect;
  const originalClient = Object.getOwnPropertyDescriptor(prototype, "clientWidth");
  const originalScroll = Object.getOwnPropertyDescriptor(prototype, "scrollWidth");
  Object.defineProperty(prototype, "clientWidth", { configurable: true, get() { return this.getAttribute("aria-label") === "Week work calendar" ? 296 : 0; } });
  Object.defineProperty(prototype, "scrollWidth", { configurable: true, get() { return this.getAttribute("aria-label") === "Week work calendar" ? 700 : 0; } });
  prototype.getBoundingClientRect = function () { const selected = this.getAttribute("data-timesheets-date") === "2026-10-08"; const region = this.getAttribute("aria-label") === "Week work calendar"; return { x: selected ? 300 : 0, y: 400, left: selected ? 300 : 0, top: 400, right: selected ? 400 : region ? 296 : 0, bottom: 500, width: selected ? 100 : region ? 296 : 0, height: 100, toJSON() { return {}; } }; };
  try {
    await click(button("Week")); await settle(() => assert.equal(container.querySelectorAll('.day').length, 7));
    assert.equal(element<HTMLElement>('[aria-label="Week work calendar"]').scrollLeft, 202);
    assert.equal(window.scrollY, 0);
  } finally {
    prototype.getBoundingClientRect = originalRect;
    if (originalClient) Object.defineProperty(prototype, "clientWidth", originalClient); else Reflect.deleteProperty(prototype, "clientWidth");
    if (originalScroll) Object.defineProperty(prototype, "scrollWidth", originalScroll); else Reflect.deleteProperty(prototype, "scrollWidth");
  }
});


test("resizing an initial mobile Day view does not discard an open work draft", async () => {
  await viewport(390); await render(); await settle(() => assert.equal(button("Day").getAttribute("aria-pressed"), "true"));
  await click(button("Add work block")); await change(element('textarea[maxlength="4000"]'), "Draft survives rotation");
  const count = requests.length; await viewport(1440);
  assert.equal(Boolean(container.querySelector('[role="dialog"]')), true);
  assert.equal(element<HTMLTextAreaElement>('textarea[maxlength="4000"]').value, "Draft survives rotation");
  assert.equal(requests.length, count);
});
