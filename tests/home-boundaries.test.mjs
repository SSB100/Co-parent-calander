import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

async function source(file) {
  return readFile(path.join(root, file), "utf8");
}

test("Home aggregates approvals urgent expenses responsibilities and daily calendar context", async () => {
  const api = await source("app/api/home/route.ts");

  assert.match(api, /listApprovalProposals/);
  assert.match(api, /approverMembershipId === session\.membershipId/);
  assert.match(api, /attentionCutoff/);
  assert.match(api, /expenseReimbursementContext/);
  assert.match(api, /responsibilityAttention/);
  assert.match(api, /todayAssignments/);
  assert.match(api, /expandEventOccurrences/);
  assert.match(api, /nextHandover/);
  assert.match(api, /nextEvent/);
  assert.match(api, /nextExpense/);
  assert.match(api, /nextResponsibility/);
});

test("Needs Attention stays actionable rather than becoming a general activity feed", async () => {
  const api = await source("app/api/home/route.ts");

  assert.match(api, /proposal\.approverMembershipId === session\.membershipId/);
  assert.match(api, /expense\.dueDate <= attentionThrough/);
  assert.match(api, /!item\.completedAt/);
  assert.match(api, /item\.dueDate <= now\.date/);
  assert.doesNotMatch(api, /auditLog|audit_log/);
});

test("Home UI uses calm sections and all-caught-up state without graphs", async () => {
  const shell = await source("components/home/home-shell.tsx");

  assert.match(shell, /Needs attention/);
  assert.match(shell, /You're all caught up\./);
  assert.match(shell, /Today/);
  assert.match(shell, /Coming up/);
  assert.match(shell, /Nothing needs action right now/);
  assert.doesNotMatch(shell, /chart|graph|recharts|canvas/i);
});

test("Home keeps detail workflows in their existing feature areas", async () => {
  const shell = await source("components/home/home-shell.tsx");

  assert.match(shell, /href="\/calendar"/);
  assert.match(shell, /WorkspaceNav/);
  assert.match(await source("components/workspace/workspace-nav.tsx"), /href: "\/expenses"/);
  assert.match(shell, /WorkspaceNav/);
  assert.match(await source("components/workspace/workspace-nav.tsx"), /href: "\/responsibilities"/);
  assert.match(shell, /\/expenses\?date=/);
  assert.match(shell, /\/responsibilities\?date=/);
  assert.match(shell, /ProposalActions/);
});

test("calendar selection now enters Calendar and Covie naming is used on the selector", async () => {
  const [actions, dashboard] = await Promise.all([
    source("app/dashboard/actions.ts"),
    source("app/dashboard/page.tsx"),
  ]);

  assert.match(actions, /redirect\("\/calendar"\)/);
  assert.doesNotMatch(actions, /redirect\("\/home"\)/);
  assert.match(dashboard, />Covie</);
  assert.match(dashboard, />Open Covie</);
});

test("existing core feature screens all expose Home navigation", async () => {
  const files = await Promise.all([
    source("components/calendar/calendar-shell.tsx"),
    source("components/expenses/expenses-shell.tsx"),
    source("components/responsibilities/responsibilities-shell.tsx"),
  ]);

  for (const text of files) {
    assert.match(text, /WorkspaceNav/);
  assert.match(await source("components/workspace/workspace-nav.tsx"), /href: "\/home"/);
  }
});

test("Home remains a derived overview with no Home-specific database model", async () => {
  const [api, schema] = await Promise.all([
    source("app/api/home/route.ts"),
    source("lib/db/schema.ts"),
  ]);

  assert.doesNotMatch(api, /INSERT INTO .*home|UPDATE .*home|DELETE FROM .*home/i);
  assert.doesNotMatch(schema, /export const home[A-Z]|pgTable\("home/);
});

test("Home does not create a new Google Calendar sync surface", async () => {
  const files = await Promise.all([
    source("app/api/home/route.ts"),
    source("components/home/home-shell.tsx"),
    source("lib/home/summary.ts"),
  ]);

  for (const text of files) {
    assert.doesNotMatch(text, /google-calendar/);
    assert.doesNotMatch(text, /buildCalendarSyncJobStatement/);
  }
});
