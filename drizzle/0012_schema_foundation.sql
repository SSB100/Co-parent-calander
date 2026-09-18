CREATE TABLE "covie_schema_migrations" (
  "migration_id" varchar(64) PRIMARY KEY NOT NULL,
  "description" text NOT NULL,
  "baseline" boolean DEFAULT false NOT NULL,
  "applied_at" timestamp with time zone DEFAULT now() NOT NULL
);

INSERT INTO "covie_schema_migrations" ("migration_id", "description", "baseline")
VALUES
  ('0000', 'Initial calendar schema', true),
  ('0001', 'Nullable assignment parent', true),
  ('0002', 'Account memberships and invites', true),
  ('0003', 'Half-day assignments', true),
  ('0004', 'Google Calendar sync', true),
  ('0005', 'Approval engine', true),
  ('0006', 'Recurring shared events', true),
  ('0007', 'Expenses', true),
  ('0008', 'Responsibilities', true),
  ('0009', 'Child profiles', true),
  ('0010', 'Attachments', true),
  ('0011', 'Entity links', true),
  ('0012', 'Migration ledger and data invariants', false);

ALTER TABLE "events"
  ADD CONSTRAINT "events_end_date_valid"
  CHECK ("end_date" IS NULL OR "end_date" >= "start_date");

ALTER TABLE "events"
  ADD CONSTRAINT "events_recurrence_end_valid"
  CHECK ("recurrence_end_date" IS NULL OR "recurrence_end_date" >= "start_date");

ALTER TABLE "recurring_rules"
  ADD CONSTRAINT "recurring_rules_end_valid"
  CHECK ("end_date" IS NULL OR "end_date" >= "start_date");

ALTER TABLE "calendar_invites"
  ADD CONSTRAINT "calendar_invites_usage_valid"
  CHECK ("max_uses" >= 1 AND "use_count" >= 0 AND "use_count" <= "max_uses");

ALTER TABLE "expenses"
  ADD CONSTRAINT "expenses_settlement_state_valid"
  CHECK (
    ("settlement_status" = 'settled' AND "settled_at" IS NOT NULL)
    OR
    ("settlement_status" <> 'settled' AND "settled_at" IS NULL)
  );

ALTER TABLE "google_event_links"
  ADD CONSTRAINT "google_event_link_range_valid"
  CHECK ("range_end" >= "range_start");

ALTER TABLE "attachments"
  ADD CONSTRAINT "attachment_ready_state_valid"
  CHECK (
    ("status" = 'pending' AND "ready_at" IS NULL)
    OR
    ("status" = 'ready' AND "ready_at" IS NOT NULL)
  );

ALTER TABLE "responsibilities"
  ADD CONSTRAINT "responsibilities_next_occurrence_id_fk"
  FOREIGN KEY ("next_occurrence_id")
  REFERENCES "responsibilities"("id")
  ON DELETE SET NULL;

CREATE INDEX "responsibilities_next_occurrence_idx"
  ON "responsibilities" ("next_occurrence_id");
