import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

async function source(file) {
  return readFile(path.join(root, file), "utf8");
}

async function schemaSource() {
  const directory = path.join(root, "lib/db/schema");
  const files = (await readdir(directory))
    .filter((file) => file.endsWith(".ts"))
    .sort();
  return (await Promise.all(
    files.map((file) => readFile(path.join(directory, file), "utf8")),
  )).join("\n");
}

test("schema migrations are sequential through 0016", async () => {
  const files = (await readdir(path.join(root, "drizzle")))
    .filter((file) => /^\d{4}_.+\.sql$/.test(file))
    .sort();

  assert.deepEqual(
    files.map((file) => file.slice(0, 4)),
    Array.from({ length: 17 }, (_, index) => String(index).padStart(4, "0")),
  );
});

test("0012 baselines historical migrations without replaying them", async () => {
  const migration = await source("drizzle/0012_schema_foundation.sql");

  assert.match(migration, /CREATE TABLE "covie_schema_migrations"/);
  for (let index = 0; index <= 11; index += 1) {
    const id = String(index).padStart(4, "0");
    assert.match(migration, new RegExp("\\('" + id + "',[^\\n]+true\\)"));
  }
  assert.match(migration, /\('0012', 'Migration ledger and data invariants', false\)/);
});

test("database invariants are declared in both migration SQL and Drizzle schema", async () => {
  const [migration, schema] = await Promise.all([
    source("drizzle/0012_schema_foundation.sql"),
    schemaSource(),
  ]);

  const names = [
    "events_end_date_valid",
    "events_recurrence_end_valid",
    "recurring_rules_end_valid",
    "calendar_invites_usage_valid",
    "expenses_settlement_state_valid",
    "google_event_link_range_valid",
    "attachment_ready_state_valid",
    "responsibilities_next_occurrence_id_fk",
    "responsibilities_next_occurrence_idx",
  ];

  for (const name of names) {
    assert.match(migration, new RegExp(name));
    assert.match(schema, new RegExp(name));
  }
});


test("0013 introduces first-class parenting schedules and backfills active legacy rules", async () => {
  const [migration, schema, effective] = await Promise.all([
    source("drizzle/0013_parenting_schedules.sql"),
    schemaSource(),
    source("lib/assignments/effective.ts"),
  ]);

  for (const name of [
    "parenting_schedules",
    "parenting_schedule_slots",
    "parenting_schedule_children",
    "parenting_schedules_end_valid",
    "parenting_schedule_slot_index_valid",
    "parenting_schedule_slot_assignment_valid",
  ]) {
    assert.match(migration, new RegExp(name));
    assert.match(schema, new RegExp(name));
  }

  assert.match(migration, /X-COPARENT-SCHEDULE/);
  assert.match(migration, /'0013', 'First-class parenting schedules'/);
  assert.match(effective, /parentingSchedules/);
  assert.match(effective, /resolveParentingScheduleAssignments/);
  assert.doesNotMatch(effective, /recurringRules|parseFortnightRuleText/);
});


test("0014 retires legacy credential tables without deleting calendar data", async () => {
  const [migration, schema, session] = await Promise.all([
    source("drizzle/0014_retire_legacy_auth.sql"),
    schemaSource(),
    source("lib/security/session.ts"),
  ]);

  assert.match(migration, /DROP TABLE IF EXISTS "sessions"/);
  assert.match(migration, /DROP TABLE IF EXISTS "access_tokens"/);
  assert.match(migration, /DROP TYPE IF EXISTS "access_token_type"/);
  assert.match(migration, /'0014', 'Retire legacy token and session authentication'/);
  assert.doesNotMatch(migration, /DROP TABLE.*calendars|DROP TABLE.*participants/);
  assert.doesNotMatch(schema, /accessTokens|sessions = pgTable|accessTokenType/);
  assert.doesNotMatch(session, /coparent_session|getLegacyEditorSession|claimLegacyCalendarForCurrentUser/);
});


test("schema barrel stays small while feature modules own table definitions", async () => {
  const [barrel, modules] = await Promise.all([
    source("lib/db/schema.ts"),
    readdir(path.join(root, "lib/db/schema")),
  ]);

  assert.match(barrel, /schema\/core/);
  assert.match(barrel, /schema\/parenting/);
  assert.match(barrel, /schema\/approvals/);
  assert.ok(modules.length >= 10);
  assert.doesNotMatch(barrel, /pgTable\(/);
});


test("0015 separates semantic parent identity from presentation colour", async () => {
  const [migration, core] = await Promise.all([
    source("drizzle/0015_parent_profile_identity.sql"),
    source("lib/db/schema/core.ts"),
  ]);

  assert.match(migration, /CREATE TYPE "parent_profile_slot"/);
  assert.match(migration, /ADD COLUMN "profile_slot"/);
  assert.match(migration, /row_number\(\) OVER/);
  assert.match(migration, /participants_calendar_profile_slot_unique/);
  assert.match(migration, /'0015', 'Semantic parent profile identity'/);
  assert.match(core, /parentProfileSlot/);
  assert.match(core, /profileSlot/);
  assert.match(core, /participants_calendar_profile_slot_unique/);
});
