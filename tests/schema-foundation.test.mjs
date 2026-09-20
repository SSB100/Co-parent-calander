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

test("schema migrations are sequential through 0021", async () => {
  const files = (await readdir(path.join(root, "drizzle")))
    .filter((file) => /^\d{4}_.+\.sql$/.test(file))
    .sort();

  assert.deepEqual(
    files.map((file) => file.slice(0, 4)),
    Array.from({ length: 22 }, (_, index) => String(index).padStart(4, "0")),
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


test("0014 retires the legacy auth runtime path while preserving recovery data", async () => {
  const [migration, schema, session] = await Promise.all([
    source("drizzle/0014_retire_legacy_auth.sql"),
    schemaSource(),
    source("lib/security/session.ts"),
  ]);

  assert.match(migration, /'0014', 'Retire legacy token and session authentication'/);
  assert.match(migration, /recovery data/i);
  assert.doesNotMatch(migration, /DROP TABLE|DROP TYPE|DELETE FROM/);
  assert.doesNotMatch(schema, /accessTokens|sessions = pgTable|accessTokenType/);
  assert.doesNotMatch(session, /coparent_session|getLegacyEditorSession|claimLegacyCalendarForCurrentUser/);
});


test("0017 removes retired auth and recurring-rule storage from the live schema", async () => {
  const [migration, parenting] = await Promise.all([
    source("drizzle/0017_remove_retired_schema.sql"),
    source("lib/db/schema/parenting.ts"),
  ]);

  for (const retired of [
    "access_tokens",
    "sessions",
    "access_token_type",
    "recurring_rules",
    "recurring_rule_children",
    "assignment_source",
    "recurring_rule_id",
  ]) {
    assert.match(migration, new RegExp(retired));
  }

  assert.match(migration, /DROP TABLE IF EXISTS "access_tokens"/);
  assert.match(migration, /DROP TABLE IF EXISTS "recurring_rules"/);
  assert.match(migration, /DROP COLUMN IF EXISTS "recurring_rule_id"/);
  assert.match(migration, /DROP COLUMN IF EXISTS "source"/);
  assert.match(migration, /'0017', 'Remove retired authentication and recurring-rule schema'/);

  assert.doesNotMatch(parenting, /recurringRules|recurringRuleChildren|assignmentSource|recurringRuleId/);
  assert.match(parenting, /parentingSchedules/);
  assert.match(parenting, /parentingAssignments/);
});


test("0018 adds per-parent shared-cost payment confirmation", async () => {
  const [migration, expenseSchema] = await Promise.all([
    source("drizzle/0018_expense_share_payment_confirmation.sql"),
    source("lib/db/schema/expenses.ts"),
  ]);

  assert.match(migration, /ADD COLUMN "paid_at"/);
  assert.match(migration, /expense\."settlement_status" IN \('settled', 'not_needed'\)/);
  assert.match(migration, /'0018', 'Per-parent shared-cost payment confirmation'/);
  assert.match(expenseSchema, /paidAt: timestamp\("paid_at"/);
});


test("0019 adds partial paid amounts to each shared-cost share", async () => {
  const [migration, expenseSchema] = await Promise.all([
    source("drizzle/0019_expense_share_partial_payments.sql"),
    source("lib/db/schema/expenses.ts"),
  ]);

  assert.match(migration, /ADD COLUMN "paid_cents"/);
  assert.match(migration, /SET "paid_cents" = "share_cents"/);
  assert.match(migration, /expense_shares_paid_amount_valid/);
  assert.match(migration, /'0019', 'Partial per-parent shared-cost payments'/);
  assert.match(expenseSchema, /paidCents: integer\("paid_cents"\)/);
  assert.match(expenseSchema, /expense_shares_paid_amount_valid/);
});


test("0020 records individual Shared Costs payments and backfills existing balances", async () => {
  const [migration, expenseSchema] = await Promise.all([
    source("drizzle/0020_expense_share_payment_history.sql"),
    source("lib/db/schema/expenses.ts"),
  ]);

  assert.match(migration, /CREATE TABLE "expense_share_payments"/);
  assert.match(migration, /share\."paid_cents"/);
  assert.match(migration, /expense_share_payments_amount_positive/);
  assert.match(migration, /'0020', 'Shared-cost payment history'/);
  assert.match(expenseSchema, /export const expenseSharePayments = pgTable/);
  assert.match(expenseSchema, /amountCents: integer\("amount_cents"\)/);
});


test("0021 adds recurring Shared Costs series and occurrence identity", async () => {
  const [migration, expenseSchema] = await Promise.all([
    source("drizzle/0021_recurring_shared_costs.sql"),
    source("lib/db/schema/expenses.ts"),
  ]);

  for (const token of [
    "expense_recurrence_frequency",
    "expense_recurring_series",
    "expense_recurring_series_shares",
    "series_occurrence_date",
    "expenses_series_occurrence_unique",
  ]) {
    assert.match(migration, new RegExp(token));
  }
  assert.match(migration, /'0021', 'Recurring shared costs'/);
  assert.match(expenseSchema, /expenseRecurrenceFrequency/);
  assert.match(expenseSchema, /expenseRecurringSeries/);
  assert.match(expenseSchema, /expenseRecurringSeriesShares/);
  assert.match(expenseSchema, /seriesOccurrenceDate/);
  assert.match(expenseSchema, /expenses_series_occurrence_unique/);
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
