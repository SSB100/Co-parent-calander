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
  const schema = await source("lib/db/schema/parenting.ts");

  assert.match(migration, /ADD COLUMN "afternoon_parent_id" uuid/);
  assert.match(migration, /SET "afternoon_parent_id" = "parent_id"/);
  assert.match(migration, /assignment_afternoon_parent_idx/);
  assert.match(schema, /afternoonParentId:\s*uuid\("afternoon_parent_id"\)/);
});

test("assignment APIs keep legacy half-day scopes and add direct ownership states", async () => {
  const bulk = await source("app/api/assignments/route.ts");
  const details = await source("app/api/assignment-details/route.ts");

  for (const text of [bulk, details]) {
    assert.match(text, /z\.enum\(\["full_day", "morning", "afternoon"\]\)/);
    assert.match(text, /ownershipSchema/);
    assert.match(text, /afternoon_parent_id/);
    assert.match(text, /morningParentId/);
    assert.match(text, /afternoonParentId/);
  }

  assert.match(bulk, /loadEffectiveAssignmentMap/);
  assert.match(details, /Assign this day before adding handover details or a note\./);
});

test("calendar UI keeps split colours but exposes direct custody states instead of period controls", async () => {
  const shell = await source("components/calendar/calendar-shell.tsx");
  const panel = await source("components/calendar/day-details-panel.tsx");
  const styles = await source("app/globals.css");

  assert.match(shell, /inset-y-0 left-0 w-1\/2/);
  assert.match(shell, /inset-y-0 right-0 w-1\/2/);
  assert.match(shell, /me_then_them/);
  assert.match(shell, /them_then_me/);
  assert.doesNotMatch(shell, /Bulk assignment period/);

  assert.match(shell, /inset-y-0 left-1\/2 border-l/);
  assert.doesNotMatch(styles, /width: 50% !important/);
  assert.doesNotMatch(styles, /display: none !important/);
  assert.match(shell, /shortOwnerLabel\(fullDayOwner\)/);
  assert.match(shell, /shortOwnerLabel\(assignment\.morning\)/);
  assert.match(shell, /shortOwnerLabel\(assignment\.afternoon\)/);

  assert.match(panel, /Full day you/);
  assert.match(panel, /them_full/);
  assert.match(panel, /me_then_them/);
  assert.match(panel, /them_then_me/);
  assert.doesNotMatch(panel, /Which part of the day\?/);
});

test("split half-days count as handovers in the calendar summary and day markers", async () => {
  const route = await source("app/api/calendar/route.ts");
  const shell = await source("components/calendar/calendar-shell.tsx");

  assert.match(route, /ne\(parentingAssignments\.parentId, parentingAssignments\.afternoonParentId\)/);
  assert.match(route, /inferredSplitHandoverTime/);
  assert.match(shell, /assignment\.morningParentId !== assignment\.afternoonParentId/);
  assert.match(shell, /nextHandoverIsTransfer \? "Split day"/);
  assert.match(shell, /ownerLabel\(nextHandover\.morningParentId\).*ownerLabel\(nextHandover\.afternoonParentId\)/s);
});
