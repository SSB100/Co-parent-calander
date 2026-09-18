CREATE TYPE "expense_category" AS ENUM (
  'school',
  'childcare',
  'medical',
  'sport',
  'clothing',
  'activity',
  'travel',
  'essentials',
  'other'
);

CREATE TYPE "expense_settlement_status" AS ENUM (
  'not_needed',
  'outstanding',
  'settled'
);

CREATE TABLE "expenses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "calendar_id" uuid NOT NULL REFERENCES "calendars"("id") ON DELETE CASCADE,
  "child_id" uuid REFERENCES "children"("id") ON DELETE SET NULL,
  "expense_date" date NOT NULL,
  "title" text NOT NULL,
  "category" "expense_category" NOT NULL DEFAULT 'other',
  "amount_cents" integer NOT NULL,
  "paid_by_participant_id" uuid NOT NULL REFERENCES "participants"("id") ON DELETE RESTRICT,
  "due_date" date,
  "note" text,
  "settlement_status" "expense_settlement_status" NOT NULL DEFAULT 'outstanding',
  "settled_at" timestamp with time zone,
  "settled_by_participant_id" uuid REFERENCES "participants"("id") ON DELETE SET NULL,
  "created_by" uuid REFERENCES "participants"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "expenses_amount_positive" CHECK ("amount_cents" > 0)
);

CREATE INDEX "expenses_calendar_date_idx" ON "expenses" ("calendar_id", "expense_date");
CREATE INDEX "expenses_calendar_status_idx" ON "expenses" ("calendar_id", "settlement_status");
CREATE INDEX "expenses_child_idx" ON "expenses" ("child_id");
CREATE INDEX "expenses_paid_by_idx" ON "expenses" ("paid_by_participant_id");
CREATE INDEX "expenses_due_date_idx" ON "expenses" ("calendar_id", "due_date");

CREATE TABLE "expense_shares" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "expense_id" uuid NOT NULL REFERENCES "expenses"("id") ON DELETE CASCADE,
  "participant_id" uuid NOT NULL REFERENCES "participants"("id") ON DELETE RESTRICT,
  "share_cents" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "expense_shares_non_negative" CHECK ("share_cents" >= 0)
);

CREATE UNIQUE INDEX "expense_share_participant_unique"
  ON "expense_shares" ("expense_id", "participant_id");
CREATE INDEX "expense_shares_participant_idx"
  ON "expense_shares" ("participant_id", "expense_id");
