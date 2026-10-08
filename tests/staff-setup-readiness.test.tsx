import "./support/salon-dom-environment";
import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, test } from "node:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { dom, styleHooks } from "./support/salon-dom-environment";

let Page: typeof import("../components/staff-rosters/team-page").StaffRosterTeamPage;
let root: Root;
let container: HTMLDivElement;
const fetchOriginal = globalThis.fetch;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function member(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id, displayName: `Synthetic ${id}`, contactEmail: null, contactPhone: null,
    expectedWeeklyMinutes: null, assignedThisWeekMinutes: 0, accessRole: "staff",
    active: true, roleIds: [], roleNames: [], defaultRoleId: null,
    defaultRoleName: null, defaultLocationId: null, defaultLocationName: null,
    hasAccount: false, accountState: "not_invited", hadInvite: false,
    inviteExpiresAt: null, isCurrentUser: false, ...overrides,
  };
}
function fixture() {
  return {
    currentMemberId: "owner", currentAccessRole: "owner", canManageTeam: true, canManageManagers: true,
    members: [
      member("owner", { accessRole: "owner", hasAccount: true, accountState: "connected", isCurrentUser: true }),
      member("profile"),
      member("pending", { accountState: "invite_active", hadInvite: true, inviteExpiresAt: "2099-10-08T12:00:00Z" }),
      member("joined", { hasAccount: true, accountState: "connected" }),
    ], roles: [], locations: [],
  };
}
function button(text: string, scope: ParentNode = container) {
  const result = [...scope.querySelectorAll<HTMLButtonElement>("button")].find(element => element.textContent?.trim() === text);
  assert.ok(result, `Missing ${text}`);
  return result;
}
function summary() { return container.querySelector('[aria-label="Roster setup and account access"]'); }
function count(label: string) {
  const term = [...summary()!.querySelectorAll("dt")].find(element => element.textContent === label);
  assert.ok(term, `Missing ${label}`);
  return Number(term.nextElementSibling?.textContent);
}
async function settle(check: () => void) {
  let last: unknown;
  for (let attempt = 0; attempt < 60; attempt++) {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
    try { check(); return; } catch (error) { last = error; }
  }
  throw last;
}
async function render() {
  await act(async () => root.render(<Page />));
  await settle(() => assert.ok(summary()));
}
async function focus() { await act(async () => window.dispatchEvent(new Event("focus"))); }
before(async () => { ({ StaffRosterTeamPage: Page } = await import("../components/staff-rosters/team-page")); });
beforeEach(() => {
  window.history.replaceState(null, "", "/calendar-types/staff-rosters/organiser/team");
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  globalThis.fetch = async () => json(fixture());
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); globalThis.fetch = fetchOriginal; });
after(() => { styleHooks.deregister(); dom.window.close(); });

test("live Team separates roster profiles from linked accounts without making mutations", async () => {
  const methods: string[] = [];
  globalThis.fetch = async (_input, init) => { methods.push(init?.method ?? "GET"); return json(fixture()); };
  await render();
  assert.equal(count("Roster profiles"), 3);
  assert.equal(count("Accounts linked"), 1);
  assert.equal(count("Awaiting acceptance"), 1);
  assert.equal(count("Profile only"), 1);
  assert.match(summary()!.textContent!, /excluding the owner/);
  assert.match(summary()!.textContent!, /Ready to plan shifts/);
  assert.match(summary()!.textContent!, /invitation is not account access until it is accepted/);
  assert.equal(summary()!.querySelector("a")?.getAttribute("href"), "/calendar-types/staff-rosters");
  assert.deepEqual(methods, ["GET"]);
});

test("owner-only setup points to adding staff rather than claiming team readiness", async () => {
  const data = fixture(); data.members = data.members.slice(0, 1);
  globalThis.fetch = async () => json(data);
  await render();
  assert.equal(count("Roster profiles"), 0);
  assert.equal(count("Accounts linked"), 0);
  assert.match(summary()!.textContent!, /Add your first staff profile/);
  assert.doesNotMatch(summary()!.textContent!, /Ready to plan shifts|Everyone on the team has a linked/);
  assert.equal(summary()!.querySelector("a"), null);
  assert.equal(button("Add staff member").disabled, false);
});

test("canceling a new staff profile leaves the readiness snapshot unchanged", async () => {
  let mutations = 0;
  globalThis.fetch = async (_input, init) => { if (init?.method && init.method !== "GET") mutations++; return json(fixture()); };
  await render();
  await act(async () => button("Add staff member").click());
  const dialog = document.querySelector<HTMLElement>('[role="dialog"]'); assert.ok(dialog);
  await act(async () => button("Cancel", dialog).click());
  assert.equal(document.querySelector('[role="dialog"]'), null);
  assert.equal(count("Roster profiles"), 3);
  assert.equal(mutations, 0);
});

test("returning to Team refreshes invitation acceptance and then offers publication guidance", async () => {
  let data = fixture();
  globalThis.fetch = async () => json(data);
  await render();
  data = { ...data, members: data.members.map(person => ({ ...person, hasAccount: true, accountState: "connected" })) };
  await focus();
  await settle(() => assert.equal(count("Accounts linked"), 3));
  assert.equal(count("Awaiting acceptance"), 0);
  assert.match(summary()!.textContent!, /Publish the roster when you want them to see their shifts/);
});

test("an older in-flight read cannot replace a newer accepted-account snapshot", async () => {
  await render();
  let resolveOld: (response: Response) => void = () => {};
  const oldRequest = new Promise<Response>(resolve => { resolveOld = resolve; });
  const fresh = fixture();
  fresh.members = fresh.members.map(person => ({ ...person, hasAccount: true, accountState: "connected" }));
  let reads = 0;
  globalThis.fetch = async () => ++reads === 1 ? oldRequest : json(fresh);
  await focus(); await focus();
  await settle(() => assert.equal(count("Accounts linked"), 3));
  await act(async () => resolveOld(json(fixture())));
  assert.equal(count("Accounts linked"), 3);
});

test("expired invitations show profile-only consistently in summary and profile controls", async () => {
  const data = fixture();
  data.members = [data.members[0], member("expired", { accountState: "invite_active", hadInvite: true, inviteExpiresAt: "2000-10-08T12:00:00Z" })];
  globalThis.fetch = async () => json(data);
  await render();
  assert.equal(count("Awaiting acceptance"), 0);
  assert.equal(count("Profile only"), 1);
  const card = [...container.querySelectorAll("article")].find(element => element.textContent?.includes("Synthetic expired"));
  assert.ok(card);
  assert.match(card.textContent!, /Profile only|No active invite/);
  assert.doesNotMatch(card.textContent!, /Awaiting acceptance|Revoke invite/);
});

test("a denied refreshed read removes readiness, people and open edit controls", async () => {
  await render();
  await act(async () => button("Add staff member").click());
  globalThis.fetch = async () => json({ error: "Manager access is required." }, 403);
  await focus();
  await settle(() => assert.equal(summary(), null));
  assert.equal(document.querySelector('[role="dialog"]'), null);
  assert.doesNotMatch(container.textContent!, /Synthetic profile/);
  assert.match(container.textContent!, /Manager access is required/);
});

test("a failed first load does not manufacture a readiness state", async () => {
  globalThis.fetch = async () => json({ error: "Synthetic network failure." }, 503);
  await act(async () => root.render(<Page />));
  await settle(() => assert.match(container.textContent!, /Synthetic network failure/));
  assert.equal(summary(), null);
  assert.doesNotMatch(container.textContent!, /Ready to plan shifts/);
});

test("owner summary is withdrawn after transient refresh failure until current facts return", async () => {
  let failed = false; globalThis.fetch = async () => failed ? json({ error: "Temporarily unavailable" }, 500) : json(fixture());
  await render(); failed = true; await focus(); await settle(() => assert.equal(summary(), null));
  assert.match(container.textContent ?? "", /Temporarily unavailable/);
  failed = false; await focus(); await settle(() => assert.ok(summary()));
  assert.equal(count("Roster profiles"), 3);
});

test("manager retains Team controls without the owner setup summary", async () => {
  const data = fixture(); data.currentAccessRole = "manager"; data.canManageManagers = false;
  globalThis.fetch = async () => json(data);
  await act(async () => root.render(<Page />));
  await settle(() => assert.ok(button("Add staff member")));
  assert.equal(summary(), null);
});
