import "./support/salon-dom-environment";
import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, test } from "node:test";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { facilityDefaults, type FacilityData } from "../lib/shared-facilities/contracts";
import type { SocialData } from "../lib/social-groups/contracts";
import { workspaceOrganiserTools } from "../lib/templates/workspace-navigation";
import { dom, styleHooks } from "./support/salon-dom-environment";

let FacilitiesPage: typeof import("../components/shared-facilities/facilities-page").FacilitiesPage;
let SocialGroupsPage: typeof import("../components/social-groups/social-groups-page").SocialGroupsPage;
let TemplateMembersPage: typeof import("../components/calendar-sharing/members-page").TemplateMembersPage;
let root: Root;
let container: HTMLDivElement;
const originalFetch = globalThis.fetch;
const calendarId = "10000000-0000-4000-8000-000000000001";
const recordId = "20000000-0000-4000-8000-000000000001";
const resourceId = "30000000-0000-4000-8000-000000000001";
const date = "2099-10-02";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
function facilities(): FacilityData {
  return { calendarId, date, timezone: "UTC", owner: true, role: "owner", canBook: true, managedResourceIds: [], rules: facilityDefaults, updates: [], bookings: [], resources: [{ id: resourceId, name: "Synthetic room", description: "Private fixture", location: "", capacity: null, active: true }] };
}
function social(): SocialData {
  return { calendarId, month: date.slice(0, 7), timezone: "UTC", role: "owner", canCreate: true, canRespond: true, canOrganise: true, membersCanCreate: false, availability: [], updates: [], events: [{ id: recordId, title: "Synthetic event", location: "", notes: "Private fixture", start: `${date}T09:00:00Z`, end: `${date}T10:00:00Z`, capacity: null, cancelled: false, version: 1, own: false, canEdit: true, going: 0, maybe: 0, declined: 0, myResponse: null, attendees: [] }] };
}
function element<T extends HTMLElement>(selector: string, scope: ParentNode = document): T { const found = scope.querySelector<T>(selector); assert.ok(found, `Missing ${selector}`); return found; }
function button(label: string, scope: ParentNode = document): HTMLButtonElement { const found = [...scope.querySelectorAll<HTMLButtonElement>("button")].find(value => value.textContent?.trim() === label); assert.ok(found, `Missing ${label}`); return found; }
async function settle(check: () => void) {
  let last: unknown;
  for (let i = 0; i < 50; i++) { await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); }); try { check(); return; } catch (error) { last = error; } }
  throw last;
}
async function render(node: ReactNode) { await act(async () => root.render(node)); }
async function click(target: HTMLElement) { await act(async () => target.click()); }
async function focus() { await act(async () => window.dispatchEvent(new Event("focus"))); }
function deferred() { let resolve!: (response: Response) => void; const promise = new Promise<Response>(yes => { resolve = yes; }); return { promise, resolve }; }
before(async () => { ({ TemplateMembersPage } = await import("../components/calendar-sharing/members-page")); ({ FacilitiesPage } = await import("../components/shared-facilities/facilities-page")); ({ SocialGroupsPage } = await import("../components/social-groups/social-groups-page")); });
beforeEach(() => { container = document.createElement("div"); document.body.append(container); root = createRoot(container); globalThis.fetch = async () => { throw new Error("Unexpected synthetic request"); }; });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); globalThis.fetch = originalFetch; });
after(() => { styleHooks.deregister(); dom.window.close(); });

for (const kind of ["Facilities", "Social"] as const) {
  function fixture() { return kind === "Facilities" ? facilities() : social(); }
  function page(id = calendarId) { return kind === "Facilities" ? <FacilitiesPage key={id} calendarId={id} initialDate={date} section="organiser" tool="resources" /> : <SocialGroupsPage key={id} calendarId={id} initialDate={date} initialRecord={recordId} section="calendar" />; }
  async function openEditor() { if (kind === "Facilities") await click(button("Edit resource")); else await click(button("Edit event")); }
  const submitLabel = kind === "Facilities" ? "Save resource" : "Save changes";
  const formId = kind === "Facilities" ? "facility-resource-form" : "social-event-form";
  const title = kind === "Facilities" ? "Synthetic room" : "Synthetic event";

  test(`${kind}: revocation closes a mounted editor and a late older response cannot restore private records`, async () => {
    const oldRead = deferred(); let reads = 0;
    globalThis.fetch = async () => { reads++; return reads === 1 ? json(fixture()) : reads === 2 ? oldRead.promise : json({ error: "Access removed" }, 403); };
    await render(page()); await settle(() => button(kind === "Facilities" ? "Edit resource" : "Edit event")); await openEditor();
    await focus(); assert.equal(button(submitLabel).disabled, true);
    await focus(); await settle(() => assert.match(container.textContent ?? "", /Access removed/));
    assert.equal(document.querySelector('[role="dialog"]'), null); assert.doesNotMatch(container.textContent ?? "", new RegExp(title));
    await act(async () => oldRead.resolve(json(fixture())));
    assert.doesNotMatch(container.textContent ?? "", new RegExp(title)); assert.match(container.textContent ?? "", /Access removed/);
  });

  test(`${kind}: demotion removes the open editor using the fresh capability snapshot`, async () => {
    let current = fixture(); globalThis.fetch = async () => json(current);
    await render(page()); await settle(() => button(kind === "Facilities" ? "Edit resource" : "Edit event")); await openEditor();
    current = kind === "Facilities" ? { ...facilities(), owner: false, role: "member" } : { ...social(), role: "member", canOrganise: false, canCreate: false, events: social().events.map(event => ({ ...event, canEdit: false })) };
    await focus(); await settle(() => assert.equal(document.querySelector('[role="dialog"]'), null));
    assert.match(container.textContent ?? "", new RegExp(title));
    assert.equal([...container.querySelectorAll("button")].some(value => value.textContent?.trim() === (kind === "Facilities" ? "Edit resource" : "Create event")), false);
  });

  test(`${kind}: transient failure preserves the draft but blocks submit while Close stays available`, async () => {
    let failure = false, posts = 0;
    globalThis.fetch = async (_url, init) => { if (init?.method === "POST") { posts++; return json({ ok: true }); } return failure ? json({ error: "Temporarily unavailable" }, 500) : json(fixture()); };
    await render(page()); await settle(() => button(kind === "Facilities" ? "Edit resource" : "Edit event")); await openEditor();
    const editor = element('[role="dialog"]'); failure = true; await focus();
    await settle(() => assert.match(editor.textContent ?? "", /Temporarily unavailable/));
    assert.equal(element('[role="dialog"]'), editor); assert.equal(button(submitLabel, editor).disabled, true); assert.equal(button("Close", editor).disabled, false);
    await act(async () => element(`#${formId}`).dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    assert.equal(posts, 0); await click(button("Close", editor)); assert.equal(document.querySelector('[role="dialog"]'), null);
  });

  test(`${kind}: cross-tab calendar change rejects the mutation and clears its draft`, async () => {
    const pendingRead = deferred(), post = deferred(); let reads = 0; const contexts: string[] = [];
    globalThis.fetch = async (_url, init) => { contexts.push(new Headers(init?.headers).get("x-covie-calendar-id") ?? ""); if (init?.method === "POST") return post.promise; return ++reads === 1 ? json(fixture()) : pendingRead.promise; };
    await render(page()); await settle(() => button(kind === "Facilities" ? "Edit resource" : "Edit event")); await openEditor();
    await act(async () => element(`#${formId}`).dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    await act(async () => post.resolve(json({ code: "calendar_changed", error: "Your selected calendar changed. Reload this page." }, 409)));
    await settle(() => assert.equal(document.querySelector('[role="dialog"]'), null));
    assert.doesNotMatch(container.textContent ?? "", new RegExp(title)); assert.ok(contexts.every(id => id === calendarId));
    await act(async () => pendingRead.resolve(json(fixture())));
    assert.doesNotMatch(container.textContent ?? "", new RegExp(title));
  });

  test(`${kind}: mutation access denial aborts a concurrent older read`, async () => {
    const pendingRead = deferred(); let reads = 0, posts = 0; let readSignal: AbortSignal | null | undefined;
    globalThis.fetch = async (_url, init) => {
      if (init?.method === "POST") { posts++; return json({ error: "Access removed" }, 403); }
      if (++reads === 1) return json(fixture());
      readSignal = init?.signal; return pendingRead.promise;
    };
    await render(page()); await settle(() => button(kind === "Facilities" ? "Edit resource" : "Edit event")); await openEditor();
    // A focus refresh and submit may arrive in the same browser event turn,
    // before React has rendered the disabled submit button.
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      element(`#${formId}`).dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await settle(() => assert.match(container.textContent ?? "", /Access removed/));
    assert.equal(posts, 1); assert.equal(readSignal?.aborted, true); assert.equal(document.querySelector('[role="dialog"]'), null);
    await act(async () => pendingRead.resolve(json(fixture()))); assert.doesNotMatch(container.textContent ?? "", new RegExp(title));
  });

  test(`${kind}: changing the keyed calendar while a read is in flight cannot bring back the old calendar`, async () => {
    const oldRead = deferred(); const nextId = "10000000-0000-4000-8000-000000000002";
    globalThis.fetch = async (_url, init) => new Headers(init?.headers).get("x-covie-calendar-id") === calendarId ? oldRead.promise : json({ ...fixture(), calendarId: nextId, resources: [], events: [] });
    await render(page()); await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
    await render(page(nextId)); await settle(() => assert.match(container.textContent ?? "", kind === "Facilities" ? /No resources yet/ : /No events on this day/));
    await act(async () => oldRead.resolve(json(fixture()))); assert.doesNotMatch(container.textContent ?? "", new RegExp(title));
  });
}

test("organiser tools distinguish domain roles and preserve Staff's existing self-service", () => {
  const keys = (type: Parameters<typeof workspaceOrganiserTools>[0], role: Parameters<typeof workspaceOrganiserTools>[1]) => workspaceOrganiserTools(type, role).map(tool => tool.key);
  assert.deepEqual(keys("shared_facilities", "owner"), ["resources", "booking-rules", "members"]);
  assert.deepEqual(keys("shared_facilities", "manager"), ["resources"]);
  for (const role of ["member", "viewer", "unavailable"] as const) assert.deepEqual(keys("shared_facilities", role), []);
  assert.deepEqual(keys("social_groups", "admin"), ["members", "availability", "group-settings"]);
  assert.deepEqual(keys("social_groups", "member"), ["availability"]);
  assert.deepEqual(keys("social_groups", "viewer"), ["availability"]);
  assert.deepEqual(keys("salon_bookings", "owner"), ["team", "services", "booking-settings"]);
  assert.deepEqual(keys("salon_bookings", "manager"), ["team", "services"]);
  assert.deepEqual(workspaceOrganiserTools("salon_bookings", "practitioner").map(tool => tool.label), ["My profile & hours", "My services"]);
  assert.deepEqual(keys("salon_bookings", "viewer"), []);
  assert.deepEqual(keys("staff_rosters", "staff"), ["availability", "timesheets"]);
  assert.equal(keys("staff_rosters", "manager").length, 4);
  assert.deepEqual(keys("co_parenting", "owner"), []);
});


function members() {
  return { calendarId, calendarType: "shared_facilities", access: { role: "owner", resourceIds: [] }, canInvite: true, members: [{ id: recordId, name: "Synthetic member", role: "member", isCurrentUser: false, resourceIds: [] }], invites: [{ id: resourceId, role: "member", codeHint: "TEST", expiresAt: "2099-11-01T00:00:00Z" }], resources: [] };
}
for (const modal of ["Invite someone", "Change access", "Revoke"] as const) {
  test(`Members: ${modal} closes on denied focus refresh and late results cannot restore records`, async () => {
    const pending = deferred(); let reads = 0;
    globalThis.fetch = async () => ++reads === 1 ? json(members()) : reads === 2 ? pending.promise : json({ error: "Access removed" }, 403);
    await render(<TemplateMembersPage calendarId={calendarId} />); await settle(() => button(modal)); await click(button(modal));
    assert.ok(document.querySelector('[role="dialog"]')); await focus(); await focus();
    await settle(() => assert.equal(document.querySelector('[role="dialog"]'), null));
    assert.doesNotMatch(container.textContent ?? "", /Synthetic member|Code ending/);
    await act(async () => pending.resolve(json(members()))); assert.doesNotMatch(container.textContent ?? "", /Synthetic member|Code ending/);
  });
}
test("Members: a demoted organiser cannot keep a role-change modal or pending invitation records", async () => {
  let current = members(); globalThis.fetch = async () => json(current);
  await render(<TemplateMembersPage calendarId={calendarId} />); await settle(() => button("Change access")); await click(button("Change access"));
  current = { ...members(), canInvite: false, access: { role: "member", resourceIds: [] }, members: [], invites: [] };
  await focus(); await settle(() => assert.equal(document.querySelector('[role="dialog"]'), null));
  assert.match(container.textContent ?? "", /Your calendar membership/); assert.doesNotMatch(container.textContent ?? "", /Synthetic member|Code ending/);
});
test("Members: unavailable refresh blocks invitation creation but leaves the form dismissible", async () => {
  let failure = false, posts = 0;
  globalThis.fetch = async (_url, init) => { if(init?.method === "POST") {posts++;return json({ok:true});} return failure ? json({error:"Temporarily unavailable"},500) : json(members()); };
  await render(<TemplateMembersPage calendarId={calendarId} />); await settle(() => button("Invite someone")); await click(button("Invite someone"));
  failure = true; await focus(); await settle(() => assert.match(element('[role="dialog"]').textContent ?? "", /Temporarily unavailable/));
  assert.equal(button("Create invitation").disabled, true); assert.equal(button("Cancel").disabled,false); await click(button("Create invitation")); assert.equal(posts,0); await click(button("Cancel")); assert.equal(document.querySelector('[role="dialog"]'),null);
});
test("Members: a rejected invitation save removes the open form and member snapshot", async () => {
  globalThis.fetch = async (_url, init) => init?.method === "POST" ? json({error:"Access removed"},403) : json(members());
  await render(<TemplateMembersPage calendarId={calendarId} />); await settle(() => button("Invite someone")); await click(button("Invite someone")); await click(button("Create invitation"));
  await settle(() => assert.equal(document.querySelector('[role="dialog"]'),null)); assert.match(container.textContent ?? "", /Access removed/); assert.doesNotMatch(container.textContent ?? "", /Synthetic member|Code ending/);
});
