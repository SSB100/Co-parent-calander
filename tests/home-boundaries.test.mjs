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


test("mobile Quick view stays consistent while page actions remain visible", async () => {
  const [styles, nav, comingUp, install, calendar, organiser, expenses, responsibilities] = await Promise.all([
    source("app/globals.css"),
    source("components/workspace/workspace-nav.tsx"),
    source("components/workspace/coming-up.tsx"),
    source("components/pwa/install-app.tsx"),
    source("components/calendar/calendar-shell.tsx"),
    source("components/workspace/organiser-shell.tsx"),
    source("components/expenses/expenses-shell.tsx"),
    source("components/responsibilities/responsibilities-shell.tsx"),
  ]);

  assert.match(styles, /@media \(max-width: 639px\)/);
  assert.match(styles, /workspace-page-actions/);
  assert.match(styles, /workspace-mobile-actions-trigger/);
  assert.match(styles, /workspace-mobile-action-panel[\s\S]*position: absolute/);
  assert.match(styles, /right: 0;[\s\S]*left: auto;/);
  assert.match(styles, /workspace-mobile-actions:not\(\.is-open\)/);
  assert.match(styles, /workspace-coming-up-menu/);
  assert.match(styles, /covie-calendar-page\.is-selecting-days \.covie-install-mobile/);

  assert.match(nav, /aria-label=\{mobileActionsOpen \? "Close quick view" : "Open quick view"\}/);
  assert.match(nav, /<Eye size=\{21\}/);
  assert.match(nav, /<ComingUp variant="menu" \/>/);
  assert.match(nav, /workspace-page-actions/);
  const quickViewStart = nav.indexOf('<div className="workspace-mobile-action-panel">');
  const quickViewEnd = nav.indexOf('<details ref={accountRef}');
  assert.ok(quickViewStart >= 0);
  assert.ok(quickViewEnd > quickViewStart);
  assert.doesNotMatch(nav.slice(quickViewStart, quickViewEnd), /\{actions\}/);
  assert.match(comingUp, />Quick view</);
  assert.match(comingUp, /Upcoming & outstanding/);
  assert.match(comingUp, />Needs attention</);
  assert.match(comingUp, /data\.organiser\.responsibilities\.length > 0 \|\| data\.organiser\.expenses\.length > 0/);
  assert.doesNotMatch(comingUp, /responsibilities\.slice\(0, 1\)|expenses\.slice\(0, 1\)/);
  const mobileOrganiserStart = comingUp.indexOf('variant === "menu" ? (');
  const desktopOrganiserStart = comingUp.indexOf(') : (', mobileOrganiserStart);
  assert.ok(mobileOrganiserStart >= 0);
  assert.ok(desktopOrganiserStart > mobileOrganiserStart);
  const mobileOrganiser = comingUp.slice(mobileOrganiserStart, desktopOrganiserStart);
  assert.doesNotMatch(mobileOrganiser, /workspace-priority-card/);
  assert.doesNotMatch(mobileOrganiser, />Responsibilities<|>Expenses</);

  assert.match(expenses, /Add expense/);
  assert.match(responsibilities, /Add responsibility/);
  assert.match(calendar, /Sync to Google|GoogleCalendarQuickAction/);

  assert.match(install, /Close install Covie prompt/);
  assert.match(organiser, /p-4 sm:p-6/);
});


test("every workspace page pins Quick view to the top-right corner and opens inward", async () => {
  const [styles, calendar, home, organiser, expenses, responsibilities, kids] = await Promise.all([
    source("app/globals.css"),
    source("components/calendar/calendar-shell.tsx"),
    source("components/home/home-shell.tsx"),
    source("components/workspace/organiser-shell.tsx"),
    source("components/expenses/expenses-shell.tsx"),
    source("components/responsibilities/responsibilities-shell.tsx"),
    source("components/children/kids-shell.tsx"),
  ]);

  assert.match(styles, /\.covie-page-header,[\s\S]*?\.covie-calendar-header \{[\s\S]*?position: relative;/);
  assert.match(styles, /\.covie-page-title \{[\s\S]*?max-width: calc\(100% - 50px\);/);
  assert.doesNotMatch(styles, /padding-right: 50px;/);
  assert.match(styles, /\.workspace-actions \{[\s\S]*?width: 100%;[\s\S]*?justify-content: flex-end;/);
  assert.match(styles, /\.workspace-mobile-actions \{[\s\S]*?position: absolute;[\s\S]*?top: 0;[\s\S]*?right: 0;[\s\S]*?left: auto;/);
  assert.match(styles, /\.workspace-actions:not\(:has\(\.workspace-page-actions\)\) \{[\s\S]*?display: contents;/);
  assert.match(styles, /\.workspace-page-actions \{[\s\S]*?order: 2;[\s\S]*?width: 100%;/);
  assert.match(styles, /\.workspace-mobile-action-panel \{[\s\S]*?right: 0;[\s\S]*?left: auto;/);
  assert.match(styles, /max-width: calc\(100vw - 16px\)/);

  for (const page of [calendar, home, organiser, expenses, responsibilities, kids]) {
    assert.match(page, /WorkspaceNav/);
  }
});


test("Covie interactive surfaces use the branded action hierarchy instead of generic black controls", async () => {
  const [
    styles,
    calendar,
    day,
    expenses,
    responsibilities,
    child,
    attachments,
    links,
    google,
    undo,
    onboarding,
  ] = await Promise.all([
    source("app/globals.css"),
    source("components/calendar/calendar-shell.tsx"),
    source("components/calendar/day-details-panel.tsx"),
    source("components/expenses/expenses-shell.tsx"),
    source("components/responsibilities/responsibilities-shell.tsx"),
    source("components/children/child-profile-shell.tsx"),
    source("components/attachments/attachment-panel.tsx"),
    source("components/links/linked-items-panel.tsx"),
    source("components/calendar/google-calendar-settings.tsx"),
    source("components/calendar/undo-bulk-button.tsx"),
    source("components/onboarding/onboarding-shell.tsx"),
  ]);

  assert.match(styles, /\.covie-action-teal/);
  assert.match(styles, /\.covie-action-violet/);
  assert.match(styles, /\.covie-action-sunshine/);
  assert.match(styles, /\.covie-action-secondary/);
  assert.match(styles, /\.covie-icon-button/);

  assert.match(day, /participantChoiceClass/);
  assert.match(day, /#FFD0CB/);
  assert.match(day, /#DDD3FA/);
  assert.match(day, /#F7DC86/);
  assert.match(day, /covie-primary-action/);
  assert.doesNotMatch(day, /border-slate-900 bg-slate-900 text-white/);

  assert.match(calendar, /covie-action-teal/);
  assert.match(calendar, /covie-action-violet/);
  assert.match(calendar, /covie-action-sunshine/);

  for (const text of [
    expenses,
    responsibilities,
    child,
    attachments,
    links,
    google,
    undo,
    onboarding,
  ]) {
    assert.doesNotMatch(text, /bg-slate-(?:900|950)/);
  }

  assert.match(onboarding, /bg-\[#BFEDE6\]/);
  assert.match(onboarding, /bg-\[#DDD3FA\]/);
});
