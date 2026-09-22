CREATE TYPE "calendar_type" AS ENUM (
  'co_parenting',
  'staff_rosters',
  'shared_facilities',
  'social_groups'
);

ALTER TABLE "calendars"
  ADD COLUMN "calendar_type" calendar_type NOT NULL DEFAULT 'co_parenting';

INSERT INTO "covie_schema_migrations" ("migration_id", "description", "baseline")
VALUES ('0022', 'Calendar template types and navigation', false);
