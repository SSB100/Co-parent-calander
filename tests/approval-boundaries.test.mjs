import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

async function source(file) {
  return readFile(path.join(root, file), "utf8");
}

test("approval persistence keeps agreed and proposed state separate", async () => {
  const schema = await source("lib/db/schema/approvals.ts");
  const migration = await source("drizzle/0005_approval_engine.sql");

  for (const field of [
    "previousState",
    "proposedState",
    "proposedByMembershipId",
    "approverMembershipId",
    "reason",
    "declineReason",
    "submittedAt",
    "respondedAt",
    "withdrawnAt",
  ]) {
    assert.match(schema, new RegExp(field));
  }

  assert.match(schema, /approval_proposal_waiting_entity_unique/);
  assert.match(schema, /where\(sql`\$\{table\.status\} = 'waiting'`\)/);
  assert.match(migration, /WHERE "status" = 'waiting'/);
  assert.match(migration, /approval_proposal_history/);
});

test("proposal API is calendar-scoped and mutation-protected", async () => {
  const listRoute = await source("app/api/proposals/route.ts");
  const itemRoute = await source("app/api/proposals/[id]/route.ts");

  assert.match(listRoute, /getCalendarSession\(\)/);
  assert.match(listRoute, /isSameOriginMutation\(request\)/);
  assert.match(listRoute, /saveAsDraft/);
  assert.match(listRoute, /reason/);
  assert.match(itemRoute, /getCalendarSession\(\)/);
  assert.match(itemRoute, /isSameOriginMutation\(request\)/);
  assert.match(itemRoute, /operation: z\.literal\("accept"\)/);
  assert.match(itemRoute, /operation: z\.literal\("decline"\)/);
  assert.match(itemRoute, /operation: z\.literal\("withdraw"\)/);
  assert.match(itemRoute, /declineReason/);
});

test("approval engine never queues Google Calendar sync for pending proposals", async () => {
  const engine = await source("lib/approvals/engine.ts");

  assert.doesNotMatch(engine, /buildCalendarSyncJobStatement/);
  assert.doesNotMatch(engine, /processDueGoogleSyncJobs/);
  assert.doesNotMatch(engine, /google-calendar/);
  assert.match(engine, /status = 'approved'/);
  assert.match(engine, /approver_membership_id = \$\{input\.actor\.membershipId\}/);
  assert.match(engine, /proposed_by_membership_id = \$\{input\.actor\.membershipId\}/);
});

test("shared approval UI uses calm friendly wording", async () => {
  const chip = await source("components/approvals/proposal-status-chip.tsx");
  const card = await source("components/approvals/proposal-card.tsx");

  assert.match(chip, /ProposalStatusChip/);
  assert.match(card, /Waiting for/);
  assert.match(card, /Agreed/);
  assert.match(card, /Proposed/);
  assert.match(card, /Reason/);
  assert.doesNotMatch(card, /disputed|non-compliant|evidence/i);
});


test("approval acceptance dispatches feature applicators before generic fallback", async () => {
  const [dispatch, route] = await Promise.all([
    source("lib/approvals/dispatch.ts"),
    source("app/api/proposals/[id]/route.ts"),
  ]);

  const body = dispatch.slice(
    dispatch.indexOf("export async function acceptAndApplyApprovalProposal"),
  );
  const responsibilityIndex = body.indexOf("acceptResponsibilityApprovalProposal");
  const expenseIndex = body.indexOf("acceptExpenseApprovalProposal");
  const calendarIndex = body.indexOf("acceptCalendarApprovalProposal");
  const genericIndex = body.lastIndexOf("acceptApprovalProposal");

  assert.ok(responsibilityIndex >= 0);
  assert.ok(expenseIndex > responsibilityIndex);
  assert.ok(calendarIndex > expenseIndex);
  assert.ok(genericIndex > calendarIndex);
  assert.match(dispatch, /googleSyncQueued/);
  assert.match(dispatch, /kickGoogleCalendarSync/);
  assert.match(route, /acceptAndApplyApprovalProposal/);
  assert.doesNotMatch(route, /acceptResponsibilityApprovalProposal|acceptExpenseApprovalProposal|acceptCalendarApprovalProposal/);
});


test("proposal withdrawal stays proposer-owned and safely records enum history", async () => {
  const [engine, rules] = await Promise.all([
    source("lib/approvals/engine.ts"),
    source("lib/approvals/rules.ts"),
  ]);

  assert.match(engine, /await sql\.transaction\(\[/);
  assert.match(engine, /withdrawn_at = \$\{transitionedAt\}::timestamptz/);
  assert.match(engine, /\$\{input\.actor\.membershipId\}::uuid/);
  assert.match(engine, /\$\{actorParticipantId\}::uuid/);
  assert.match(engine, /\$\{fromStatus\}::proposal_status/);
  assert.match(engine, /jsonb_build_object\('status', \$\{fromStatus\}::text\)/);
  assert.match(engine, /status IN \('draft', 'waiting'\)/);
  assert.match(engine, /proposed_by_membership_id = \$\{input\.actor\.membershipId\}/);
  assert.match(engine, /proposed_by_participant_id = \$\{input\.actor\.participantId\}/);
  assert.match(engine, /actorParticipantId = input\.actor\.participantId \?\? proposal\.proposedByParticipantId/);
  assert.match(rules, /proposal\.proposedByMembershipId === actor\.membershipId/);
  assert.match(rules, /proposal\.proposedByParticipantId === actor\.participantId/);
  const withdrawRule = rules.slice(
    rules.indexOf("export function canWithdrawProposal"),
    rules.indexOf("export function canUseApprover"),
  );
  assert.doesNotMatch(withdrawRule, /canCreateProposal\(actor\)/);
  assert.match(rules, /proposal\.status === "draft" \|\| proposal\.status === "waiting"/);
});


test("approval lifecycle sends best-effort email notifications to registered account memberships", async () => {
  const [createRoute, operationRoute, email] = await Promise.all([
    source("app/api/proposals/route.ts"),
    source("app/api/proposals/[id]/route.ts"),
    source("lib/email/approval-notifications.ts"),
  ]);

  assert.match(createRoute, /sendApprovalEmail/);
  assert.match(createRoute, /kind: "approval_requested"/);
  assert.match(operationRoute, /kind: "approval_requested"/);
  assert.match(operationRoute, /kind: "approval_approved"/);
  assert.match(operationRoute, /kind: "approval_declined"/);
  assert.match(operationRoute, /kind: "approval_withdrawn"/);
  assert.match(email, /JOIN neon_auth\."user"/);
  assert.match(email, /membership\.user_id/);
  assert.match(email, /RESEND_API_KEY/);
  assert.match(email, /EMAIL_FROM/);
  assert.match(email, /Covie keeps the details inside your private account/);
  assert.doesNotMatch(email, /previousState|proposedState|handover|childName/);
});
