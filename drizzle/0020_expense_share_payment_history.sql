-- Individual payment history for Shared Costs.
-- Existing paid_cents balances are preserved by backfilling one historical
-- payment row per share with a positive recorded balance.

CREATE TABLE "expense_share_payments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "expense_share_id" uuid NOT NULL,
  "participant_id" uuid NOT NULL,
  "amount_cents" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "expense_share_payments_amount_positive" CHECK ("amount_cents" > 0),
  CONSTRAINT "expense_share_payments_expense_share_id_fkey"
    FOREIGN KEY ("expense_share_id")
    REFERENCES "public"."expense_shares"("id")
    ON DELETE CASCADE,
  CONSTRAINT "expense_share_payments_participant_id_fkey"
    FOREIGN KEY ("participant_id")
    REFERENCES "public"."participants"("id")
    ON DELETE RESTRICT
);

CREATE INDEX "expense_share_payments_share_idx"
  ON "expense_share_payments" ("expense_share_id", "created_at");

CREATE INDEX "expense_share_payments_participant_idx"
  ON "expense_share_payments" ("participant_id", "created_at");

INSERT INTO "expense_share_payments" (
  "expense_share_id",
  "participant_id",
  "amount_cents",
  "created_at"
)
SELECT
  share."id",
  share."participant_id",
  share."paid_cents",
  COALESCE(share."paid_at", share."updated_at", now())
FROM "expense_shares" share
WHERE share."paid_cents" > 0;

INSERT INTO "covie_schema_migrations" ("migration_id", "description", "baseline")
VALUES ('0020', 'Shared-cost payment history', false);
