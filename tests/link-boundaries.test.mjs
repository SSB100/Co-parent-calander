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
    source("lib/db/schema/links.ts"),
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

test("Related Items service aggregates native explicit and document relationships", async () => {
  const service = await source("lib/links/service.ts");

  assert.match(service, /nativeRelatedItems/);
  assert.match(service, /explicitRelatedItems/);
  assert.match(service, /documentRelatedItems/);
  assert.match(service, /responsibilities\.linkedEventId/);
  assert.match(service, /responsibilities\.linkedExpenseId/);
  assert.match(service, /responsibilityChildren/);
  assert.match(service, /expenses\.childId/);
  assert.match(service, /attachmentLinks/);
});

test("native links remain authoritative and are not removable from the generic panel", async () => {
  const service = await source("lib/links/service.ts");

  assert.match(service, /origin: "native"/);
  assert.match(service, /removable: false/);
  assert.match(service, /item\.origin === "native"/);
});

test("candidate catalogue is editor-only and loaded in bounded queries", async () => {
  const service = await source("lib/links/service.ts");

  assert.match(
    service,
    /session\.permission === "owner" \|\|\s*session\.permission === "editor"/,
  );
  assert.match(service, /Promise\.all\(\[/);
  assert.match(service, /\.limit\(150\)/);
  assert.match(service, /\.limit\(50\)/);

  const candidateBlock = service.slice(
    service.indexOf("async function candidateItems"),
    service.indexOf("async function assertSourceAndTarget"),
  );
  assert.doesNotMatch(candidateBlock, /loadLinkableSummary/);
});

test("cross-feature link mutations are idempotent and audited", async () => {
  const service = await source("lib/links/service.ts");

  assert.match(service, /existingAttachmentLinks/);
  assert.match(service, /existingEntityLinks/);
  assert.match(service, /'link\.create'/);
  assert.match(service, /'link\.delete'/);
  assert.match(service, /return \{ ok: true as const \}/);
});

test("documents reuse attachment_links and cannot detach from their primary owner", async () => {
  const service = await source("lib/links/service.ts");

  assert.match(service, /INSERT INTO attachment_links/);
  assert.match(service, /role = 'supporting'/);
  assert.match(service, /Remove the document from its original item instead/);
  assert.doesNotMatch(service, /INSERT INTO attachments/);
});

test("Related Items route keeps access and mutation boundaries at HTTP layer", async () => {
  const route = await source("app/api/links/route.ts");

  assert.match(route, /getCalendarSession\(\)/);
  assert.match(route, /getEditorSession\(\)/);
  assert.match(route, /isSameOriginMutation/);
  assert.match(route, /listRelatedItems/);
  assert.match(route, /createRelatedItemLink/);
  assert.match(route, /deleteRelatedItemLink/);
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
    source("lib/links/service.ts"),
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
