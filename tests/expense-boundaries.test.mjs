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
    source("lib/db/schema.ts"),
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
  const route = await source("app/api/expenses/route.ts");

  assert.match(route, /sharedApprovalTargetForSession/);
  assert.match(route, /createApprovalProposal/);
  assert.match(route, /entityType: "expense"/);
  assert.match(route, /action: "create"/);
  assert.match(route, /action: "edit"/);
  assert.match(route, /action: "delete"/);
  assert.match(route, /pending: true/);
  assert.match(route, /status: 202/);
});

test("expense approval applies target mutation and proposal transition together", async () => {
  const [apply, proposalRoute] = await Promise.all([
    source("lib/approvals/expense-apply.ts"),
    source("app/api/proposals/[id]/route.ts"),
  ]);

  assert.match(apply, /SET status = 'approved'/);
  assert.match(apply, /approval_marker\.status = 'approved'/);
  assert.match(apply, /await sql\.transaction\(statements\)/);
  assert.match(apply, /proposal\.approved/);
  assert.match(proposalRoute, /acceptExpenseApprovalProposal/);
});

test("settlement is an audited operational status rather than a second approval proposal", async () => {
  const settlement = await source("app/api/expenses/[id]/settlement/route.ts");

  assert.match(settlement, /operation: z\.enum\(\["settle", "reopen"\]\)/);
  assert.match(settlement, /expense\.settlement\.update/);
  assert.doesNotMatch(settlement, /createApprovalProposal/);
  assert.match(settlement, /settled_by_participant_id/);
});

test("expense workflow remains separate from Google Calendar sync", async () => {
  const [route, apply] = await Promise.all([
    source("app/api/expenses/route.ts"),
    source("lib/approvals/expense-apply.ts"),
  ]);

  assert.doesNotMatch(route, /google-calendar/);
  assert.doesNotMatch(apply, /google-calendar/);
  assert.match(apply, /googleSyncQueued: false/);
});

test("expense UI keeps pending agreement separate and links calendar days into expenses", async () => {
  const [shell, day, calendar] = await Promise.all([
    source("components/expenses/expenses-shell.tsx"),
    source("components/expenses/day-expenses.tsx"),
    source("components/calendar/calendar-shell.tsx"),
  ]);

  assert.match(shell, /Waiting for agreement/);
  assert.match(shell, /Agreed expenses/);
  assert.match(shell, /50 \/ 50/);
  assert.match(shell, /Paid by payer only/);
  assert.match(shell, /Custom split/);
  assert.match(shell, /Mark settled/);
  assert.match(shell, /Covie records payments but does not move money/);
  assert.match(day, /\/expenses\?date=/);
  assert.match(day, /Expenses on this day/);
  assert.match(calendar, /href="\/expenses"/);
});

test("Phase 3 documentation keeps migration and deployment deferred", async () => {
  const docs = await source("docs/EXPENSES.md");

  assert.match(docs, /does not transfer money/);
  assert.match(docs, /Do not apply this migration until the full staged build is approved for deployment/);
  assert.match(docs, /Expense proposals and settlement records are never sent to Google Calendar/);
});
