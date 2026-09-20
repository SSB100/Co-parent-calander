import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

async function source(file) {
  return readFile(path.join(root, file), "utf8");
}

test("expense persistence uses cents, explicit shares and settlement state", async () => {
  const [migration, schema] = await Promise.all([
    source("drizzle/0007_expenses.sql"),
    source("lib/db/schema/expenses.ts"),
  ]);

  assert.match(migration, /amount_cents/);
  assert.match(migration, /expense_shares/);
  assert.match(migration, /expense_settlement_status/);
  assert.match(migration, /CHECK \("amount_cents" > 0\)/);
  assert.match(schema, /export const expenses = pgTable/);
  assert.match(schema, /export const expenseShares = pgTable/);
  assert.match(schema, /settlementStatus/);
});

test("shared expense create edit and delete use the reusable approval engine", async () => {
  const [route, service] = await Promise.all([
    source("app/api/expenses/route.ts"),
    source("lib/expenses/service.ts"),
  ]);

  assert.match(service, /sharedApprovalTargetForSession/);
  assert.match(service, /createApprovalProposal/);
  assert.match(service, /entityType: "expense"/);
  assert.match(service, /action: "create"/);
  assert.match(service, /action: "edit"/);
  assert.match(service, /action: "delete"/);
  assert.match(service, /pending: true/);
  assert.match(route, /result\.pending \? 202 : 200/);
});

test("expense approval applies target mutation and proposal transition together", async () => {
  const [apply, dispatch, proposalRoute] = await Promise.all([
    source("lib/approvals/expense-apply.ts"),
    source("lib/approvals/dispatch.ts"),
    source("app/api/proposals/[id]/route.ts"),
  ]);

  assert.match(apply, /SET status = 'approved'/);
  assert.match(apply, /approval_marker\.status = 'approved'/);
  assert.match(apply, /await sql\.transaction\(statements\)/);
  assert.match(apply, /proposal\.approved/);
  assert.match(dispatch, /acceptExpenseApprovalProposal/);
  assert.match(proposalRoute, /acceptAndApplyApprovalProposal/);
});

test("each parent can append and total only their own Shared Costs payments", async () => {
  const [contracts, settlementRoute, service, schema] = await Promise.all([
    source("lib/expenses/contracts.ts"),
    source("app/api/expenses/[id]/settlement/route.ts"),
    source("lib/expenses/service.ts"),
    source("lib/db/schema/expenses.ts"),
  ]);

  assert.match(contracts, /paymentCents: z\.number\(\)\.int\(\)\.min\(1\)/);
  const settlementService = service.slice(
    service.indexOf("export async function updateExpenseSettlement"),
  );
  assert.match(settlementService, /eq\(expenseShares\.participantId, session\.participantId\)/);
  assert.match(settlementService, /paymentCents > remainingCents/);
  assert.match(settlementService, /INSERT INTO expense_share_payments/);
  assert.match(settlementService, /paid_cents = paid_cents \+ \$\{paymentCents\}::integer/);
  assert.match(settlementService, /share\.paid_cents < share\.share_cents/);
  assert.match(settlementService, /FOR UPDATE/);
  assert.match(settlementService, /expense\.share_payment\.add/);
  assert.doesNotMatch(settlementService, /createApprovalProposal/);
  assert.doesNotMatch(settlementService, /participantId:\s*input/);
  assert.match(settlementRoute, /paymentCents: parsed\.data\.paymentCents/);
  assert.match(schema, /paidCents: integer\("paid_cents"\)/);
  assert.match(schema, /export const expenseSharePayments = pgTable/);
  assert.match(schema, /expense_share_payments_amount_positive/);
});

test("recurring Shared Costs create approved series and idempotent normal occurrences", async () => {
  const [contracts, service, recurrence, apply, worker] = await Promise.all([
    source("lib/expenses/contracts.ts"),
    source("lib/expenses/service.ts"),
    source("lib/expenses/recurrence.ts"),
    source("lib/approvals/expense-apply.ts"),
    source("app/api/google-calendar/worker/route.ts"),
  ]);

  assert.match(contracts, /expenseRecurrenceSchema/);
  assert.match(contracts, /recurrenceEndDate|recurrence/);
  assert.match(service, /createRecurringExpenseSeries/);
  assert.match(service, /proposalExpenseState\(id, details, recurrence\)/);
  assert.match(recurrence, /weekly/);
  assert.match(recurrence, /fortnightly/);
  assert.match(recurrence, /monthly/);
  assert.match(recurrence, /yearly/);
  assert.match(recurrence, /ON CONFLICT \("series_id", "series_occurrence_date"\)/);
  assert.match(recurrence, /initialRecurringExpenseHorizon/);
  assert.match(apply, /expense_recurring_series/);
  assert.match(apply, /proposedRecurrence/);
  assert.match(worker, /materializeActiveRecurringExpenses/);
});

test("Shared Costs UI exposes simple recurrence and branded payment progress", async () => {
  const shell = await source("components/expenses/expenses-shell.tsx");

  assert.match(shell, />One-off</);
  assert.match(shell, />Weekly</);
  assert.match(shell, />Every 2 weeks</);
  assert.match(shell, />Monthly</);
  assert.match(shell, />Yearly</);
  assert.match(shell, /no end date set/);
  assert.match(shell, /This edit changes this occurrence only/);
  assert.match(shell, /Your payment/);
  assert.match(shell, /bg-\[#E8F8F4\]/);
  assert.match(shell, /bg-\[#DDD3FA\]/);
  assert.match(shell, /bg-\[#F7DC86\]/);
  assert.match(shell, /shadow-\[3px_3px_0_#BFEDE6\]/);
});


test("expense workflow remains separate from Google Calendar sync", async () => {
  const [service, apply] = await Promise.all([
    source("lib/expenses/service.ts"),
    source("lib/approvals/expense-apply.ts"),
  ]);

  assert.doesNotMatch(service, /google-calendar/);
  assert.doesNotMatch(apply, /google-calendar/);
  assert.match(apply, /googleSyncQueued: false/);
});

test("expense UI keeps pending agreement separate and links calendar days into expenses", async () => {
  const [shell, day, calendar, nav] = await Promise.all([
    source("components/expenses/expenses-shell.tsx"),
    source("components/expenses/day-expenses.tsx"),
    source("components/calendar/calendar-shell.tsx"),
    source("components/workspace/workspace-nav.tsx"),
  ]);

  assert.match(shell, /Waiting for agreement/);
  assert.match(shell, /Current shared costs/);
  assert.match(shell, /Shared cost archive/);
  assert.match(shell, /50 \/ 50/);
  assert.match(shell, /Paid by payer only/);
  assert.match(shell, /Custom split/);
  assert.match(shell, /Add payment/);
  assert.match(shell, /Add another payment of up to/);
  assert.doesNotMatch(shell, /Enter the total you have paid so far/);
  assert.match(shell, /Paid \$\{money\(share\.paidCents\)\} of \$\{money\(share\.shareCents\)\}/);
  assert.doesNotMatch(shell, /Mark my share paid|Mark my share unpaid|Mark settled/);
  assert.match(shell, /statusFilter === "current"/);
  assert.match(shell, /settlementStatus !== "outstanding"/);
  assert.match(shell, /Covie records payments but does not move money/);
  assert.match(day, /\/expenses\?date=/);
  assert.match(day, /Shared costs on this day/);
  assert.match(calendar, /WorkspaceNav/);
  assert.match(nav, /label: "Shared costs"/);
});

test("Shared Costs documentation reflects the live per-parent payment model", async () => {
  const docs = await source("docs/EXPENSES.md");

  assert.match(docs, /does not transfer money/);
  assert.match(docs, /Each payment entry is additive/);
  assert.match(docs, /0020_expense_share_payment_history\.sql/);
  assert.match(docs, /are not synced into Google Calendar/);
});
