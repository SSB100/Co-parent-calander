import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

async function source(file) {
  return readFile(path.join(root, file), "utf8");
}

test("responsibility persistence supports ownership due dates links recurrence and children", async () => {
  const [migration, schema] = await Promise.all([
    source("drizzle/0008_responsibilities.sql"),
    source("lib/db/schema/responsibilities.ts"),
  ]);

  assert.match(migration, /responsibility_category/);
  assert.match(migration, /responsibility_recurrence/);
  assert.match(migration, /responsible_participant_id/);
  assert.match(migration, /linked_event_id/);
  assert.match(migration, /linked_expense_id/);
  assert.match(migration, /responsibility_children/);
  assert.match(migration, /completed_at/);
  assert.match(schema, /export const responsibilities = pgTable/);
  assert.match(schema, /export const responsibilityChildren = pgTable/);
});

test("other-parent responsibility changes enter the reusable approval engine", async () => {
  const [route, service] = await Promise.all([
    source("app/api/responsibilities/route.ts"),
    source("lib/responsibilities/service.ts"),
  ]);

  assert.match(service, /sharedApprovalTargetForSession/);
  assert.match(service, /needsResponsibilityApproval/);
  assert.match(service, /createApprovalProposal/);
  assert.match(service, /entityType: "responsibility"/);
  assert.match(service, /action: "create"/);
  assert.match(service, /action: "edit"/);
  assert.match(service, /action: "delete"/);
  assert.match(service, /pending: true/);
  assert.match(route, /result\.pending \? 202 : 200/);
});

test("responsibility approval applies agreed state transactionally", async () => {
  const [apply, dispatch, proposalRoute] = await Promise.all([
    source("lib/approvals/responsibility-apply.ts"),
    source("lib/approvals/dispatch.ts"),
    source("app/api/proposals/[id]/route.ts"),
  ]);

  assert.match(apply, /SET status = 'approved'/);
  assert.match(apply, /approval_marker\.status = 'approved'/);
  assert.match(apply, /await sql\.transaction\(statements\)/);
  assert.match(apply, /proposal\.approved/);
  assert.match(apply, /completed before the proposal could be approved/);
  assert.match(dispatch, /acceptResponsibilityApprovalProposal/);
  assert.match(proposalRoute, /acceptAndApplyApprovalProposal/);
});

test("completion is a personal action owned by the responsible parent", async () => {
  const [contracts, route, service] = await Promise.all([
    source("lib/responsibilities/contracts.ts"),
    source("app/api/responsibilities/[id]/completion/route.ts"),
    source("lib/responsibilities/service.ts"),
  ]);

  assert.match(contracts, /operation: z\.enum\(\["complete", "reopen"\]\)/);
  assert.match(service, /Only the responsible parent can update completion/);
  assert.match(service, /responsibility\.complete/);
  assert.match(service, /responsibility\.reopen/);
  const completionService = service.slice(
    service.indexOf("export async function updateResponsibilityCompletion"),
  );
  assert.doesNotMatch(completionService, /createApprovalProposal/);
  assert.match(completionService, /nextResponsibilityDueDate/);
  assert.match(completionService, /next_occurrence_id/);
  assert.match(route, /updateResponsibilityCompletion/);
});

test("recurring responsibilities create only the next occurrence on completion", async () => {
  const service = await source("lib/responsibilities/service.ts");
  const completion = service.slice(
    service.indexOf("export async function updateResponsibilityCompletion"),
  );

  assert.match(completion, /shouldGenerateNext/);
  assert.match(completion, /INSERT INTO responsibilities/);
  assert.match(completion, /INSERT INTO responsibility_children/);
  assert.match(completion, /This recurring responsibility has already created its next occurrence and cannot be reopened/);
});

test("calendar and day details integrate responsibilities without replacing parenting colours", async () => {
  const [calendarRoute, shell, day, dayResponsibilities, nav] = await Promise.all([
    source("app/api/calendar/route.ts"),
    source("components/calendar/calendar-shell.tsx"),
    source("components/calendar/day-details-panel.tsx"),
    source("components/responsibilities/day-responsibilities.tsx"),
    source("components/workspace/workspace-nav.tsx"),
  ]);

  assert.match(calendarRoute, /responsibilityMarkers/);
  assert.match(shell, /responsibilityByDate/);
  assert.match(shell, /WorkspaceNav/);
  assert.match(nav, /href: "\/responsibilities"/);
  assert.match(shell, /One more detail/);
  assert.match(day, /DayResponsibilities/);
  assert.match(dayResponsibilities, /Responsibilities/);
  assert.match(dayResponsibilities, /Mark .* complete/);
});

test("responsibilities UI uses quick templates as prefills and exposes planned fields", async () => {
  const shell = await source("components/responsibilities/responsibilities-shell.tsx");

  assert.match(shell, /Quick start/);
  assert.match(shell, /These only prefill the form/);
  assert.match(shell, /Book appointment/);
  assert.match(shell, /Sign\/return form/);
  assert.match(shell, /Register\/enrol/);
  assert.match(shell, /Responsible parent/);
  assert.match(shell, /Repeat until/);
  assert.match(shell, /Calendar event/);
  assert.match(shell, /Expense/);
  assert.match(shell, /Reason for change/);
  assert.match(shell, /Waiting for agreement/);
  assert.match(shell, /Agreed responsibilities/);
});

test("responsibility workflow remains separate from Google Calendar sync", async () => {
  const files = await Promise.all([
    source("lib/responsibilities/service.ts"),
    source("app/api/responsibilities/route.ts"),
    source("app/api/responsibilities/[id]/completion/route.ts"),
    source("lib/approvals/responsibility-apply.ts"),
  ]);

  for (const text of files) {
    assert.doesNotMatch(text, /google-calendar/);
  }
  assert.match(files[3], /googleSyncQueued: false/);
});
