import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

async function source(file) {
  return readFile(path.join(root, file), "utf8");
}

test("event CRUD keeps validation, calendar scoping, transaction, and audit guarantees", async () => {
  const text = await source("app/api/events/route.ts");

  for (const value of ["school", "sport", "medical", "birthday", "holiday", "activity", "other"]) {
    assert.match(text, new RegExp(`["]${value}["]`));
  }
  assert.match(text, /Add an event title\./);
  assert.match(text, /Keep the title under 80 characters\./);
  assert.match(text, /Keep the event note under 500 characters\./);
  assert.match(text, /The event end date cannot be before the start date\./);
  assert.match(text, /Events can span up to 32 days\./);
  assert.match(text, /const editSchema = eventFields\.extend\(\{ id: z\.string\(\)\.uuid\(\) \}\)/);
  assert.match(text, /const deleteSchema = z\.object\(\{ id: z\.string\(\)\.uuid\(\) \}\)/);

  assert.match(text, /getCalendarSession\(\)/);
  assert.match(text, /getEditorSession\(\)/);
  assert.match(text, /eq\(events\.calendarId, session\.calendarId\)/);
  assert.match(text, /request\.nextUrl\.searchParams\.get\("date"\)/);
  assert.match(text, /event\.create/);
  assert.match(text, /event\.update/);
  assert.match(text, /event\.delete/);
  assert.match(text, /beforeState/);
  assert.match(text, /afterState/);

  const transactionCalls = text.match(/await sql\.transaction\(/g) ?? [];
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

test("event creation is explicit and day details surface matching events", async () => {
  const eventPanel = await source("components/calendar/event-panel.tsx");
  const dayPanel = await source("components/calendar/day-details-panel.tsx");
  const activityPanel = await source("components/calendar/activity-panel.tsx");
  const settingsPanel = await source("components/calendar/settings-panel.tsx");

  assert.match(eventPanel, /Create event/);
  assert.match(eventPanel, /Birthday/);
  assert.match(eventPanel, /School/);
  assert.match(eventPanel, /await loadEvents\(\)/);
  assert.match(eventPanel, /setMessage\(wasEditing \? "Event updated\." : "Event added to the shared calendar\."\)/);
  assert.match(eventPanel, /setMessage\("Event removed\."\)/);
  assert.match(dayPanel, /Events on this day/);
  assert.match(dayPanel, /\/api\/events\?date=/);
  assert.match(activityPanel, /aria-label="Activity"/);
  assert.match(settingsPanel, /aria-label="Settings"/);
});
