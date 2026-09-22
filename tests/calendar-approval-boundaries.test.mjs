import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

async function source(file) {
  return readFile(path.join(root, file), "utf8");
}

test("approval is limited to changes that replace or remove existing custody", async () => {
  const [assignments, details, events, recurring, ownership] = await Promise.all([
    source("app/api/assignments/route.ts"),
    source("app/api/assignment-details/route.ts"),
    source("lib/events/service.ts"),
    source("lib/parenting-schedules/service.ts"),
    source("lib/assignments/ownership.ts"),
  ]);

  for (const text of [assignments, details, recurring]) {
    assert.match(text, /sharedApprovalTargetForSession/);
    assert.match(text, /createApprovalProposal/);
    assert.match(text, /entityType: "parenting_schedule"/);
  }

  assert.match(assignments, /assignmentCustodyChangeRequiresApproval/);
  assert.match(details, /assignmentCustodyChangeRequiresApproval/);
  assert.match(recurring, /repeatingScheduleChangeRequiresApproval/);
  assert.match(ownership, /beforeParentId !== null && beforeParentId !== afterParentId/);

  assert.doesNotMatch(events, /sharedApprovalTargetForSession/);
  assert.doesNotMatch(events, /createApprovalProposal/);
  assert.doesNotMatch(events, /entityType: "shared_event"/);
});

test("solo-parent calendars remain usable until another edit-capable parent is linked", async () => {
  const shared = await source("lib/approvals/shared.ts");

  assert.match(shared, /row\.permission !== "viewer"/);
  assert.match(shared, /row\.participantActive === true/);
  assert.match(shared, /if \(candidates\.length === 0\)/);
  assert.match(shared, /required: false/);
  assert.match(shared, /if \(candidates\.length > 1\)/);
});

test("month data keeps agreed records authoritative and exposes pending changes separately", async () => {
  const loader = await source("lib/calendar/load-calendar.ts");
  const pending = await source("lib/approvals/calendar-pending.ts");

  assert.match(loader, /loadEffectiveAssignmentMap/);
  assert.match(loader, /events: eventRows/);
  assert.match(loader, /pendingProposals/);
  assert.match(loader, /status: "waiting"/);
  assert.match(pending, /affectedDates/);
  assert.match(pending, /kind: "parenting" \| "event" \| "recurring_schedule"/);
});

test("calendar acceptance applies the target and proposal transition transactionally", async () => {
  const [apply, dispatch, proposalRoute] = await Promise.all([
    source("lib/approvals/calendar-apply.ts"),
    source("lib/approvals/dispatch.ts"),
    source("app/api/proposals/[id]/route.ts"),
  ]);

  assert.match(apply, /SET status = 'approved'/);
  assert.match(apply, /status = 'waiting'/);
  assert.match(apply, /INSERT INTO parenting_assignments/);
  assert.doesNotMatch(apply, /recurring_rule_id/);
  assert.doesNotMatch(apply, /source = 'manual'/);
  assert.match(apply, /approval_marker\.status = 'approved'/);
  assert.match(apply, /await sql\.transaction\(statements\)/);
  assert.match(apply, /proposal\.approved/);
  assert.match(apply, /'applied', true/);
  assert.match(dispatch, /acceptCalendarApprovalProposal/);
  assert.match(proposalRoute, /acceptAndApplyApprovalProposal/);
});

test("pending proposals have no direct Google Calendar representation", async () => {
  const genericEngine = await source("lib/approvals/engine.ts");
  const apply = await source("lib/approvals/calendar-apply.ts");
  const mapping = await source("lib/google-calendar/mapping.ts");

  assert.doesNotMatch(genericEngine, /google-calendar/);
  assert.doesNotMatch(mapping, /approval_proposals|approvalProposals|proposedState|pendingProposals/);
  assert.match(apply, /buildCalendarSyncJobStatement/);
  assert.match(apply, /status = 'approved'/);
});

test("calendar UI shows pending status without replacing parenting colours", async () => {
  const shell = await source("components/calendar/calendar-shell.tsx");
  const day = await source("components/calendar/day-details-panel.tsx");
  const actions = await source("components/approvals/proposal-actions.tsx");

  assert.match(shell, /Hourglass/);
  assert.match(shell, /pendingByDate/);
  assert.match(shell, /text-amber-600/);
  assert.match(day, /Pending changes/);
  assert.match(day, /The agreed calendar stays in place until a proposal is accepted/);
  assert.match(day, /agreedSummary/);
  assert.match(day, /proposedSummary/);
  assert.match(day, /Reason for change/);
  assert.match(actions, /Accept/);
  assert.match(actions, /Decline/);
  assert.match(actions, /Withdraw request/);
  assert.match(actions, /Decline reason \(optional\)/);
});


test("Calendar exposes Shared Costs on due dates without turning them into events", async () => {
  const [loader, shell] = await Promise.all([
    source("lib/calendar/load-calendar.ts"),
    source("components/calendar/calendar-shell.tsx"),
  ]);

  assert.match(loader, /expenseMarkerRows/);
  assert.match(loader, /dueDate \?\? item\.expenseDate|item\.dueDate \?\? item\.expenseDate/);
  assert.match(loader, /expenseMarkers/);
  assert.match(shell, /expenseMarkers/);
  assert.match(shell, /expenseByDate/);
  assert.match(shell, /CircleDollarSign/);
  assert.match(shell, /Shared cost outstanding/);
  assert.doesNotMatch(loader, /events\.insert|INSERT INTO events/);
});


test("calendar settings action keeps a visible mobile label", async () => {
  const settings = await source("components/calendar/settings-panel.tsx");

  assert.match(settings, />Calendar settings<\/span>/);
  assert.doesNotMatch(settings, /hidden sm:inline">Settings/);
});
