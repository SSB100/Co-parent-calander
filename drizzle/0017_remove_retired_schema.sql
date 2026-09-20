-- Remove legacy credential storage retired by Managed Neon Auth and the
-- first-generation recurring-rule storage migrated into parenting_schedules by 0013.
-- Preflight on Production (21 Sep 2026):
--   parenting_assignments.recurring_rule_id IS NOT NULL: 0 rows
--   parenting_assignments source='recurring': 0 rows
--   parenting_schedules / slots / children: 2 / 28 / 2
-- This migration was verified on a Neon temporary branch before production apply.

ALTER TABLE "parenting_assignments"
  DROP CONSTRAINT IF EXISTS "parenting_assignments_recurring_rule_id_fkey";

ALTER TABLE "parenting_assignments"
  DROP COLUMN IF EXISTS "recurring_rule_id";

ALTER TABLE "parenting_assignments"
  DROP COLUMN IF EXISTS "source";

DROP TABLE IF EXISTS "recurring_rule_children";
DROP TABLE IF EXISTS "recurring_rules";
DROP TYPE IF EXISTS "assignment_source";

DROP TABLE IF EXISTS "sessions";
DROP TABLE IF EXISTS "access_tokens";
DROP TYPE IF EXISTS "access_token_type";

INSERT INTO "covie_schema_migrations" ("migration_id", "description", "baseline")
VALUES ('0017', 'Remove retired authentication and recurring-rule schema', false);
