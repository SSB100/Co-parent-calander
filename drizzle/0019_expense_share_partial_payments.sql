-- Partial per-parent payments for Shared Costs.
-- paid_cents becomes the authoritative progress value. paid_at remains the
-- timestamp when a participant's share reached its full amount.

ALTER TABLE "expense_shares"
  ADD COLUMN "paid_cents" integer NOT NULL DEFAULT 0;

UPDATE "expense_shares"
SET "paid_cents" = "share_cents"
WHERE "paid_at" IS NOT NULL;

ALTER TABLE "expense_shares"
  ADD CONSTRAINT "expense_shares_paid_amount_valid"
  CHECK ("paid_cents" >= 0 AND "paid_cents" <= "share_cents");

UPDATE "expenses" expense
SET
  "settlement_status" = CASE
    WHEN NOT EXISTS (
      SELECT 1
      FROM "expense_shares" share
      WHERE share."expense_id" = expense."id"
        AND share."paid_cents" < share."share_cents"
    ) THEN 'settled'::expense_settlement_status
    ELSE 'outstanding'::expense_settlement_status
  END,
  "settled_at" = CASE
    WHEN NOT EXISTS (
      SELECT 1
      FROM "expense_shares" share
      WHERE share."expense_id" = expense."id"
        AND share."paid_cents" < share."share_cents"
    ) THEN COALESCE(expense."settled_at", expense."updated_at", now())
    ELSE NULL
  END,
  "settled_by_participant_id" = NULL;

INSERT INTO "covie_schema_migrations" ("migration_id", "description", "baseline")
VALUES ('0019', 'Partial per-parent shared-cost payments', false);
