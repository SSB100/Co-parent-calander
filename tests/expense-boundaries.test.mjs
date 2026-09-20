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

test("each parent can only confirm their own payment share", async () => {
  const [contracts, settlementRoute, service, schema] = await Promise.all([
    source("lib/expenses/contracts.ts"),
    source("app/api/expenses/[id]/settlement/route.ts"),
    source("lib/expenses/service.ts"),
    source("lib/db/schema/expenses.ts"),
  ]);

  assert.match(contracts, /operation: z\.enum\(\["mark_paid", "mark_unpaid"\]\)/);
  const settlementService = service.slice(
    service.indexOf("export async function updateExpenseSettlement"),
  );
  assert.match(settlementService, /eq\(expenseShares\.participantId, session\.participantId\)/);
  assert.match(settlementService, /expense\.share_payment\.update/);
  assert.match(settlementService, /share\.share_cents > 0/);
  assert.match(settlementService, /share\.paid_at IS NULL/);
  assert.match(settlementService, /settled_by_participant_id = NULL/);
  assert.doesNotMatch(settlementService, /createApprovalProposal/);
  assert.match(settlementRoute, /updateExpenseSettlement/);
  assert.match(schema, /paidAt: timestamp\("paid_at"/);
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
  assert.match(shell, /Mark my share paid/);
  assert.match(shell, /Mark my share unpaid/);
  assert.doesNotMatch(shell, /Mark settled/);
  assert.match(shell, /statusFilter === "current"/);
  assert.match(shell, /settlementStatus !== "outstanding"/);
  assert.match(shell, /Covie records payments but does not move money/);
  assert.match(day, /\/expenses\?date=/);
  assert.match(day, /Shared costs on this day/);
  assert.match(calendar, /WorkspaceNav/);
  assert.match(nav, /label: "Shared costs"/);
});

test("Phase 3 documentation keeps migration and deployment deferred", async () => {
  const docs = await source("docs/EXPENSES.md");

  assert.match(docs, /does not transfer money/);
  assert.match(docs, /Do not apply this migration until the full staged build is approved for deployment/);
  assert.match(docs, /Expense proposals and settlement records are never sent to Google Calendar/);
});
