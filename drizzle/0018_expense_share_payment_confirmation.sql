-- Per-parent payment confirmation for shared costs.
-- Existing archived costs keep their archived state by backfilling each positive share
-- with the existing settlement timestamp. Existing outstanding costs remain unpaid.

ALTER TABLE "expense_shares"
  ADD COLUMN "paid_at" timestamp with time zone;

UPDATE "expense_shares" share
SET "paid_at" = COALESCE(expense."settled_at", expense."updated_at")
FROM "expenses" expense
WHERE expense."id" = share."expense_id"
  AND share."share_cents" > 0
  AND expense."settlement_status" IN ('settled', 'not_needed');

UPDATE "expenses"
SET
  "settlement_status" = 'settled',
  "settled_at" = COALESCE("settled_at", "updated_at"),
  "settled_by_participant_id" = NULL
WHERE "settlement_status" = 'not_needed';

INSERT INTO "covie_schema_migrations" ("migration_id", "description", "baseline")
VALUES ('0018', 'Per-parent shared-cost payment confirmation', false);
