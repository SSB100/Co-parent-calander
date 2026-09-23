-- Adds optional contact and weekly-hour expectations to existing Staff profiles.
-- Existing rows and relationships remain unchanged. Apply to Production only
-- after explicit owner approval and qualification on a fresh Production clone.
ALTER TABLE staff_roster_members
  ADD COLUMN contact_email varchar(320),
  ADD COLUMN contact_phone varchar(40),
  ADD COLUMN expected_weekly_minutes integer;

ALTER TABLE staff_roster_members
  ADD CONSTRAINT staff_roster_expected_weekly_minutes_valid
  CHECK (expected_weekly_minutes IS NULL OR expected_weekly_minutes BETWEEN 0 AND 10080);

INSERT INTO covie_schema_migrations(migration_id, description, baseline)
VALUES ('0032', 'Staff roster contact and expected weekly hours', false);
