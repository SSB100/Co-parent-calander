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
    workTypes: [{ id: "general", name: "General work", active: true, version: 1 }, { id: "meeting", name: "Meeting", active: true, version: 2 }, { id: "old-break", name: "Old break", active: false, version: 3 }],
    clients: [{ id: "client", name: "Sample client", active: true, version: 1 }], projects: [{ id: "project", clientId: "client", name: "Sample project", active: true, version: 1 }], assignments: [{ managerStaffId: role === "manager" ? "self" : "manager", staffId: "staff" }], invitations: [],
    entries: [{ id: "entry", staffId: "self", clientId: "client", projectId: "project", workTypeId: "general", workTypeName: "General work", start: "2026-10-08T09:00:00Z", end: "2026-10-08T10:00:00Z", timezone: "UTC", notes: "Private work note", billable: true, durationMinutes: 60, incrementMinutes: 15, version: 1 }, { id: "other-entry", staffId: "staff", clientId: null, projectId: null, workTypeId: null, workTypeName: null, start: "2026-10-08T10:00:00Z", end: "2026-10-08T10:30:00Z", timezone: "UTC", notes: "Team work note", billable: false, durationMinutes: 30, incrementMinutes: 15, version: 2 }], totals: [{ staffId: "self", totalMinutes: 60, billableMinutes: 60 }, { staffId: "staff", totalMinutes: 30, billableMinutes: 0 }] };
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
  assert.deepEqual(workspaceOrganiserTools("timesheets", "owner").map(tool => tool.key), ["team", "clients-projects", "work-types", "settings"]);
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
  prototype.getBoundingClientRect = function () { const selected = this.getAttribute("data-timesheets-date") === "2026-10-08"; const region = this.getAttribute("aria-label") === "Week work calendar"; return { x: selected ? 300 : 0, y: 400, left: selected ? 300 : 0, top: 400, right: selected ? 400 : region ? 296 : 0, bottom: 500, width: selected ? 100 : region ? 296 : this.classList.contains("hourGutter") ? 48 : 0, height: 100, toJSON() { return {}; } }; };
  try {
    await click(button("Week")); await settle(() => assert.equal(container.querySelectorAll('.day').length, 7));
    assert.equal(element<HTMLElement>('[aria-label="Week work calendar"]').scrollLeft, 178);
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

function field<T extends HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(label: string): T {
  const wrapper = [...container.querySelectorAll("label")].find(node => node.querySelector("span")?.textContent === label);
  assert.ok(wrapper, `Missing field ${label}`);
  return element<T>("input, select, textarea", wrapper);
}
function mutations() { return requests.filter(request => request.init?.method === "POST").map(request => JSON.parse(request.init!.body as string)); }

test("only owners can access work type controls, including a direct Organiser route", async () => {
  await render("calendar-a", "organiser", "work-types");
  await settle(() => assert.ok(button("Add work type")));
  assert.match(container.textContent!, /General work|Meeting|Old break/);
  assert.ok(element('[aria-label="Rename General work"]'));
  assert.ok(element('[aria-label="Archive General work"]'));
  assert.ok(element('[aria-label="Restore Old break"]'));
  for (const role of ["manager", "member"] as const) {
    const calendarId = `calendar-${role}`;
    installFetch(fixture(calendarId, role));
    await render(calendarId, "organiser", "work-types");
    await settle(() => assert.match(container.textContent!, /Only the organisation owner can manage work types/));
    assert.equal(container.querySelector("button"), null);
    assert.equal(container.querySelector("form"), null);
  }
  assert.equal(mutations().length, 0);
});

test("an owner can create a trimmed work type once and see the saved result", async () => {
  const data = fixture(); data.workTypes = [];
  installFetch(data); await render("calendar-a", "organiser", "work-types");
  await settle(() => assert.match(container.textContent!, /Add your first work type/));
  await click(button("Add work type"));
  assert.equal(button("Save work type").disabled, true);
  await change(field("Work type name"), "   ");
  assert.equal(button("Save work type").disabled, true);
  await change(field("Work type name"), "  Lunch break  ");
  let finish!: (response: Response) => void;
  globalThis.fetch = async (input, init) => {
    requests.push({ url: String(input), init });
    if (init?.method === "POST") return new Promise(resolve => { finish = resolve; });
    return json(data);
  };
  const save = button("Save work type");
  await act(async () => { save.click(); save.click(); });
  assert.deepEqual(mutations(), [{ action: "saveWorkType", data: { name: "Lunch break", active: true } }]);
  assert.equal(field("Work type name").closest("fieldset")!.disabled, true);
  assert.equal(button("Cancel").disabled, true);
  data.workTypes.push({ id: "lunch", name: "Lunch break", active: true, version: 1 });
  await act(async () => finish(json({ ok: true })));
  await settle(() => assert.equal(container.querySelector('[role="dialog"]'), null));
  assert.match(container.textContent!, /Saved\./);
  assert.ok(element('[aria-label="Archive Lunch break"]'));
});

test("renaming sends the work type version and cancellation or Escape discards drafts", async () => {
  const data = fixture(); installFetch(data);
  await render("calendar-a", "organiser", "work-types");
  await settle(() => assert.ok(element('[aria-label="Rename Meeting"]')));
  const opener = element<HTMLButtonElement>('[aria-label="Rename Meeting"]');
  await act(async () => opener.focus()); await click(opener);
  assert.equal(field<HTMLInputElement>("Work type name").value, "Meeting");
  await change(field("Work type name"), "Discard this name"); await click(button("Cancel"));
  assert.equal(container.querySelector('[role="dialog"]'), null);
  assert.equal(document.activeElement, opener);
  assert.equal(mutations().length, 0);
  await click(opener); assert.equal(field<HTMLInputElement>("Work type name").value, "Meeting");
  await change(field("Work type name"), "Discard with Escape");
  await act(async () => element('[role="dialog"]').dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  assert.equal(container.querySelector('[role="dialog"]'), null);
  assert.equal(document.activeElement, opener);
  assert.equal(mutations().length, 0);
  await click(opener); await change(field("Work type name"), "Team meeting");
  globalThis.fetch = async (input, init) => {
    requests.push({ url: String(input), init });
    if (init?.method === "POST") { data.workTypes[1] = { ...data.workTypes[1], name: "Team meeting", version: 3 }; return json({ ok: true }); }
    return json(data);
  };
  await click(button("Save work type"));
  await settle(() => assert.ok(element('[aria-label="Rename Team meeting"]')));
  assert.deepEqual(mutations(), [{ action: "saveWorkType", data: { id: "meeting", version: 2, name: "Team meeting", active: true } }]);
});

test("owners archive and restore work types with the latest version", async () => {
  const data = fixture(); installFetch(data);
  await render("calendar-a", "organiser", "work-types");
  await settle(() => assert.ok(element('[aria-label="Archive Meeting"]')));
  globalThis.fetch = async (input, init) => {
    requests.push({ url: String(input), init });
    if (init?.method === "POST") {
      const command = JSON.parse(init.body as string);
      data.workTypes[1] = { ...data.workTypes[1], active: command.data.active, version: data.workTypes[1].version + 1 };
      return json({ ok: true });
    }
    return json(data);
  };
  await click(element('[aria-label="Archive Meeting"]'));
  await settle(() => assert.ok(element('[aria-label="Restore Meeting"]')));
  assert.match(element('[aria-label="Restore Meeting"]').closest("article")!.textContent!, /Archived/);
  await click(element('[aria-label="Restore Meeting"]'));
  await settle(() => assert.ok(element('[aria-label="Archive Meeting"]')));
  assert.deepEqual(mutations(), [
    { action: "saveWorkType", data: { id: "meeting", name: "Meeting", active: false, version: 2 } },
    { action: "saveWorkType", data: { id: "meeting", name: "Meeting", active: true, version: 3 } },
  ]);
});

test("a conflicting work type edit refreshes the current name and discards its stale draft", async () => {
  const data = fixture(); installFetch(data);
  await render("calendar-a", "organiser", "work-types");
  await settle(() => assert.ok(element('[aria-label="Rename Meeting"]')));
  await click(element('[aria-label="Rename Meeting"]')); await change(field("Work type name"), "Stale meeting name");
  data.workTypes[1] = { ...data.workTypes[1], name: "Current meeting name", version: 3 };
  globalThis.fetch = async (input, init) => {
    requests.push({ url: String(input), init });
    return init?.method === "POST" ? json({ error: "Work type changed. Reload before saving." }, 409) : json(data);
  };
  await click(button("Save work type"));
  await settle(() => assert.match(container.textContent!, /Work type changed/));
  assert.equal(container.querySelector('[role="dialog"]'), null);
  assert.doesNotMatch(container.textContent!, /Stale meeting name/);
  await click(element('[aria-label="Rename Current meeting name"]'));
  assert.equal(field<HTMLInputElement>("Work type name").value, "Current meeting name");
});

test("staff can select an active work type without changing billing or client defaults", async () => {
  const data = fixture("calendar-a", "member"); installFetch(data);
  await render(); await settle(() => assert.match(container.textContent!, /Your own work only/));
  await click(button("Add work block"));
  const select = field<HTMLSelectElement>("Work type");
  assert.equal(select.value, ""); assert.equal(select.required, false);
  assert.deepEqual([...select.options].map(option => option.textContent), ["No work type", "General work", "Meeting"]);
  assert.equal(element<HTMLInputElement>('input[type="checkbox"]').checked, false);
  await change(select, "meeting");
  assert.equal(element<HTMLInputElement>('input[type="checkbox"]').checked, false);
  await click(button("Save work block"));
  await settle(() => assert.equal(mutations().length, 1));
  assert.equal(mutations()[0].data.workTypeId, "meeting");
  assert.equal(mutations()[0].data.billable, false);
  assert.equal(mutations()[0].data.clientId, null);
  assert.equal(mutations()[0].data.projectId, null);
  assert.equal("workTypeName" in mutations()[0].data, false);
});

test("staff may save work with no type, and cancel leaves their saved choice untouched", async () => {
  installFetch(fixture("calendar-a", "member")); await render();
  await settle(() => assert.match(container.textContent!, /Private work note/));
  await click(element('.block'));
  assert.equal(field<HTMLSelectElement>("Work type").value, "general");
  await change(field("Work type"), "meeting"); await click(button("Cancel"));
  assert.equal(mutations().length, 0);
  await click(element('.block'));
  assert.equal(field<HTMLSelectElement>("Work type").value, "general");
  await click(button("Cancel")); await click(button("Add work block")); await click(button("Save work block"));
  await settle(() => assert.equal(mutations().length, 1));
  assert.equal(mutations()[0].data.workTypeId, null);
});

test("renamed work types keep the saved calendar and editor label, including notes-only saves", async () => {
  const data = fixture(); data.workTypes[0].name = "General duties";
  installFetch(data); await render(); await settle(() => assert.match(container.textContent!, /Private work note/));
  const block = element('.block');
  assert.match(block.textContent!, /General work/); assert.doesNotMatch(block.textContent!, /General duties/);
  assert.match(block.getAttribute("aria-label")!, /General work/);
  await click(block);
  const select = field<HTMLSelectElement>("Work type");
  assert.equal(select.value, "general");
  assert.equal(select.selectedOptions[0].textContent, "General work (saved name; now General duties)");
  assert.match(container.textContent!, /Keeping this choice preserves the saved name/);
  await change(field("Work notes"), "Notes changed after rename");
  await click(button("Save work block"));
  await settle(() => assert.equal(mutations().length, 1));
  assert.equal(mutations()[0].data.workTypeId, "general");
  assert.equal(mutations()[0].data.billable, true);
  assert.equal("workTypeName" in mutations()[0].data, false);
});

test("an archived saved work type can be retained during a timing correction but cannot be newly chosen", async () => {
  const data = fixture(); data.workTypes[0].active = false;
  installFetch(data); await render(); await settle(() => assert.match(container.textContent!, /Private work note/));
  await click(element('.block'));
  const select = field<HTMLSelectElement>("Work type");
  assert.equal(select.value, "general");
  assert.equal(select.selectedOptions[0].textContent, "General work (archived)");
  assert.equal(select.selectedOptions[0].disabled, false);
  assert.match(container.textContent!, /you can keep it on this work block/);
  await change(field("End"), "2026-10-08T10:15"); await click(button("Save work block"));
  await settle(() => assert.equal(container.querySelector('[role="dialog"]'), null));
  assert.equal(mutations()[0].data.workTypeId, "general");
  assert.equal(mutations()[0].data.endLocal, "2026-10-08T10:15");
  await click(element('.block'));
  await change(field("Work type"), "meeting");
  assert.equal([...field<HTMLSelectElement>("Work type").options].some(option => option.value === "general"), true);
  await change(field("Work type"), "general");
  assert.equal(field<HTMLSelectElement>("Work type").selectedOptions[0].textContent, "General work (archived)");
  await change(field("Work type"), ""); await click(button("Save work block"));
  await settle(() => assert.equal(container.querySelector('[role="dialog"]'), null));
  assert.equal(mutations()[1].data.workTypeId, null);
  await click(button("Add work block"));
  assert.deepEqual([...field<HTMLSelectElement>("Work type").options].map(option => option.value), ["", "meeting"]);
});

test("change history displays each saved work type name rather than the renamed catalogue label", async () => {
  const data = fixture(); data.workTypes[0].name = "General duties";
  installFetch(data); await render(); await settle(() => assert.match(container.textContent!, /Private work note/));
  await click(element('.block'));
  globalThis.fetch = async () => json({ calendarId: "calendar-a", history: [
    { id: "change-type", action: "update", reason: null, createdAt: "2026-10-08T11:00:00Z", ownActor: true, before: { ...data.entries[0], workTypeName: "Original general work" }, after: { ...data.entries[0], workTypeId: "meeting", workTypeName: "Original meeting" } },
    { id: "unclassified", action: "create", reason: null, createdAt: "2026-10-08T09:00:00Z", ownActor: true, before: null, after: { ...data.entries[0], workTypeId: null, workTypeName: null } },
  ] });
  await click(button("View change history"));
  await settle(() => assert.match(element('[aria-label="Work block change history"]').textContent!, /Original general work/));
  const history = element('[aria-label="Work block change history"]');
  assert.match(history.textContent!, /Original meeting/);
  assert.match(history.textContent!, /No work type/);
  assert.doesNotMatch(history.textContent!, /General duties/);
});

test("an invalid response without work types clears the workspace instead of rendering a partial editor", async () => {
  const data = fixture(); const { workTypes: omitted, ...incomplete } = data;
  assert.ok(omitted.length);
  globalThis.fetch = async () => json(incomplete);
  await render(); await settle(() => assert.match(container.textContent!, /timesheets are unavailable/));
  assert.equal(container.querySelector('.block'), null);
  assert.equal(container.querySelector('[role="dialog"]'), null);
});

function hourSlot(hour: string, date = "2026-10-08") {
  return element<HTMLButtonElement>(`[data-timesheets-date="${date}"] [data-timesheets-hour="${hour}"] button`);
}
async function emptyCalendar(options: { date?: string; timezone?: string; increment?: 5 | 10 | 15 | 30 | 60 } = {}) {
  const data = fixture("calendar-a", "member");
  data.entries = []; data.totals = []; data.date = options.date ?? data.date;
  data.organisation = { ...data.organisation, timezone: options.timezone ?? "UTC", incrementMinutes: options.increment ?? 15 };
  installFetch(data);
  await act(async () => root.render(<TimesheetsPage calendarId="calendar-a" section="calendar" initialDate={data.date} />));
  await settle(() => assert.ok(container.querySelector('.hourGutter')));
  return data;
}

test("empty week and day calendars always show all 24 hours and labelled creation slots", async () => {
  await emptyCalendar();
  assert.equal(container.querySelectorAll('.hourLabel').length, 24);
  assert.deepEqual([...container.querySelectorAll('.hourLabel')].map(label => label.textContent), Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, "0")}:00`));
  assert.equal(container.querySelectorAll('.hourSlot').length, 168);
  assert.equal(container.querySelectorAll('.hourAdd').length, 168);
  assert.match(hourSlot("14:00").getAttribute("aria-label")!, /Add work on Thu, 8 Oct at 14:00/);
  await click(button("Day"));
  await settle(() => assert.equal(container.querySelectorAll('.hourSlot').length, 24));
  assert.equal(container.querySelectorAll('.hourLabel').length, 24);
  assert.match(container.textContent!, /No work recorded/);
});

test("an empty hour opens the selected date and configured increment, then Cancel restores focus", async () => {
  await emptyCalendar({ increment: 30 });
  const slot = hourSlot("14:00", "2026-10-09");
  await act(async () => slot.focus()); await click(slot);
  assert.equal(field<HTMLInputElement>("Start").value, "2026-10-09T14:00");
  assert.equal(field<HTMLInputElement>("End").value, "2026-10-09T14:30");
  assert.equal(field<HTMLSelectElement>("Work type").value, "");
  assert.equal(element<HTMLInputElement>('input[type="checkbox"]').checked, false);
  await click(button("Cancel"));
  assert.equal(container.querySelector('[role="dialog"]'), null);
  assert.equal(document.activeElement, slot);
  assert.equal(mutations().length, 0);
  await click(hourSlot("23:00"));
  assert.equal(field<HTMLInputElement>("Start").value, "2026-10-08T23:00");
  assert.equal(field<HTMLInputElement>("End").value, "2026-10-08T23:30");
});

test("clicking an existing hourly card edits it and never opens an unclassified new entry", async () => {
  await render(); await settle(() => assert.ok(container.querySelector('.block')));
  const block = element<HTMLButtonElement>('.block');
  assert.equal(block.closest('[data-timesheets-hour]')!.getAttribute('data-timesheets-hour'), "09:00");
  await click(block);
  assert.match(element('[role="dialog"]').textContent!, /Edit work block/);
  assert.equal(field<HTMLSelectElement>("Work type").value, "general");
  assert.equal(field<HTMLTextAreaElement>("Work notes").value, "Private work note");
  assert.equal(field<HTMLInputElement>("End").value, "2026-10-08T10:00");
});

test("hour slot saving uses organisation-local times and rolls a one-hour default over midnight", async () => {
  await emptyCalendar({ timezone: "Pacific/Auckland", increment: 60 });
  await click(hourSlot("23:00"));
  assert.equal(field<HTMLInputElement>("Start").value, "2026-10-08T23:00");
  assert.equal(field<HTMLInputElement>("End").value, "2026-10-09T00:00");
  assert.equal(button("Save work block").disabled, false);
  await click(button("Save work block"));
  await settle(() => assert.equal(mutations().length, 1));
  assert.equal(mutations()[0].data.startLocal, "2026-10-08T23:00");
  assert.equal(mutations()[0].data.endLocal, "2026-10-09T00:00");
});

test("spring-forward missing hour is disabled and elapsed default duration skips the gap", async () => {
  await emptyCalendar({ date: "2026-03-08", timezone: "America/New_York", increment: 60 });
  const absent = hourSlot("02:00", "2026-03-08");
  assert.equal(absent.disabled, true);
  assert.match(absent.getAttribute("aria-label")!, /02:00 unavailable.*does not exist/);
  await click(absent); assert.equal(container.querySelector('[role="dialog"]'), null);
  await click(hourSlot("01:00", "2026-03-08"));
  assert.equal(field<HTMLInputElement>("Start").value, "2026-03-08T01:00");
  assert.equal(field<HTMLInputElement>("End").value, "2026-03-08T03:00");
  assert.match(element('[role="dialog"]').textContent!, /1h 0m elapsed/);
  assert.equal(button("Save work block").disabled, false);
});

test("a repeated fall-back hour opens unresolved and requires an explicit occurrence", async () => {
  await emptyCalendar({ date: "2026-11-01", timezone: "America/New_York", increment: 15 });
  const repeated = hourSlot("01:00", "2026-11-01");
  assert.equal(repeated.disabled, false); await click(repeated);
  assert.equal(field<HTMLSelectElement>("Start occurrence").value, "");
  assert.equal(field<HTMLSelectElement>("End occurrence").value, "");
  assert.match(element('[role="dialog"]').textContent!, /occurs twice/);
  assert.equal(button("Save work block").disabled, true);
  await change(field("Start occurrence"), "later"); await change(field("End occurrence"), "later");
  assert.equal(button("Save work block").disabled, false);
  assert.match(element('[role="dialog"]').textContent!, /0h 15m elapsed/);
});

test("an unambiguous slot ending in a repeated hour preserves the resolved end occurrence", async () => {
  await emptyCalendar({ date: "2026-11-01", timezone: "America/New_York", increment: 60 });
  await click(hourSlot("00:00", "2026-11-01"));
  assert.equal(field<HTMLInputElement>("End").value, "2026-11-01T01:00");
  assert.equal(field<HTMLSelectElement>("End occurrence").value, "earlier");
  assert.equal(button("Save work block").disabled, false);
  assert.match(element('[role="dialog"]').textContent!, /1h 0m elapsed/);
});


test("field labels remain explicit when notes already contain text, and helper text stays descriptive", async () => {
  await render(); await settle(() => assert.ok(container.querySelector('.block')));
  await click(element<HTMLButtonElement>('.block'));
  const notes = field<HTMLTextAreaElement>("Work notes");
  const label = document.getElementById(notes.getAttribute("aria-labelledby")!);
  assert.equal(label?.textContent, "Work notes");
  assert.equal(notes.value, "Private work note");
  const type = field<HTMLSelectElement>("Work type");
  assert.equal(document.getElementById(type.getAttribute("aria-labelledby")!)?.textContent, "Work type");
  assert.match(document.getElementById(type.getAttribute("aria-describedby")!)?.textContent ?? "", /Optional/);
});
