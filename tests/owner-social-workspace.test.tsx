import "./support/salon-dom-environment";
import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, test } from "node:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { SocialData } from "../lib/social-groups/contracts";
import { dom, styleHooks } from "./support/salon-dom-environment";

let Page: typeof import("../components/social-groups/social-groups-page").SocialGroupsPage;
let root: Root, container: HTMLDivElement;
const fetchOriginal = globalThis.fetch;
const calendarId = "10000000-0000-4000-8000-000000000001";
const date = "2099-10-02";
const base = `/calendar-types/social-groups?date=${date}`;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
function fixture(): SocialData { return { calendarId, month: "2099-10", timezone: "UTC", role: "owner", canCreate: true, canRespond: true, canOrganise: true, membersCanCreate: false, availability: [], updates: [], events: [{ id: "20000000-0000-4000-8000-000000000001", title: "Synthetic outing", location: "", notes: "", start: `${date}T09:00:00Z`, end: `${date}T10:00:00Z`, capacity: 4, cancelled: false, version: 1, own: true, canEdit: true, going: 1, maybe: 0, declined: 0, myResponse: "going", attendees: [] }] }; }
function button(text: string, scope: ParentNode = document) { const result = [...scope.querySelectorAll<HTMLButtonElement>("button")].find(e => e.textContent?.trim() === text); assert.ok(result, `Missing ${text}`); return result; }
async function settle(check: () => void) { let last: unknown; for (let n = 0; n < 60; n++) { await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); }); try { check(); return; } catch (error) { last = error; } } throw last; }
async function click(element: HTMLElement) { await act(async () => element.click()); }
async function render() { await act(async () => root.render(<Page calendarId={calendarId} section="calendar" initialDate={date} />)); await settle(() => button("Create event")); }
before(async () => { ({ SocialGroupsPage: Page } = await import("../components/social-groups/social-groups-page")); });
beforeEach(() => { window.history.replaceState(null, "", base); container = document.createElement("div"); document.body.append(container); root = createRoot(container); globalThis.fetch = async () => json(fixture()); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); globalThis.fetch = fetchOriginal; });
after(() => { styleHooks.deregister(); dom.window.close(); });

test("owner sees labelled tools beside the populated month and day; history preserves calendar context", async () => {
  await render();
  assert.ok(container.querySelector("[data-owner-workspace]"));
  for (const name of ["Members", "Availability", "Group settings", "Create event"]) assert.equal(button(name).disabled, false);
  assert.match(container.querySelector('[aria-label="Selected day workspace"]')?.textContent ?? "", /Synthetic outing/);
  const grid = container.querySelector('[aria-label="Choose a calendar day"]');
  await click(button("Group settings"));
  await settle(() => assert.ok(document.querySelector('[role="dialog"]')));
  assert.match(window.location.search, /date=2099-10-02.*panel=group-settings/);
  assert.equal(container.querySelector('[aria-label="Choose a calendar day"]'), grid);
  await act(async () => window.history.back());
  await settle(() => assert.equal(document.querySelector('[role="dialog"]'), null));
  assert.equal(window.location.search, `?date=${date}`);
  await act(async () => window.history.forward());
  await settle(() => assert.ok(document.querySelector('[role="dialog"]')));
  await click(button("Back to calendar"));
  await settle(() => assert.equal(document.querySelector('[role="dialog"]'), null));
});

test("a direct tool URL closes in place, preserves source parameters, and restores calendar selection", async () => {
  window.history.replaceState(null, "", `${base}&panel=availability`);
  await render(); await settle(() => assert.match(document.querySelector('[role="dialog"]')?.textContent ?? "", /Your availability/));
  await click(button("Back to calendar"));
  await settle(() => assert.equal(document.querySelector('[role="dialog"]'), null));
  assert.equal(window.location.pathname + window.location.search, base);
  assert.equal(container.querySelector('[aria-label="Choose a calendar day"] [aria-pressed="true"]')?.getAttribute("data-date"), date);
});

test("nested invitation Escape closes only its own dialog without sending an invitation", async () => {
  let posts = 0;
  globalThis.fetch = async (input, init) => {
    if (init?.method === "POST") posts++;
    return String(input).includes("template-members") ? json({ calendarId, calendarType: "social_groups", access: { role: "owner", resourceIds: [] }, canInvite: true, members: [], invites: [], resources: [] }) : json(fixture());
  };
  await render(); await click(button("Members")); await settle(() => button("Invite someone")); await click(button("Invite someone"));
  assert.equal(document.querySelectorAll('[role="dialog"]').length, 2);
  const nested = document.querySelectorAll<HTMLElement>('[role="dialog"]')[1];
  await act(async () => nested.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  assert.equal(document.querySelectorAll('[role="dialog"]').length, 1); assert.equal(posts, 0);
  await click(button("Back to calendar")); await settle(() => assert.equal(document.querySelector('[role="dialog"]'), null));
});

test("fresh role demotion removes the owner workspace and tool overlay; member calendar remains usable", async () => {
  let current = fixture(); globalThis.fetch = async () => json(current);
  await render(); await click(button("Group settings"));
  current = { ...current, role: "member", canOrganise: false, canCreate: true };
  await act(async () => window.dispatchEvent(new Event("focus")));
  await settle(() => assert.equal(document.querySelector('[role="dialog"]'), null));
  assert.equal(container.querySelector("[data-owner-workspace]"), null);
  assert.equal(new URL(window.location.href).searchParams.has("panel"), false);
  assert.ok(button("Create event"));
  assert.equal([...container.querySelectorAll("button")].some(e => e.textContent?.trim() === "Group settings"), false);
});

test("arrow-key day selection updates the visible day panel and keeps keyboard focus on the day", async () => {
  await render();
  const selected = container.querySelector<HTMLButtonElement>('[aria-label="Choose a calendar day"] [aria-pressed="true"]')!;
  await act(async () => selected.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
  await settle(() => assert.equal(container.querySelector('[aria-pressed="true"][data-date]')?.getAttribute("data-date"), "2099-10-03"));
  assert.equal(document.activeElement?.getAttribute("data-date"), "2099-10-03");
  assert.match(container.querySelector('[aria-label="Selected day workspace"]')?.textContent ?? "", /No events on this day/);
});

test("a denied embedded Members read clears the surrounding calendar and closes its owner tool", async () => {
  globalThis.fetch = async input => String(input).includes("template-members") ? json({ error: "Access removed" }, 403) : json(fixture());
  await render(); await click(button("Members"));
  await settle(() => assert.match(container.textContent ?? "", /Your calendar access changed/));
  assert.equal(document.querySelector('[role="dialog"]'), null);
  assert.doesNotMatch(container.textContent ?? "", /Synthetic outing/);
  assert.equal(new URL(window.location.href).searchParams.has("panel"), false);
});

test("a reloaded source link with an owner panel shows one dialog and returns to its source event", async () => {
  const record = fixture().events[0].id;
  window.history.replaceState(null, "", `${base}&record=${record}&panel=group-settings`);
  await act(async () => root.render(<Page calendarId={calendarId} section="calendar" initialDate={date} initialRecord={record} />));
  await settle(() => assert.match(document.querySelector('[role="dialog"]')?.textContent ?? "", /Who can create events/));
  assert.equal(document.querySelectorAll('[role="dialog"]').length, 1);
  await click(button("Back to calendar"));
  await settle(() => assert.match(document.querySelector('[role="dialog"]')?.textContent ?? "", /Synthetic outing/));
  assert.equal(document.querySelectorAll('[role="dialog"]').length, 1);
  assert.equal(new URL(window.location.href).searchParams.get("record"), record);
});
