import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

async function source(file) {
  return readFile(path.join(root, file), "utf8");
}

test("event CRUD is immediate while keeping validation, calendar scoping, transaction, and audit guarantees", async () => {
  const [route, model, service] = await Promise.all([
    source("app/api/events/route.ts"),
    source("lib/events/model.ts"),
    source("lib/events/service.ts"),
  ]);

  for (const value of ["school", "sport", "medical", "birthday", "holiday", "activity", "other"]) {
    assert.match(model, new RegExp(`["]${value}["]`));
  }
  assert.match(model, /Add an event title\./);
  assert.match(model, /Keep the title under 80 characters\./);
  assert.match(model, /Keep the event note under 500 characters\./);
  assert.doesNotMatch(model, /proposalReasonSchema/);
  assert.match(model, /The event end date cannot be before the start date\./);
  assert.match(model, /Events can span up to 32 days\./);
  assert.match(model, /createEventSchema/);
  assert.match(model, /editEventSchema/);
  assert.match(model, /deleteEventSchema/);

  assert.match(route, /getCalendarSession\(\)/);
  assert.match(route, /getEditorSession\(\)/);
  assert.match(route, /request\.nextUrl\.searchParams\.get\("date"\)/);
  assert.doesNotMatch(route, /result\.pending \? 202 : 200/);

  assert.doesNotMatch(service, /sharedApprovalTargetForSession/);
  assert.doesNotMatch(service, /createApprovalProposal/);
  assert.doesNotMatch(service, /entityType: "shared_event"/);
  assert.doesNotMatch(service, /pending: true/);
  assert.match(service, /eq\(events\.calendarId, input\.calendarId\)/);
  assert.match(service, /event\.create/);
  assert.match(service, /event\.update/);
  assert.match(service, /event\.delete/);
  assert.match(service, /before_state/);
  assert.match(service, /after_state/);

  const transactionCalls = service.match(/await sql\.transaction\(/g) ?? [];
  assert.equal(transactionCalls.length, 3, "event create/update/delete must remain transactional");
});

test("account sharing keeps permission choice, code rotation, revoke, and one-use guarantees", async () => {
  const text = await source("app/api/invites/route.ts");

  assert.match(text, /getOwnerSession\s*\(/);
  assert.match(text, /generateInviteCode\(\)/);
  assert.match(text, /hashToken\(normalizedCode\)/);
  assert.match(text, /permission: z\.enum\(\[["']editor["'], ["']viewer["']\]\)/);
  assert.match(text, /SET revoked_at = now\(\)/);
  assert.match(text, /useCount, calendarInvites\.maxUses/);
  assert.match(text, /revokedAt: new Date\(\)/);
});

test("event creation stays explicit and immediate in the UI", async () => {
  const eventPanel = await source("components/calendar/event-panel.tsx");
  const dayPanel = await source("components/calendar/day-details-panel.tsx");
  const activityPanel = await source("components/calendar/activity-panel.tsx");
  const settingsPanel = await source("components/calendar/settings-panel.tsx");

  assert.match(eventPanel, /Create event/);
  assert.match(eventPanel, /Birthday/);
  assert.match(eventPanel, /School/);
  assert.match(eventPanel, /Event changes are saved immediately for both parents/);
  assert.doesNotMatch(eventPanel, /Reason for change/);
  assert.doesNotMatch(eventPanel, /sent .* approval|sent for approval/);
  assert.match(eventPanel, /Event updated\./);
  assert.match(eventPanel, /Event added to the shared calendar\./);
  assert.match(eventPanel, /Event removed\./);
  assert.match(eventPanel, /await loadEvents\(\)/);
  assert.match(dayPanel, /Shared plans recorded for this day/);
  assert.match(dayPanel, /\/api\/events\?date=/);
  assert.match(dayPanel, /Delete event/);
  assert.match(dayPanel, /method: "DELETE"/);
  assert.match(dayPanel, /Event removed/);
  assert.doesNotMatch(dayPanel, /Event cancellation sent/);
  assert.match(activityPanel, /aria-label="Activity"/);
  assert.match(settingsPanel, /aria-label="Settings"/);
});
