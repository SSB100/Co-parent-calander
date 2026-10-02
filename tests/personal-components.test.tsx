import "./support/salon-dom-environment";
import assert from "node:assert/strict";
import Module, { createRequire } from "node:module";
import { after, afterEach, before, beforeEach, test } from "node:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { PersonalData, PersonalItem } from "../lib/personal/contracts";
import { dom, styleHooks } from "./support/salon-dom-environment";

// Only the server-action boundary is replaced. UI, loader, hooks and events are real.
// Synthetic records never reach a database or external service.
const require = createRequire(import.meta.url);
const actionPath = require.resolve("../app/personal/actions.ts");
const savedActions = require.cache[actionPath];
const actionModule = new Module(actionPath);
actionModule.exports = { openPersonalSource: async () => {} };
actionModule.loaded = true;
require.cache[actionPath] = actionModule;
const calendarActionPath = require.resolve("../app/calendar/actions.ts");
const savedCalendarActions = require.cache[calendarActionPath];
const calendarActionModule = new Module(calendarActionPath);
calendarActionModule.exports = { openCalendar: async () => {} };
calendarActionModule.loaded = true;
require.cache[calendarActionPath] = calendarActionModule;
let PersonalCalendar: typeof import("../components/personal/personal-calendar").PersonalCalendar;
let root: Root;
let container: HTMLDivElement;
const originalFetch = globalThis.fetch;
const router: AppRouterInstance = { back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch() {}, bfcacheId: "personal-test" };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const item: PersonalItem = { id: "today", calendarId: "source-a", sourceId: "today", kind: "facility", state: "confirmed", title: "Today’s court", detail: "Your confirmed booking", date: "2026-10-01", endDate: "2026-10-01", start: "2026-10-01T10:00:00Z", end: "2026-10-01T11:00:00Z", timezone: "UTC", sourceTarget: "calendar" };
function fixture(): PersonalData {
  return {
    month: "2026-10", timezone: "UTC", today: "2026-10-01",
    sources: [{ id: "source-a", name: "Synthetic courts", type: "shared_facilities", timezone: "UTC" }],
    items: [item, { ...item, id: "care", kind: "care", state: "background", title: "Care today", start: null, end: null }, ...Array.from({ length: 7 }, (_, i) => ({ ...item, id: `future-${i}`, title: `Future plan ${i}`, date: `2026-10-${i + 10}`, endDate: `2026-10-${i + 10}`, start: `2026-10-${i + 10}T10:00:00Z`, end: `2026-10-${i + 10}T11:00:00Z` }))],
    attention: Array.from({ length: 4 }, (_, i) => ({ ...item, id: `review-${i}`, state: "attention", title: `Review task ${i}` })), warnings: [],
  };
}
function element<T extends Element = HTMLElement>(selector: string, scope: ParentNode = container): T {
  const result = scope.querySelector<T>(selector);
  assert.ok(result, `Missing ${selector}`);
  return result;
}
function button(label: string): HTMLButtonElement {
  const result = [...container.querySelectorAll("button")].find((node) => node.textContent?.trim() === label);
  assert.ok(result, `Missing ${label} button`);
  return result;
}
async function settle(check: () => void) {
  let failure: unknown;
  for (let i = 0; i < 50; i++) {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 5)); });
    try { check(); return; } catch (error) { failure = error; }
  }
  throw failure;
}
async function render(data = fixture(), account = "account-a") {
  await act(async () => root.render(<AppRouterContext.Provider value={router}><PersonalCalendar key={account} initialData={data} /></AppRouterContext.Provider>));
}
async function click(node: HTMLElement) { await act(async () => node.click()); }

before(async () => { ({ PersonalCalendar } = await import("../components/personal/personal-calendar")); });
beforeEach(() => {
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  globalThis.fetch = async (input) => {
    const month = new URL(String(input), "https://covie.example.invalid").searchParams.get("month")!;
    return json({ ...fixture(), month, ...(month === "2026-10" ? {} : { items: [], attention: [] }) });
  };
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); globalThis.fetch = originalFetch; });
after(() => { if (savedActions) require.cache[actionPath] = savedActions; else delete require.cache[actionPath]; if (savedCalendarActions) require.cache[calendarActionPath] = savedCalendarActions; else delete require.cache[calendarActionPath]; styleHooks.deregister(); dom.window.close(); });

test("Overview keeps useful sections, capped plans and visible collapsed filter context", async () => {
  await render();
  await click(button("Overview"));
  await settle(() => assert.match(container.textContent!, /Today’s court/));
  assert.equal(button("Overview").getAttribute("aria-pressed"), "true");
  assert.equal(container.querySelector(".monthBoard"), null);
  assert.deepEqual([...container.querySelectorAll(".content > section")].map((section) => section.getAttribute("aria-label")), ["Today", "Needs your attention", "Upcoming"]);
  assert.match(element("summary").textContent!, /All calendars · UTC/);
  assert.equal(element<HTMLDetailsElement>("details").open, false);
  const upcoming = element('section[aria-label="Upcoming"]');
  assert.equal(upcoming.querySelectorAll("article").length, 5);
  assert.doesNotMatch(upcoming.textContent!, /Care today|Today’s court/);
  assert.match(upcoming.textContent!, /within this month only/);
  assert.equal(element('section[aria-label="Needs your attention"]').querySelectorAll("article").length, 3);
  await click(button("Show all 4 attention items"));
  assert.equal(element('section[aria-label="Needs your attention"]').querySelectorAll("article").length, 4);
  await click(button("View month agenda"));
  assert.match(element('section[aria-label="Monthly agenda"]').textContent!, /Future plan 6/);
});

test("browsing a different month does not claim Today is empty", async () => {
  await render();
  await click(button("Overview"));
  await click(element('[aria-label="Next month"]'));
  await settle(() => assert.match(element('section[aria-label="Today"]').textContent!, /Today is outside November 2026/));
  assert.doesNotMatch(element('section[aria-label="Today"]').textContent!, /No commitments/);
  assert.match(element('section[aria-label="Upcoming"]').textContent!, /Other months aren’t included/);
});

test("Month remains keyboard navigable and returns to Overview", async () => {
  await render();
  await click(button("Month"));
  const date = element<HTMLButtonElement>('[data-date="2026-10-01"]');
  await act(async () => { date.focus(); date.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })); });
  assert.equal(document.activeElement?.getAttribute("data-date"), "2026-10-02");
  assert.equal(element('[data-date="2026-10-02"]').getAttribute("tabindex"), "0");
  await click(button("Overview"));
  assert.match(element('section[aria-label="Today"]').textContent!, /Today’s court/);
});

test("revoked source on page restoration clears every overview section", async () => {
  await render();
  await settle(() => assert.match(container.textContent!, /Today’s court/));
  globalThis.fetch = async () => json({ error: "Unavailable" }, 403);
  await act(async () => { window.dispatchEvent(new Event("pageshow")); });
  await settle(() => assert.match(container.textContent!, /no longer available/));
  assert.doesNotMatch(container.textContent!, /Today’s court|Future plan|Review task|Synthetic courts/);
});

test("a newer source choice cancels refresh and cannot restore its old items", async () => {
  await render();
  await click(button("Overview"));
  await settle(() => assert.match(container.textContent!, /Today’s court/));
  let finish!: (response: Response) => void;
  globalThis.fetch = async () => new Promise((resolve) => { finish = resolve; });
  await click(element('[aria-label="Refresh Personal"]'));
  assert.doesNotMatch(container.textContent!, /Today’s court|Future plan/);
  globalThis.fetch = async () => json({ ...fixture(), items: [], attention: [] });
  await click(element("summary"));
  await act(async () => { const select = element<HTMLSelectElement>("select"); select.value = "source-a"; select.dispatchEvent(new Event("change", { bubbles: true })); });
  await settle(() => assert.match(container.textContent!, /No commitments or care context today/));
  await act(async () => { finish(json(fixture())); });
  assert.doesNotMatch(container.textContent!, /Today’s court|Future plan/);
  assert.match(element("summary").textContent!, /Synthetic courts · UTC/);
});

test("an account change and a new account empty state retain no old records", async () => {
  await render();
  await settle(() => assert.match(container.textContent!, /Today’s court/));
  const empty = { ...fixture(), sources: [], items: [], attention: [] };
  globalThis.fetch = async () => json(empty);
  await render(empty, "account-b");
  await settle(() => assert.match(container.textContent!, /Welcome to Personal/));
  assert.doesNotMatch(container.textContent!, /Today’s court|Synthetic courts|Review task/);
  const entry = [...container.querySelectorAll("a")].find((node) => node.textContent === "Create or join a calendar");
  assert.equal(entry?.getAttribute("href"), "/onboarding");
  assert.equal(container.querySelector("details"), null);
  assert.equal(container.querySelector('input[type="month"]'), null);
});

test("a server refresh for the same account hides superseded records before rechecking", async () => {
  await render();
  await settle(() => assert.match(container.textContent!, /Today’s court/));
  let finish!: (response: Response) => void;
  globalThis.fetch = async () => new Promise((resolve) => { finish = resolve; });
  const refreshed = { ...fixture(), sources: [], items: [], attention: [] };
  await render(refreshed);
  assert.doesNotMatch(container.textContent!, /Today’s court|Synthetic courts|Review task/);
  await settle(() => assert.equal(typeof finish, "function"));
  await act(async () => { finish(json(refreshed)); });
  await settle(() => assert.match(container.textContent!, /Welcome to Personal/));
});



test("Personal opens on the month and keeps attention beside the chosen day", async () => {
  await render();
  await settle(() => assert.match(container.textContent!, /Today’s court/));
  assert.equal(button("Month").getAttribute("aria-pressed"), "true");
  assert.ok(container.querySelector(".monthBoard"));
  await click(button("Attention (4)"));
  const panel = element('section[aria-label="Selected day"]');
  assert.equal(panel.querySelectorAll("article").length, 4);
  assert.doesNotMatch(panel.textContent!, /Today’s court/);
  await click(element('[data-date="2026-10-01"]'));
  assert.equal(button("Your day").getAttribute("aria-pressed"), "true");
  assert.match(panel.textContent!, /Today’s court/);
  assert.equal(element<HTMLInputElement>('input[name="sourceId"]', panel).value, "today");
});

test("Personal footer switches views and returns to source calendars", async () => {
  await render();
  await settle(() => assert.match(container.textContent!, /Today’s court/));
  const nav = element('nav[aria-label="Personal navigation"]');
  const controls = [...nav.querySelectorAll('button')];
  const scroll = window.scrollTo;
  const frame = window.requestAnimationFrame;
  window.scrollTo = () => {};
  window.requestAnimationFrame = () => 0;
  try {
    await click(controls[1]);
    assert.ok(container.querySelector('section[aria-label="Monthly agenda"]'));
    assert.equal(controls[1].getAttribute('aria-pressed'), 'true');
    await click(controls[2]);
    assert.match(element('#personal-day-context').textContent!, /Review task/);
    assert.equal(controls[2].getAttribute('aria-pressed'), 'true');
    await click(controls[0]);
    assert.match(element('#personal-day-context').textContent!, /Today’s court/);
    assert.doesNotMatch(element('#personal-day-context').textContent!, /Review task/);
    assert.equal(controls[3].textContent?.trim(), 'My calendars');
    assert.equal(controls[3].getAttribute('aria-haspopup'), 'dialog');
    assert.ok(container.querySelector('a[aria-label="Covie Personal"]'));
  } finally { window.scrollTo = scroll; window.requestAnimationFrame = frame; }
});


test("desktop sidebar controls keep the selected day and source context together", async () => {
  await render();
  await settle(() => assert.match(container.textContent!, /Today’s court/));
  const sidebar = element('aside[aria-label="Personal workspace"]');
  const nav = element('nav[aria-label="Personal desktop navigation"]', sidebar);
  assert.ok(sidebar.querySelector('#personal-day-context'));
  assert.ok(sidebar.querySelector('select'));
  assert.equal(nav.querySelector('a[aria-label="Covie Personal"]')?.getAttribute('href'), '/personal');
  const controls = [...nav.querySelectorAll('button')];
  await click(controls[1]);
  assert.ok(container.querySelector('section[aria-label="Monthly agenda"]'));
  assert.equal(sidebar.querySelector('#personal-day-context'), null);
  await click(controls[2]);
  assert.match(element('#personal-day-context', sidebar).textContent!, /Review task/);
  await click(controls[0]);
  assert.match(element('#personal-day-context', sidebar).textContent!, /Today’s court/);
});

const navigationCalendar = { id: "source-a", name: "Synthetic courts", calendarType: "shared_facilities", permission: "owner", displayName: "QA" };
function switcher(mobile = false) { return element<HTMLButtonElement>(`nav[aria-label="${mobile ? "Personal navigation" : "Personal desktop navigation"}"] button[aria-haspopup="dialog"]`); }
function navigationResponse(value: unknown, status = 200) {
  const personalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => String(input) === "/api/calendars/navigation" ? json(value, status) : personalFetch(input, init);
}

test("My calendars opens in place with current Personal and authorized active choices", async () => {
  navigationResponse({ calendars: [navigationCalendar] });
  await render();
  const trigger = switcher();
  await click(trigger);
  await settle(() => assert.match(document.querySelector('[role="dialog"]')!.textContent!, /Synthetic courts/));
  assert.equal(trigger.getAttribute('aria-expanded'), 'true');
  assert.equal(document.querySelector('[role="dialog"]')?.getAttribute('aria-modal'), null);
  assert.match(document.querySelector('[aria-current="page"]')!.textContent!, /Personal/);
  assert.equal(element<HTMLInputElement>('[role="dialog"] input[name="calendarId"]', document).value, 'source-a');
  await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  assert.equal(document.querySelector('[role="dialog"]'), null);
  assert.equal(document.activeElement, trigger);
});

test("desktop dropdown toggles, closes outside and closes on navigation and resize", async () => {
  navigationResponse({ calendars: [] });
  await render();
  const trigger = switcher();
  await click(trigger); await click(trigger);
  assert.equal(document.querySelector('[role="dialog"]'), null);
  for (const event of ['popstate', 'resize', 'orientationchange', 'pageshow', 'blur']) {
    await click(trigger);
    await act(async () => window.dispatchEvent(new Event(event)));
    assert.equal(document.querySelector('[role="dialog"]'), null, event);
  }
  await click(trigger);
  await act(async () => document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })));
  assert.equal(document.querySelector('[role="dialog"]'), null);
});

test("mobile uses the canonical modal and restores focus and scrolling on close", async () => {
  navigationResponse({ calendars: [] });
  await render();
  const trigger = switcher(true);
  await act(async () => trigger.focus());
  await click(trigger);
  await settle(() => assert.match(document.querySelector('[role="dialog"]')!.textContent!, /don’t have any active/));
  assert.equal(document.querySelector('[role="dialog"]')?.getAttribute('aria-modal'), 'true');
  assert.equal(document.body.style.overflow, 'hidden');
  await click(element('[aria-label="Close dialog"]', document));
  assert.equal(document.querySelector('[role="dialog"]'), null);
  assert.equal(document.body.style.overflow, '');
  assert.equal(document.activeElement, trigger);
});

test("failure has retry and reopening never shows old calendar membership", async () => {
  let fail = true;
  let calls = 0;
  const personalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    if (String(input) !== '/api/calendars/navigation') return personalFetch(input, init);
    calls++;
    return fail ? json({}, 500) : json({ calendars: calls === 2 ? [navigationCalendar] : [] });
  };
  await render(); await click(switcher());
  await settle(() => assert.match(document.querySelector('[role="alert"]')!.textContent!, /could not be loaded/));
  fail = false;
  await click(element('[role="alert"] button', document));
  await settle(() => assert.match(document.querySelector('[role="dialog"]')!.textContent!, /Synthetic courts/));
  await click(switcher()); await click(switcher());
  assert.doesNotMatch(document.querySelector('[role="dialog"]')!.textContent!, /Synthetic courts/);
  await settle(() => assert.match(document.querySelector('[role="dialog"]')!.textContent!, /don’t have any active/));
});

test("closing aborts a slow calendar list and ignores its late result", async () => {
  let signal: AbortSignal | null | undefined;
  let finish!: (response: Response) => void;
  const personalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    if (String(input) !== '/api/calendars/navigation') return personalFetch(input, init);
    signal = init?.signal;
    return new Promise<Response>((resolve) => { finish = resolve; });
  };
  await render(); await click(switcher());
  assert.match(document.querySelector('[role="status"].message')!.textContent!, /Loading/);
  await click(switcher());
  assert.equal(signal?.aborted, true);
  await act(async () => finish(json({ calendars: [navigationCalendar] })));
  assert.equal(document.querySelector('[role="dialog"]'), null);
});
