CREATE TYPE "parent_profile_slot" AS ENUM ('parent_one', 'parent_two');

ALTER TABLE "participants"
  ADD COLUMN "profile_slot" "parent_profile_slot";

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY calendar_id
      ORDER BY created_at, id
    ) AS position
  FROM participants
  WHERE active = true
)
UPDATE participants participant
SET profile_slot = CASE ranked.position
  WHEN 1 THEN 'parent_one'::parent_profile_slot
  WHEN 2 THEN 'parent_two'::parent_profile_slot
  ELSE NULL
END
FROM ranked
WHERE participant.id = ranked.id
  AND ranked.position <= 2;

CREATE UNIQUE INDEX "participants_calendar_profile_slot_unique"
  ON "participants" ("calendar_id", "profile_slot")
  WHERE "profile_slot" IS NOT NULL;

INSERT INTO "covie_schema_migrations" ("migration_id", "description", "baseline")
VALUES ('0015', 'Semantic parent profile identity', false);
