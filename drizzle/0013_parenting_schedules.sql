CREATE TABLE "parenting_schedules" (
  "id" uuid PRIMARY KEY NOT NULL,
  "calendar_id" uuid NOT NULL REFERENCES "calendars"("id") ON DELETE CASCADE,
  "anchor_date" date NOT NULL,
  "end_date" date,
  "active" boolean DEFAULT true NOT NULL,
  "created_by" uuid REFERENCES "participants"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "parenting_schedules_end_valid"
    CHECK ("end_date" IS NULL OR "end_date" >= "anchor_date")
);

CREATE INDEX "parenting_schedules_calendar_idx"
  ON "parenting_schedules" ("calendar_id", "active", "anchor_date");

CREATE TABLE "parenting_schedule_slots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "schedule_id" uuid NOT NULL REFERENCES "parenting_schedules"("id") ON DELETE CASCADE,
  "slot_index" integer NOT NULL,
  "morning_parent_id" uuid REFERENCES "participants"("id") ON DELETE RESTRICT,
  "afternoon_parent_id" uuid REFERENCES "participants"("id") ON DELETE RESTRICT,
  CONSTRAINT "parenting_schedule_slot_index_valid"
    CHECK ("slot_index" >= 0 AND "slot_index" < 14),
  CONSTRAINT "parenting_schedule_slot_assignment_valid"
    CHECK ("morning_parent_id" IS NOT NULL OR "afternoon_parent_id" IS NOT NULL)
);

CREATE UNIQUE INDEX "parenting_schedule_slot_unique"
  ON "parenting_schedule_slots" ("schedule_id", "slot_index");

CREATE TABLE "parenting_schedule_children" (
  "schedule_id" uuid NOT NULL REFERENCES "parenting_schedules"("id") ON DELETE CASCADE,
  "child_id" uuid NOT NULL REFERENCES "children"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "parenting_schedule_child_unique"
  ON "parenting_schedule_children" ("schedule_id", "child_id");

CREATE INDEX "parenting_schedule_child_child_idx"
  ON "parenting_schedule_children" ("child_id", "schedule_id");

WITH parsed_rules AS (
  SELECT
    r.id AS rule_id,
    r.calendar_id,
    substring(r.rrule FROM 'X-COPARENT-SCHEDULE=([0-9a-fA-F-]{36})')::uuid AS schedule_id,
    substring(r.rrule FROM 'X-COPARENT-ANCHOR=([0-9]{4}-[0-9]{2}-[0-9]{2})')::date AS anchor_date,
    substring(r.rrule FROM 'X-COPARENT-SLOT=([0-9]{1,2})')::integer AS slot_index,
    coalesce(
      substring(r.rrule FROM 'X-COPARENT-PERIOD=(full_day|morning|afternoon)'),
      'full_day'
    ) AS period,
    r.parent_id,
    r.end_date,
    r.created_by,
    r.created_at,
    r.updated_at
  FROM "recurring_rules" r
  WHERE
    r.active = true
    AND r.rrule LIKE '%X-COPARENT-SCHEDULE=%'
    AND r.rrule LIKE '%X-COPARENT-ANCHOR=%'
    AND r.rrule LIKE '%X-COPARENT-SLOT=%'
),
valid_rules AS (
  SELECT *
  FROM parsed_rules
  WHERE
    schedule_id IS NOT NULL
    AND anchor_date IS NOT NULL
    AND slot_index BETWEEN 0 AND 13
)
INSERT INTO "parenting_schedules" (
  "id",
  "calendar_id",
  "anchor_date",
  "end_date",
  "active",
  "created_by",
  "created_at",
  "updated_at"
)
SELECT
  schedule_id,
  calendar_id,
  anchor_date,
  min(end_date),
  true,
  (array_agg(created_by ORDER BY created_at))[1],
  min(created_at),
  max(updated_at)
FROM valid_rules
GROUP BY schedule_id, calendar_id, anchor_date
ON CONFLICT ("id") DO NOTHING;

WITH parsed_rules AS (
  SELECT
    substring(r.rrule FROM 'X-COPARENT-SCHEDULE=([0-9a-fA-F-]{36})')::uuid AS schedule_id,
    substring(r.rrule FROM 'X-COPARENT-SLOT=([0-9]{1,2})')::integer AS slot_index,
    coalesce(
      substring(r.rrule FROM 'X-COPARENT-PERIOD=(full_day|morning|afternoon)'),
      'full_day'
    ) AS period,
    r.parent_id
  FROM "recurring_rules" r
  WHERE
    r.active = true
    AND r.rrule LIKE '%X-COPARENT-SCHEDULE=%'
    AND r.rrule LIKE '%X-COPARENT-SLOT=%'
),
valid_rules AS (
  SELECT *
  FROM parsed_rules
  WHERE schedule_id IS NOT NULL AND slot_index BETWEEN 0 AND 13
)
INSERT INTO "parenting_schedule_slots" (
  "schedule_id",
  "slot_index",
  "morning_parent_id",
  "afternoon_parent_id"
)
SELECT
  schedule_id,
  slot_index,
  max(CASE WHEN period IN ('full_day', 'morning') THEN parent_id::text END)::uuid,
  max(CASE WHEN period IN ('full_day', 'afternoon') THEN parent_id::text END)::uuid
FROM valid_rules
GROUP BY schedule_id, slot_index
HAVING
  max(CASE WHEN period IN ('full_day', 'morning') THEN parent_id::text END) IS NOT NULL
  OR
  max(CASE WHEN period IN ('full_day', 'afternoon') THEN parent_id::text END) IS NOT NULL
ON CONFLICT ("schedule_id", "slot_index") DO NOTHING;

WITH parsed_rules AS (
  SELECT
    r.id AS rule_id,
    substring(r.rrule FROM 'X-COPARENT-SCHEDULE=([0-9a-fA-F-]{36})')::uuid AS schedule_id
  FROM "recurring_rules" r
  WHERE
    r.active = true
    AND r.rrule LIKE '%X-COPARENT-SCHEDULE=%'
)
INSERT INTO "parenting_schedule_children" ("schedule_id", "child_id")
SELECT DISTINCT
  parsed_rules.schedule_id,
  links.child_id
FROM parsed_rules
JOIN "recurring_rule_children" links
  ON links.recurring_rule_id = parsed_rules.rule_id
WHERE parsed_rules.schedule_id IS NOT NULL
ON CONFLICT ("schedule_id", "child_id") DO NOTHING;

INSERT INTO "covie_schema_migrations" ("migration_id", "description", "baseline")
VALUES ('0013', 'First-class parenting schedules', false);
