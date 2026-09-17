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

  assert.match(text, /eq\(events\.calendarId, session\.calendarId\)/);
  assert.match(text, /event\.create/);
  assert.match(text, /event\.update/);
  assert.match(text, /event\.delete/);
  assert.match(text, /beforeState/);
  assert.match(text, /afterState/);

  const transactionCalls = text.match(/await sql\.transaction\(/g) ?? [];
  assert.equal(transactionCalls.length, 3, "event create/update/delete must remain transactional");
});

test("read-only sharing keeps token rotation, revoke, calendar flag, audit, and viewer URL guarantees", async () => {
  const text = await source("app/api/share/route.ts");

  assert.match(text, /eq\(accessTokens\.type,\s*["']viewer["']\)/);
  assert.match(text, /isNull\(accessTokens\.revokedAt\)/);
  assert.match(text, /const token\s*=\s*generateSecureToken\(\)/);
  assert.match(text, /const tokenHash\s*=\s*hashToken\(token\)/);
  assert.match(text, /type = 'viewer'/);
  assert.match(text, /SET revoked_at = now\(\)/);
  assert.match(text, /SET share_enabled = true/);
  assert.match(text, /SET share_enabled = false/);
  assert.match(text, /share\.viewer_link_generated/);
  assert.match(text, /share\.viewer_link_revoked/);
  assert.match(text, /viewerUrl:\s*`\$\{request\.nextUrl\.origin\}\/share\/\$\{token\}`/);

  const transactionCalls = text.match(/await sql\.transaction\(/g) ?? [];
  assert.equal(transactionCalls.length, 2, "viewer link generation and revoke must remain transactional");
});

test("event feedback survives list refreshes and icon-only mobile controls stay named", async () => {
  const eventPanel = await source("components/calendar/event-panel.tsx");
  const activityPanel = await source("components/calendar/activity-panel.tsx");
  const settingsPanel = await source("components/calendar/settings-panel.tsx");

  assert.match(
    eventPanel,
    /await loadEvents\(\);\s*setMessage\(editingId \? "Event updated\." : "Event added to the shared calendar\."\);/,
  );
  assert.match(eventPanel, /await loadEvents\(\);\s*setMessage\("Event removed\."\);/);
  assert.match(activityPanel, /aria-label="Activity"/);
  assert.match(settingsPanel, /aria-label="Settings"/);
});
