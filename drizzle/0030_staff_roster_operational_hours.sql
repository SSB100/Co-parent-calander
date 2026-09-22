ALTER TABLE "staff_roster_settings"
  ADD COLUMN "operational_start_minute" integer NOT NULL DEFAULT 0,
  ADD COLUMN "operational_end_minute" integer NOT NULL DEFAULT 1440;

ALTER TABLE "staff_roster_settings"
  ADD CONSTRAINT "staff_roster_settings_operational_hours_valid"
  CHECK (
    "operational_start_minute" >= 0
    AND "operational_end_minute" <= 1440
    AND "operational_end_minute" > "operational_start_minute"
  );

INSERT INTO "covie_schema_migrations" ("migration_id", "description", "baseline")
VALUES ('0030', 'Staff roster operational hours', false);
