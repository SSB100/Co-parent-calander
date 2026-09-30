import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { SocialData, SocialEvent } from "../lib/social-groups/contracts";
import { canEditSocialEvent, canOrganiseSocial, canRespondToSocialEvent, newSocialEventLocalFields, shiftSocialDate, shiftSocialMonth, socialEventIsFull, socialEventLocalFields, socialEventsByDay, socialEventsOnDate, socialMonthDays, socialResponses } from "../components/social-groups/social-ui";

const event: SocialEvent = { id: "event", title: "Book club", location: "Library", notes: "", start: "2026-10-12T10:00:00Z", end: "2026-10-12T11:00:00Z", capacity: 5, cancelled: false, version: 2, own: true, canEdit: true, going: 2, maybe: 1, declined: 0, myResponse: null, attendees: [] };
const data: SocialData = { calendarId: "calendar-a", role: "member", canCreate: true, canRespond: true, canOrganise: false, membersCanCreate: true, timezone: "Pacific/Auckland", month: "2026-10", events: [event], availability: [], updates: [] };
const now = new Date("2026-10-10T00:00:00Z");

test("organiser settings require both capability and owner/admin role", () => {
  assert.equal(canOrganiseSocial(data), false);
  assert.equal(canOrganiseSocial({ role: "owner", canOrganise: true }), true);
  assert.equal(canOrganiseSocial({ role: "admin", canOrganise: true }), true);
  assert.equal(canOrganiseSocial({ role: "viewer", canOrganise: true }), false);
  assert.equal(canOrganiseSocial({ role: "member", canOrganise: true }), false);
});

test("event edits preserve own/admin scope and deny viewers or cancelled records", () => {
  assert.equal(canEditSocialEvent(data, event), true);
  assert.equal(canEditSocialEvent(data, { ...event, own: false }), false);
  assert.equal(canEditSocialEvent({ ...data, role: "admin", canOrganise: true }, { ...event, own: false }), true);
  assert.equal(canEditSocialEvent({ ...data, role: "viewer" }, event), false);
  assert.equal(canEditSocialEvent(data, { ...event, canEdit: false }), false);
  assert.equal(canEditSocialEvent(data, { ...event, cancelled: true }), false);
});

test("RSVPs close for viewers, cancelled or ended events", () => {
  assert.equal(canRespondToSocialEvent(data, event, now), true);
  assert.equal(canRespondToSocialEvent({ ...data, role: "viewer" }, event, now), false);
  assert.equal(canRespondToSocialEvent({ ...data, canRespond: false }, event, now), false);
  assert.equal(canRespondToSocialEvent(data, { ...event, cancelled: true }, now), false);
  assert.equal(canRespondToSocialEvent(data, event, new Date(event.end)), false);
  assert.deepEqual(socialResponses.map((response) => response.label), ["Going", "Maybe", "Cannot make it"]);
});

test("optional capacity handles unlimited, available and full states", () => {
  assert.equal(socialEventIsFull({ ...event, capacity: null, going: 500 }), false);
  assert.equal(socialEventIsFull(event), false);
  assert.equal(socialEventIsFull({ ...event, going: 5 }), true);
  assert.equal(socialEventIsFull({ ...event, going: 6 }), true);
});

test("month grid is Monday-first, bounded, and crosses year and leap-day boundaries", () => {
  const days = socialMonthDays("2026-10");
  assert.equal(days[0], "2026-09-28");
  assert.equal(days.at(-1), "2026-11-01");
  assert.equal(days.length, 35);
  assert.equal(socialMonthDays("2026-02").length, 35);
  assert.ok(socialMonthDays("2028-02").includes("2028-02-29"));
  assert.equal(shiftSocialMonth("2026-12", 1), "2027-01");
  assert.equal(shiftSocialMonth("2026-01", -1), "2025-12");
  assert.equal(shiftSocialDate("2028-03-01", -1), "2028-02-29");
});

test("calendar dates follow group timezone and cancelled history stays opt-in", () => {
  assert.equal(socialEventsOnDate([event], "2026-10-12", data.timezone).length, 1);
  assert.equal(socialEventsOnDate([event], "2026-10-13", data.timezone).length, 0);
  assert.equal(socialEventsOnDate([{ ...event, cancelled: true }], "2026-10-12", data.timezone).length, 0);
  assert.equal(socialEventsOnDate([{ ...event, cancelled: true }], "2026-10-12", data.timezone, true).length, 1);
  const byDay = socialEventsByDay([event], socialMonthDays(data.month), data.timezone);
  assert.equal(byDay.get("2026-10-12")?.length, 1);
  assert.equal(byDay.get("2026-10-13")?.length, 0);
});

test("event times round-trip locally and new events default to future times", () => {
  assert.deepEqual(socialEventLocalFields(event, data.timezone), { start: "2026-10-12T23:00", end: "2026-10-13T00:00" });
  assert.deepEqual(newSocialEventLocalFields("2026-10-12", "Pacific/Auckland", new Date("2026-10-12T10:59:00Z")), { start: "2026-10-13T00:00", end: "2026-10-13T01:00" });
  assert.deepEqual(newSocialEventLocalFields("2026-10-15", "Pacific/Auckland", now), { start: "2026-10-15T18:00", end: "2026-10-15T19:00" });
});

test("UI handles idempotency, revisions and non-blocking overlap warnings", async () => {
  const [hook, dialogs, page] = await Promise.all(["use-social-groups.ts", "social-event-dialogs.tsx", "social-groups-page.tsx"].map((file) => readFile(`components/social-groups/${file}`, "utf8")));
  assert.match(hook, /currentRequest\.current\?\.abort\(\)/);
  assert.match(hook, /sequence === requestSequence\.current/);
  assert.match(hook, /if \(mutationLock\.current\) return false/);
  assert.match(hook, /setNotice\(body.warning \|\|/);
  assert.match(hook, /request may have reached Covie/);
  assert.match(dialogs, /useState\(\(\) => crypto.randomUUID\(\)\)/);
  assert.match(dialogs, /id: event.id, version: event.version/);
  assert.match(dialogs, /: \{ requestId \}/);
  assert.match(dialogs, /Events can overlap/);
  assert.match(dialogs, /onSaved\(fields.start.slice\(0, 10\)\)/);
  assert.match(dialogs, /CovieNotice tone="teal">\{notice\}/);
  assert.match(page, /version: cancelTarget.version/);
  assert.match(page, /CovieConfirmDialog/);
  assert.match(page, /Show cancelled events/);
  assert.doesNotMatch(page + dialogs, /window.confirm|alert\(/);
});

test("month controls retain native labels, arrow navigation and scope on mobile", async () => {
  const [calendar, page, forms, styles] = await Promise.all(["social-month-calendar.tsx", "social-groups-page.tsx", "social-organiser-forms.tsx", "social-groups.module.css"].map((file) => readFile(`components/social-groups/${file}`, "utf8")));
  assert.match(calendar, /ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7/);
  assert.match(calendar, /tabIndex=\{date === selectedDate \? 0 : -1\}/);
  assert.match(calendar, /pendingFocus.current && !disabled/);
  assert.match(calendar, /const events = inMonth \? eventsByDay.get\(date\) \?\? \[\] : \[\]/);
  assert.match(page, /if \(!enabled\) return null/);
  assert.match(page, /canOrganiseSocial\(data\) \? <SocialSettingsForm/);
  assert.match(forms, /note \(optional, visible to the group\)|optional, visible to the group/);
  assert.match(forms, /Only you can change your response/);
  assert.match(styles, /repeat\(7, minmax\(0, 1fr\)\)/);
  assert.match(styles, /min-height: 44px/);
  assert.match(styles, /\.stack :global\(\.covie-dialog-description\) \{ display: block/);
  assert.doesNotMatch(styles, /gradient|font-size:\s*(?:9|10)px/);
});

test("social mutations carry the calendar that the form rendered", async () => {
  const hook = await readFile("components/social-groups/use-social-groups.ts", "utf8");
  assert.match(hook, /\.\.\.calendarContextHeaders\(calendarId\)/);
  assert.match(hook, /useSocialGroups\(calendarId: string/);
});

test("social reads and writes discard stale calendar context", async()=>{const source=await readFile("components/social-groups/use-social-groups.ts","utf8");assert.equal((source.match(/throwIfCalendarContextChanged\(response.status,/g)??[]).length,2);assert.match(source,/setData\(null\)/);assert.match(source,/CalendarContextChangedError/);});
