CREATE TYPE "responsibility_category" AS ENUM (
  'school',
  'medical',
  'sport',
  'activity',
  'transport',
  'shopping',
  'forms_permissions',
  'appointment',
  'home_admin',
  'other'
);

CREATE TYPE "responsibility_recurrence" AS ENUM (
  'none',
  'weekly',
  'fortnightly',
  'monthly',
  'yearly'
);

CREATE TABLE "responsibilities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "calendar_id" uuid NOT NULL REFERENCES "calendars"("id") ON DELETE CASCADE,
  "series_id" uuid NOT NULL,
  "title" text NOT NULL,
  "responsible_participant_id" uuid NOT NULL REFERENCES "participants"("id") ON DELETE RESTRICT,
  "due_date" date NOT NULL,
  "due_time" time,
  "category" "responsibility_category" NOT NULL DEFAULT 'other',
  "note" text,
  "recurrence" "responsibility_recurrence" NOT NULL DEFAULT 'none',
  "recurrence_end_date" date,
  "linked_event_id" uuid REFERENCES "events"("id") ON DELETE SET NULL,
  "linked_expense_id" uuid REFERENCES "expenses"("id") ON DELETE SET NULL,
  "completed_at" timestamp with time zone,
  "completed_by_participant_id" uuid REFERENCES "participants"("id") ON DELETE SET NULL,
  "next_occurrence_id" uuid,
  "created_by" uuid REFERENCES "participants"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "responsibility_recurrence_end_valid"
    CHECK ("recurrence_end_date" IS NULL OR "recurrence_end_date" >= "due_date")
);

CREATE INDEX "responsibilities_calendar_due_idx"
  ON "responsibilities" ("calendar_id", "due_date");
CREATE INDEX "responsibilities_calendar_completion_idx"
  ON "responsibilities" ("calendar_id", "completed_at", "due_date");
CREATE INDEX "responsibilities_responsible_due_idx"
  ON "responsibilities" ("responsible_participant_id", "completed_at", "due_date");
CREATE INDEX "responsibilities_series_idx"
  ON "responsibilities" ("calendar_id", "series_id", "due_date");
CREATE INDEX "responsibilities_linked_event_idx"
  ON "responsibilities" ("linked_event_id");
CREATE INDEX "responsibilities_linked_expense_idx"
  ON "responsibilities" ("linked_expense_id");

CREATE TABLE "responsibility_children" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "responsibility_id" uuid NOT NULL REFERENCES "responsibilities"("id") ON DELETE CASCADE,
  "child_id" uuid NOT NULL REFERENCES "children"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX "responsibility_child_unique"
  ON "responsibility_children" ("responsibility_id", "child_id");
CREATE INDEX "responsibility_children_child_idx"
  ON "responsibility_children" ("child_id", "responsibility_id");
