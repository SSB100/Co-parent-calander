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

test("schema migrations are sequential through 0029", async () => {
  const files = (await readdir(path.join(root, "drizzle")))
    .filter((file) => /^\d{4}_.+\.sql$/.test(file))
    .sort();

  assert.deepEqual(
    files.map((file) => file.slice(0, 4)),
    Array.from({ length: 30 }, (_, index) => String(index).padStart(4, "0")),
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


test("0022 adds calendar template identity without changing existing calendars", async () => {
  const [migration, core] = await Promise.all([
    source("drizzle/0022_calendar_template_types.sql"),
    source("lib/db/schema/core.ts"),
  ]);

  for (const type of [
    "co_parenting",
    "staff_rosters",
    "shared_facilities",
    "social_groups",
  ]) {
    assert.match(migration, new RegExp(type));
    assert.match(core, new RegExp(type));
  }

  assert.match(migration, /ADD COLUMN "calendar_type"/);
  assert.match(migration, /NOT NULL DEFAULT 'co_parenting'/);
  assert.match(migration, /'0022', 'Calendar template types and navigation'/);
  assert.match(core, /calendarType = pgEnum\("calendar_type"/);
  assert.match(core, /type: calendarType\("calendar_type"\)\.notNull\(\)\.default\("co_parenting"\)/);
});


test("0023 adds isolated Staff Rosters team roles locations and availability", async () => {
  const [migration, schema] = await Promise.all([
    source("drizzle/0023_staff_roster_foundation.sql"),
    source("lib/db/schema/staff-rosters.ts"),
  ]);

  for (const token of [
    "staff_roster_access_role",
    "staff_roster_availability_status",
    "staff_roster_roles",
    "staff_roster_locations",
    "staff_roster_members",
    "staff_roster_availability",
    "staff_roster_availability_time_pair_valid",
  ]) {
    assert.match(migration, new RegExp(token));
    assert.match(schema, new RegExp(token));
  }

  assert.match(
    migration,
    /'0023', 'Staff roster team roles locations and availability foundation'/,
  );
  assert.doesNotMatch(migration, /ALTER TABLE "participants"|ALTER TABLE "children"/);
});


test("0024 adds calendar lifecycle plus Staff roster setup and shifts", async () => {
  const [migration, core, staff] = await Promise.all([
    source("drizzle/0024_calendar_lifecycle_staff_shifts.sql"),
    source("lib/db/schema/core.ts"),
    source("lib/db/schema/staff-rosters.ts"),
  ]);

  assert.match(migration, /ADD COLUMN "archived_at"/);
  assert.match(core, /archivedAt: timestamp\("archived_at"/);

  for (const token of [
    "staff_roster_settings",
    "staff_roster_shifts",
    "staff_roster_shifts_time_valid",
    "availability_override",
  ]) {
    assert.match(migration, new RegExp(token));
    assert.match(staff, new RegExp(token));
  }

  assert.match(
    migration,
    /'0024', 'Calendar lifecycle and Staff roster setup and shifts'/,
  );
  assert.doesNotMatch(migration, /ALTER TABLE "participants"|ALTER TABLE "children"/);
});


test("0025 adds Staff roster published week snapshots without changing live shifts", async () => {
  const [migration, staff] = await Promise.all([
    source("drizzle/0025_staff_roster_publication.sql"),
    source("lib/db/schema/staff-rosters.ts"),
  ]);

  for (const token of [
    "staff_roster_week_publications",
    "staff_roster_published_shifts",
    "staff_roster_week_publications_calendar_week_unique",
    "staff_roster_published_shifts_time_valid",
    "published_by_membership_id",
    "last_sent_by_membership_id",
  ]) {
    assert.match(migration, new RegExp(token));
    assert.match(staff, new RegExp(token));
  }

  assert.match(
    migration,
    /'0025', 'Staff roster published week snapshots'/,
  );
  assert.doesNotMatch(migration, /ALTER TABLE "staff_roster_shifts"/);
});


test("0026 adds Staff attendance corrections and leave without payroll scope", async () => {
  const [migration, staff] = await Promise.all([
    source("drizzle/0026_staff_roster_attendance_leave.sql"),
    source("lib/db/schema/staff-rosters.ts"),
  ]);

  for (const token of [
    "staff_roster_clock_sessions",
    "staff_roster_timesheet_corrections",
    "staff_roster_leave_requests",
    "staff_roster_clock_sessions_member_active_unique",
    "staff_roster_correction_status",
    "staff_roster_leave_status",
  ]) {
    assert.match(migration, new RegExp(token));
    assert.match(staff, new RegExp(token));
  }

  assert.match(
    migration,
    /'0026', 'Staff roster attendance corrections and leave'/,
  );
  for (const excluded of ["payroll", "wage", "paye", "kiwisaver", "gps"]) {
    assert.doesNotMatch(migration.toLowerCase(), new RegExp(excluded));
  }
});


test("0027 adds Staff roster account invitations without reusing co-parent profiles", async () => {
  const [migration, staff] = await Promise.all([
    source("drizzle/0027_staff_roster_invitations.sql"),
    source("lib/db/schema/staff-rosters.ts"),
  ]);

  for (const token of [
    "staff_roster_invites",
    "staff_roster_invites_code_hash_unique",
    "created_by_membership_id",
    "redeemed_by_membership_id",
  ]) {
    assert.match(migration, new RegExp(token));
    assert.match(staff, new RegExp(token));
  }

  assert.match(
    migration,
    /'0027', 'Staff roster account invitations'/,
  );
  assert.doesNotMatch(migration, /participants/);
});


test("0028 adds a lightweight Staff roster publication update feed", async () => {
  const [migration, staff] = await Promise.all([
    source("drizzle/0028_staff_roster_updates.sql"),
    source("lib/db/schema/staff-rosters.ts"),
  ]);

  for (const token of [
    "staff_roster_updates",
    "staff_roster_updates_calendar_created_idx",
    "staff_roster_updates_member_created_idx",
    "before_summary",
    "after_summary",
  ]) {
    assert.match(migration, new RegExp(token));
    assert.match(staff, new RegExp(token));
  }

  assert.match(
    migration,
    /'0028', 'Staff roster publication updates'/,
  );
  assert.doesNotMatch(migration.toLowerCase(), /push_token|email_provider|sms/);
});


test("0029 adds reusable multi-role assignments and backfills existing defaults", async () => {
  const [migration, staff] = await Promise.all([
    source("drizzle/0029_staff_roster_member_roles.sql"),
    source("lib/db/schema/staff-rosters.ts"),
  ]);

  for (const token of [
    "staff_roster_member_roles",
    "staff_roster_member_roles_member_role_unique",
    "default_role_id",
    "ON CONFLICT",
  ]) {
    assert.match(migration, new RegExp(token));
  }
  assert.match(staff, /staffRosterMemberRoles/);
  assert.match(
    migration,
    /'0029', 'Staff roster member multi-role assignments'/,
  );
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
