import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

async function source(file) {
  return readFile(path.join(root, file), "utf8");
}

test("half-day migration preserves existing full-day assignments", async () => {
  const migration = await source("drizzle/0003_half_day_assignments.sql");
  const schema = await source("lib/db/schema.ts");

  assert.match(migration, /ADD COLUMN "afternoon_parent_id" uuid/);
  assert.match(migration, /SET "afternoon_parent_id" = "parent_id"/);
  assert.match(migration, /assignment_afternoon_parent_idx/);
  assert.match(schema, /afternoonParentId:\s*uuid\("afternoon_parent_id"\)/);
});

test("bulk and single-day assignment APIs accept full-day, morning, and afternoon scopes", async () => {
  const bulk = await source("app/api/assignments/route.ts");
  const details = await source("app/api/assignment-details/route.ts");

  for (const text of [bulk, details]) {
    assert.match(text, /z\.enum\(\["full_day", "morning", "afternoon"\]\)/);
    assert.match(text, /afternoon_parent_id/);
    assert.match(text, /morningParentId/);
    assert.match(text, /afternoonParentId/);
  }

  assert.match(bulk, /loadEffectiveAssignmentMap/);
  assert.match(details, /Assign at least one half of the day before adding handover details or a note\./);
});

test("calendar UI renders separate morning and afternoon colour halves and exposes period controls", async () => {
  const shell = await source("components/calendar/calendar-shell.tsx");
  const panel = await source("components/calendar/day-details-panel.tsx");

  assert.match(shell, /top-0 h-1\/2/);
  assert.match(shell, /bottom-0 h-1\/2/);
  assert.match(shell, /AM \{shortOwnerLabel\(assignment\.morning\)\}/);
  assert.match(shell, /PM \{shortOwnerLabel\(assignment\.afternoon\)\}/);
  assert.match(shell, /Bulk assignment period/);

  assert.match(panel, /Full day/);
  assert.match(panel, /Morning/);
  assert.match(panel, /Afternoon/);
  assert.match(panel, /periodLabels/);
});
