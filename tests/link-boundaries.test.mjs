import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

async function source(file) {
  return readFile(path.join(root, file), "utf8");
}

test("Phase 8 adds a canonical symmetric cross-feature link table", async () => {
  const [migration, schema] = await Promise.all([
    source("drizzle/0011_entity_links.sql"),
    source("lib/db/schema.ts"),
  ]);

  assert.match(migration, /CREATE TYPE "linked_entity_type"/);
  assert.match(migration, /CREATE TABLE "entity_links"/);
  assert.match(migration, /entity_link_not_self/);
  assert.match(migration, /entity_link_canonical/);
  assert.match(migration, /entity_links_unique/);
  assert.match(migration, /cleanup_entity_links_for_deleted_record/);
  assert.match(schema, /export const entityLinks = pgTable/);
  assert.match(schema, /export const linkedEntityType = pgEnum/);
});

test("Related Items API aggregates native explicit and document relationships", async () => {
  const route = await source("app/api/links/route.ts");

  assert.match(route, /nativeRelatedItems/);
  assert.match(route, /explicitRelatedItems/);
  assert.match(route, /documentRelatedItems/);
  assert.match(route, /responsibilities\.linkedEventId/);
  assert.match(route, /responsibilities\.linkedExpenseId/);
  assert.match(route, /responsibilityChildren/);
  assert.match(route, /expenses\.childId/);
  assert.match(route, /attachmentLinks/);
});

test("native links remain authoritative and are not removable from the generic panel", async () => {
  const route = await source("app/api/links/route.ts");

  assert.match(route, /origin: "native"/);
  assert.match(route, /removable: false/);
  assert.match(route, /item\.origin === "native"/);
});

test("candidate catalogue is editor-only and loaded in bounded queries", async () => {
  const route = await source("app/api/links/route.ts");

  assert.match(
    route,
    /session\.permission === "owner" \|\| session\.permission === "editor"/,
  );
  assert.match(route, /Promise\.all\(\[/);
  assert.match(route, /\.limit\(150\)/);
  assert.match(route, /\.limit\(50\)/);

  const candidateBlock = route.slice(
    route.indexOf("async function candidateItems"),
    route.indexOf("export async function GET"),
  );
  assert.doesNotMatch(candidateBlock, /loadLinkableSummary/);
});

test("cross-feature link mutations are idempotent and audited", async () => {
  const route = await source("app/api/links/route.ts");

  assert.match(route, /existingAttachmentLinks/);
  assert.match(route, /existingEntityLinks/);
  assert.match(route, /'link\.create'/);
  assert.match(route, /'link\.delete'/);
  assert.match(route, /return NextResponse\.json\(\{ ok: true \}\)/);
});

test("documents reuse attachment_links and cannot detach from their primary owner", async () => {
  const route = await source("app/api/links/route.ts");

  assert.match(route, /INSERT INTO attachment_links/);
  assert.match(route, /role = 'supporting'/);
  assert.match(route, /Remove the document from its original item instead/);
  assert.doesNotMatch(route, /INSERT INTO attachments/);
});

test("Related Items appears on agreed expenses responsibilities events and child profiles", async () => {
  const [expenses, responsibilities, dayDetails, child] = await Promise.all([
    source("components/expenses/expenses-shell.tsx"),
    source("components/responsibilities/responsibilities-shell.tsx"),
    source("components/calendar/day-details-panel.tsx"),
    source("components/children/child-profile-shell.tsx"),
  ]);

  assert.match(expenses, /entityType="expense"/);
  assert.match(expenses, /entityId=\{expense\.id\}/);
  assert.match(responsibilities, /entityType="responsibility"/);
  assert.match(responsibilities, /entityId=\{item\.id\}/);
  assert.match(dayDetails, /entityType="event"/);
  assert.match(dayDetails, /entityId=\{event\.id\}/);
  assert.match(child, /entityType="child"/);
  assert.match(child, /entityId=\{child\.id\}/);
});

test("Phase 8 does not add another Home attention signal or month-cell marker", async () => {
  const [home, calendar] = await Promise.all([
    source("components/home/home-shell.tsx"),
    source("components/calendar/calendar-shell.tsx"),
  ]);

  assert.doesNotMatch(home, /LinkedItemsPanel/);
  assert.doesNotMatch(calendar, /LinkedItemsPanel/);
});

test("linking is operational and creates neither approval proposals nor Google Calendar jobs", async () => {
  const files = await Promise.all([
    source("app/api/links/route.ts"),
    source("lib/links/model.ts"),
    source("components/links/linked-items-panel.tsx"),
  ]);

  for (const text of files) {
    assert.doesNotMatch(text, /createApprovalProposal|getSharedApprovalTarget/);
    assert.doesNotMatch(text, /google-calendar|buildCalendarSyncJobStatement/);
  }
});

test("activity history has friendly labels for link and unlink actions", async () => {
  const activity = await source("components/calendar/activity-panel.tsx");

  assert.match(activity, /"link\.create": "linked related Covie items"/);
  assert.match(activity, /"link\.delete": "unlinked related Covie items"/);
});
