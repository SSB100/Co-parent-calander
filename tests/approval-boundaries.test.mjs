import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

async function source(file) {
  return readFile(path.join(root, file), "utf8");
}

test("approval persistence keeps agreed and proposed state separate", async () => {
  const schema = await source("lib/db/schema.ts");
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
