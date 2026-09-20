import { and, eq } from "drizzle-orm";
import { getDb, getSql } from "@/lib/db";
import { expenses } from "@/lib/db/schema";
import {
  ApprovalEngineError,
  getApprovalProposal,
  getApprovalProposalDetails,
} from "@/lib/approvals/engine";
import { canRespondToProposal } from "@/lib/approvals/rules";
import type { ApprovalActor } from "@/lib/approvals/types";
import {
  assertExpenseRelations,
  defaultSettlementStatus,
  expenseProposalStateSchema,
  financialSignature,
} from "@/lib/expenses/model";

function markerExists(
  sql: ReturnType<typeof getSql>,
  input: {
    proposalId: string;
    calendarId: string;
    actorMembershipId: string;
    respondedAt: Date;
  },
) {
  return sql`
    EXISTS (
      SELECT 1
      FROM approval_proposals approval_marker
      WHERE approval_marker.id = ${input.proposalId}
        AND approval_marker.calendar_id = ${input.calendarId}
        AND approval_marker.status = 'approved'
        AND approval_marker.approver_membership_id = ${input.actorMembershipId}
        AND approval_marker.responded_at = ${input.respondedAt}
    )
  `;
}

function acceptanceTransitionStatement(
  sql: ReturnType<typeof getSql>,
  input: {
    proposalId: string;
    calendarId: string;
    actorMembershipId: string;
    respondedAt: Date;
  },
) {
  return sql`
    UPDATE approval_proposals
    SET status = 'approved', responded_at = ${input.respondedAt}, updated_at = now()
    WHERE id = ${input.proposalId}
      AND calendar_id = ${input.calendarId}
      AND status = 'waiting'
      AND approver_membership_id = ${input.actorMembershipId}
  `;
}

function acceptanceHistoryStatement(
  sql: ReturnType<typeof getSql>,
  input: {
    proposalId: string;
    calendarId: string;
    actor: ApprovalActor;
    respondedAt: Date;
  },
) {
  return sql`
    INSERT INTO approval_proposal_history (
      proposal_id, calendar_id, actor_membership_id, actor_participant_id,
      event_type, from_status, to_status, details
    )
    SELECT
      proposal.id,
      proposal.calendar_id,
      ${input.actor.membershipId},
      ${input.actor.participantId},
      'proposal.approved',
      'waiting',
      'approved',
      jsonb_build_object('applied', true)
    FROM approval_proposals proposal
    WHERE proposal.id = ${input.proposalId}
      AND proposal.calendar_id = ${input.calendarId}
      AND proposal.status = 'approved'
      AND proposal.approver_membership_id = ${input.actor.membershipId}
      AND proposal.responded_at = ${input.respondedAt}
  `;
}

function acceptanceAuditStatement(
  sql: ReturnType<typeof getSql>,
  input: {
    proposalId: string;
    calendarId: string;
    actor: ApprovalActor;
    respondedAt: Date;
  },
) {
  return sql`
    INSERT INTO audit_log (
      calendar_id, actor_participant_id, action, entity_type, entity_id,
      before_state, after_state
    )
    SELECT
      proposal.calendar_id,
      ${input.actor.participantId},
      'proposal.accept',
      'proposal',
      proposal.id,
      jsonb_build_object('status', 'waiting'),
      jsonb_build_object(
        'status', 'approved',
        'targetEntityType', proposal.entity_type,
        'targetEntityId', proposal.entity_id,
        'applied', true
      )
    FROM approval_proposals proposal
    WHERE proposal.id = ${input.proposalId}
      AND proposal.calendar_id = ${input.calendarId}
      AND proposal.status = 'approved'
      AND proposal.approver_membership_id = ${input.actor.membershipId}
      AND proposal.responded_at = ${input.respondedAt}
  `;
}

async function verifyAccepted(calendarId: string, proposalId: string) {
  const details = await getApprovalProposalDetails(calendarId, proposalId);
  if (!details || details.proposal.status !== "approved") {
    throw new ApprovalEngineError(
      409,
      "This proposal is no longer waiting for your approval.",
    );
  }
  return details;
}

export async function acceptExpenseApprovalProposal(input: {
  calendarId: string;
  actor: ApprovalActor;
  proposalId: string;
}) {
  const proposal = await getApprovalProposal(input.calendarId, input.proposalId);
  if (!proposal || proposal.entityType !== "expense") return null;

  if (
    !canRespondToProposal(input.actor, {
      status: proposal.status,
      proposedByMembershipId: proposal.proposedByMembershipId,
      approverMembershipId: proposal.approverMembershipId,
    })
  ) {
    throw new ApprovalEngineError(
      403,
      "Only the parent this was sent to can approve it.",
    );
  }

  const proposed = expenseProposalStateSchema.safeParse(proposal.proposedState);
  const previous = expenseProposalStateSchema.safeParse(proposal.previousState);
  const proposedExpense = proposed.success ? proposed.data.expense : null;
  const previousExpense = previous.success ? previous.data.expense : null;

  if ((proposal.action === "create" || proposal.action === "edit") && !proposedExpense) {
    throw new ApprovalEngineError(409, "This expense proposal is missing its proposed details.");
  }
  if ((proposal.action === "edit" || proposal.action === "delete") && !previousExpense) {
    throw new ApprovalEngineError(409, "This expense proposal is missing the agreed expense.");
  }

  if (proposedExpense && proposedExpense.id !== proposal.entityId) {
    throw new ApprovalEngineError(409, "This expense proposal points to the wrong expense.");
  }
  if (previousExpense && previousExpense.id !== proposal.entityId) {
    throw new ApprovalEngineError(409, "This expense proposal points to the wrong agreed expense.");
  }

  const existing = await getDb()
    .select({ id: expenses.id })
    .from(expenses)
    .where(and(eq(expenses.calendarId, input.calendarId), eq(expenses.id, proposal.entityId)))
    .limit(1);

  if (proposal.action === "create" && existing[0]) {
    throw new ApprovalEngineError(409, "This expense already exists.");
  }
  if ((proposal.action === "edit" || proposal.action === "delete") && !existing[0]) {
    throw new ApprovalEngineError(
      409,
      "The agreed expense changed before this proposal could be approved.",
    );
  }

  if (proposedExpense) {
    try {
      await assertExpenseRelations(input.calendarId, proposedExpense);
    } catch (error) {
      throw new ApprovalEngineError(
        409,
        error instanceof Error ? error.message : "The expense details are no longer valid.",
      );
    }
  }

  const financialChanged =
    proposal.action === "edit" &&
    Boolean(previousExpense && proposedExpense) &&
    financialSignature(previousExpense!) !== financialSignature(proposedExpense!);
  const nextSettlementStatus = proposedExpense
    ? defaultSettlementStatus(proposedExpense)
    : "outstanding";

  const respondedAt = new Date();
  const sql = getSql();
  const marker = {
    proposalId: proposal.id,
    calendarId: input.calendarId,
    actorMembershipId: input.actor.membershipId,
    respondedAt,
  };
  const statements = [acceptanceTransitionStatement(sql, marker)];

  if (proposal.action === "create" && proposedExpense) {
    statements.push(sql`
      INSERT INTO expenses (
        id, calendar_id, child_id, expense_date, title, category, amount_cents,
        paid_by_participant_id, due_date, note, settlement_status, created_by, updated_at
      )
      SELECT
        ${proposedExpense.id},
        ${input.calendarId},
        ${proposedExpense.childId},
        ${proposedExpense.expenseDate},
        ${proposedExpense.title},
        ${proposedExpense.category},
        ${proposedExpense.amountCents},
        ${proposedExpense.paidByParticipantId},
        ${proposedExpense.dueDate},
        ${proposedExpense.note},
        ${nextSettlementStatus}::expense_settlement_status,
        ${proposal.proposedByParticipantId},
        now()
      WHERE ${markerExists(sql, marker)}
    `);
    for (const share of proposedExpense.shares) {
      statements.push(sql`
        INSERT INTO expense_shares (expense_id, participant_id, share_cents)
        SELECT ${proposedExpense.id}, ${share.participantId}, ${share.shareCents}
        WHERE ${markerExists(sql, marker)}
      `);
    }
  } else if (proposal.action === "edit" && proposedExpense) {
    statements.push(sql`
      UPDATE expenses
      SET
        child_id = ${proposedExpense.childId},
        expense_date = ${proposedExpense.expenseDate},
        title = ${proposedExpense.title},
        category = ${proposedExpense.category},
        amount_cents = ${proposedExpense.amountCents},
        paid_by_participant_id = ${proposedExpense.paidByParticipantId},
        due_date = ${proposedExpense.dueDate},
        note = ${proposedExpense.note},
        settlement_status = CASE
          WHEN ${financialChanged} THEN ${nextSettlementStatus}::expense_settlement_status
          ELSE settlement_status
        END,
        settled_at = CASE WHEN ${financialChanged} THEN NULL ELSE settled_at END,
        settled_by_participant_id = CASE
          WHEN ${financialChanged} THEN NULL
          ELSE settled_by_participant_id
        END,
        updated_at = now()
      WHERE id = ${proposal.entityId}
        AND calendar_id = ${input.calendarId}
        AND ${markerExists(sql, marker)}
    `);
    if (financialChanged) {
      statements.push(sql`
        DELETE FROM expense_shares
        WHERE expense_id = ${proposal.entityId}
          AND ${markerExists(sql, marker)}
      `);
      for (const share of proposedExpense.shares) {
        statements.push(sql`
          INSERT INTO expense_shares (expense_id, participant_id, share_cents)
          SELECT ${proposal.entityId}, ${share.participantId}, ${share.shareCents}
          WHERE ${markerExists(sql, marker)}
        `);
      }
    }
  } else {
    statements.push(sql`
      DELETE FROM expenses
      WHERE id = ${proposal.entityId}
        AND calendar_id = ${input.calendarId}
        AND ${markerExists(sql, marker)}
    `);
  }

  statements.push(
    sql`
      INSERT INTO audit_log (
        calendar_id, actor_participant_id, action, entity_type, entity_id,
        before_state, after_state
      )
      SELECT
        ${input.calendarId},
        ${input.actor.participantId},
        ${proposal.action === "create"
          ? "expense.create"
          : proposal.action === "edit"
            ? "expense.update"
            : "expense.delete"},
        'expense',
        ${proposal.entityId},
        ${JSON.stringify(proposal.previousState)}::jsonb,
        ${JSON.stringify(proposal.proposedState)}::jsonb
      WHERE ${markerExists(sql, marker)}
    `,
    acceptanceHistoryStatement(sql, {
      proposalId: proposal.id,
      calendarId: input.calendarId,
      actor: input.actor,
      respondedAt,
    }),
    acceptanceAuditStatement(sql, {
      proposalId: proposal.id,
      calendarId: input.calendarId,
      actor: input.actor,
      respondedAt,
    }),
  );

  try {
    await sql.transaction(statements);
  } catch {
    throw new ApprovalEngineError(
      409,
      "The expense changed before this proposal could be approved.",
    );
  }

  return {
    details: await verifyAccepted(input.calendarId, proposal.id),
    googleSyncQueued: false,
  };
}
