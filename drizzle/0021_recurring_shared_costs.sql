CREATE TYPE "expense_recurrence_frequency" AS ENUM (
  'weekly',
  'fortnightly',
  'monthly',
  'yearly'
);

CREATE TABLE "expense_recurring_series" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "calendar_id" uuid NOT NULL,
  "child_id" uuid,
  "title" text NOT NULL,
  "category" expense_category DEFAULT 'other' NOT NULL,
  "amount_cents" integer NOT NULL,
  "paid_by_participant_id" uuid NOT NULL,
  "start_date" date NOT NULL,
  "due_offset_days" integer,
  "frequency" expense_recurrence_frequency NOT NULL,
  "end_date" date,
  "last_generated_date" date NOT NULL,
  "note" text,
  "active" boolean DEFAULT true NOT NULL,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "expense_recurring_series_amount_positive"
    CHECK ("amount_cents" > 0),
  CONSTRAINT "expense_recurring_series_end_valid"
    CHECK ("end_date" IS NULL OR "end_date" >= "start_date"),
  CONSTRAINT "expense_recurring_series_calendar_id_fkey"
    FOREIGN KEY ("calendar_id") REFERENCES "public"."calendars"("id")
    ON DELETE CASCADE,
  CONSTRAINT "expense_recurring_series_child_id_fkey"
    FOREIGN KEY ("child_id") REFERENCES "public"."children"("id")
    ON DELETE SET NULL,
  CONSTRAINT "expense_recurring_series_paid_by_participant_id_fkey"
    FOREIGN KEY ("paid_by_participant_id") REFERENCES "public"."participants"("id")
    ON DELETE RESTRICT,
  CONSTRAINT "expense_recurring_series_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "public"."participants"("id")
    ON DELETE SET NULL
);

CREATE INDEX "expense_recurring_series_calendar_idx"
  ON "expense_recurring_series" ("calendar_id", "active", "last_generated_date");

CREATE TABLE "expense_recurring_series_shares" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "series_id" uuid NOT NULL,
  "participant_id" uuid NOT NULL,
  "share_cents" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "expense_recurring_series_shares_non_negative"
    CHECK ("share_cents" >= 0),
  CONSTRAINT "expense_recurring_series_shares_series_id_fkey"
    FOREIGN KEY ("series_id") REFERENCES "public"."expense_recurring_series"("id")
    ON DELETE CASCADE,
  CONSTRAINT "expense_recurring_series_shares_participant_id_fkey"
    FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id")
    ON DELETE RESTRICT
);

CREATE UNIQUE INDEX "expense_recurring_series_share_unique"
  ON "expense_recurring_series_shares" ("series_id", "participant_id");

ALTER TABLE "expenses"
  ADD COLUMN "series_id" uuid,
  ADD COLUMN "series_occurrence_date" date;

ALTER TABLE "expenses"
  ADD CONSTRAINT "expenses_series_id_fkey"
  FOREIGN KEY ("series_id") REFERENCES "public"."expense_recurring_series"("id")
  ON DELETE SET NULL;

ALTER TABLE "expenses"
  ADD CONSTRAINT "expenses_series_occurrence_valid"
  CHECK (
    ("series_id" IS NULL AND "series_occurrence_date" IS NULL)
    OR
    ("series_id" IS NOT NULL AND "series_occurrence_date" IS NOT NULL)
  );

CREATE UNIQUE INDEX "expenses_series_occurrence_unique"
  ON "expenses" ("series_id", "series_occurrence_date")
  WHERE "series_id" IS NOT NULL;

INSERT INTO "covie_schema_migrations" ("migration_id", "description", "baseline")
VALUES ('0021', 'Recurring shared costs', false);
