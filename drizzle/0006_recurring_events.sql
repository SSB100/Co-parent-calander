CREATE TYPE "event_recurrence" AS ENUM (
  'none',
  'weekly',
  'fortnightly',
  'monthly',
  'yearly'
);

ALTER TABLE "events"
  ADD COLUMN "recurrence" "event_recurrence" DEFAULT 'none' NOT NULL,
  ADD COLUMN "recurrence_end_date" date;

CREATE INDEX "events_calendar_recurrence_idx"
  ON "events" ("calendar_id", "recurrence", "recurrence_end_date");
