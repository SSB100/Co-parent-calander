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
  assert.match(api, /proposedByMembershipId === session\.membershipId/);
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

test("Open Updates includes incoming decisions plus the user's own withdrawable requests", async () => {
  const api = await source("app/api/home/route.ts");

  assert.match(api, /proposal\.approverMembershipId === session\.membershipId/);
  assert.match(api, /proposal\.proposedByMembershipId === session\.membershipId/);
  assert.match(api, /expense\.dueDate <= attentionThrough/);
  assert.match(api, /!item\.completedAt/);
  assert.match(api, /item\.dueDate <= now\.date/);
  assert.doesNotMatch(api, /auditLog|audit_log/);
});

test("Updates uses branded action-first sections without duplicating the side-rail feed", async () => {
  const shell = await source("components/home/home-shell.tsx");

  assert.match(shell, /Open updates/);
  assert.match(shell, /#FF6B5F/);
  assert.match(shell, /#BFEDE6/);
  assert.match(shell, /#DDD3FA/);
  assert.match(shell, /#F7DC86/);
  assert.match(shell, /You're all caught up\./);
  assert.match(shell, /Today/);
  assert.match(shell, /Nothing needs action right now/);
  assert.doesNotMatch(shell, /Coming up/);
  assert.doesNotMatch(shell, /chart|graph|recharts|canvas/i);
});

test("Home keeps detail workflows in their existing feature areas", async () => {
  const [shell, nav] = await Promise.all([
    source("components/home/home-shell.tsx"),
    source("components/workspace/workspace-nav.tsx"),
  ]);

  assert.match(shell, /WorkspaceNav/);
  assert.match(nav, /href: "\/calendar"/);
  assert.match(nav, /href: "\/expenses"/);
  assert.match(nav, /href: "\/responsibilities"/);
  assert.match(shell, /\/expenses\?date=/);
  assert.match(shell, /\/responsibilities\?date=/);
  assert.match(shell, /ProposalActions/);
});

test("calendar management now lives in Calendar and Dashboard is only a redirect", async () => {
  const [actions, dashboard, switcher] = await Promise.all([
    source("app/calendar/actions.ts"),
    source("app/dashboard/page.tsx"),
    source("components/calendar/calendar-switcher.tsx"),
  ]);

  assert.match(actions, /redirect\("\/calendar"\)/);
  assert.doesNotMatch(actions, /redirect\("\/home"\)/);
  assert.match(dashboard, /redirect\("\/calendar"\)/);
  assert.match(switcher, /Your calendars/);
  assert.match(switcher, /Create another calendar/);
  assert.match(switcher, /Join another calendar/);
  assert.doesNotMatch(dashboard, /Open Covie|Your calendars/);
});

test("existing core feature screens all use the shared workspace navigation", async () => {
  const [nav, ...files] = await Promise.all([
    source("components/workspace/workspace-nav.tsx"),
    source("components/calendar/calendar-shell.tsx"),
    source("components/expenses/expenses-shell.tsx"),
    source("components/responsibilities/responsibilities-shell.tsx"),
    source("components/children/kids-shell.tsx"),
  ]);

  assert.match(nav, /href: "\/home"/);
  assert.match(nav, /authClient\.signOut/);
  for (const text of files) {
    assert.match(text, /WorkspaceNav/);
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


test("calendar settings and parent changes refetch without hard page reloads", async () => {
  const [calendar, members, settings] = await Promise.all([
    source("components/calendar/calendar-shell.tsx"),
    source("components/calendar/members-panel.tsx"),
    source("components/calendar/settings-panel.tsx"),
  ]);

  assert.match(calendar, /MembersPanel onChanged/);
  assert.match(calendar, /SettingsPanel[\s\S]*onChanged/);
  assert.match(members, /onChanged\?\.\(\)/);
  assert.match(settings, /onChanged\?\.\(\)/);
  assert.doesNotMatch(members, /location\.reload/);
  assert.doesNotMatch(settings, /location\.reload/);
});
