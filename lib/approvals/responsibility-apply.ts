import { and, eq } from "drizzle-orm";
import { getDb, getSql } from "@/lib/db";
import { responsibilities } from "@/lib/db/schema";
import {
  ApprovalEngineError,
  getApprovalProposal,
  getApprovalProposalDetails,
} from "@/lib/approvals/engine";
import { canRespondToProposal } from "@/lib/approvals/rules";
import type { ApprovalActor } from "@/lib/approvals/types";
import {
  assertResponsibilityRelations,
  responsibilityProposalStateSchema,
} from "@/lib/responsibilities/model";

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

export async function acceptResponsibilityApprovalProposal(input: {
  calendarId: string;
  actor: ApprovalActor;
  proposalId: string;
}) {
  const proposal = await getApprovalProposal(input.calendarId, input.proposalId);
  if (!proposal || proposal.entityType !== "responsibility") return null;

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

  const proposed = responsibilityProposalStateSchema.safeParse(proposal.proposedState);
  const previous = responsibilityProposalStateSchema.safeParse(proposal.previousState);
  const proposedResponsibility = proposed.success ? proposed.data.responsibility : null;
  const previousResponsibility = previous.success ? previous.data.responsibility : null;

  if (
    (proposal.action === "create" || proposal.action === "edit") &&
    !proposedResponsibility
  ) {
    throw new ApprovalEngineError(
      409,
      "This responsibility proposal is missing its proposed details.",
    );
  }
  if (
    (proposal.action === "edit" || proposal.action === "delete") &&
    !previousResponsibility
  ) {
    throw new ApprovalEngineError(
      409,
      "This responsibility proposal is missing the agreed responsibility.",
    );
  }

  if (proposedResponsibility && proposedResponsibility.id !== proposal.entityId) {
    throw new ApprovalEngineError(
      409,
      "This responsibility proposal points to the wrong responsibility.",
    );
  }
  if (previousResponsibility && previousResponsibility.id !== proposal.entityId) {
    throw new ApprovalEngineError(
      409,
      "This responsibility proposal points to the wrong agreed responsibility.",
    );
  }

  const existingRows = await getDb()
    .select({
      id: responsibilities.id,
      completedAt: responsibilities.completedAt,
    })
    .from(responsibilities)
    .where(
      and(
        eq(responsibilities.calendarId, input.calendarId),
        eq(responsibilities.id, proposal.entityId),
      ),
    )
    .limit(1);
  const existing = existingRows[0] ?? null;

  if (proposal.action === "create" && existing) {
    throw new ApprovalEngineError(409, "This responsibility already exists.");
  }
  if ((proposal.action === "edit" || proposal.action === "delete") && !existing) {
    throw new ApprovalEngineError(
      409,
      "The agreed responsibility changed before this proposal could be approved.",
    );
  }
  if (
    (proposal.action === "edit" || proposal.action === "delete") &&
    existing?.completedAt
  ) {
    throw new ApprovalEngineError(
      409,
      "This responsibility was completed before the proposal could be approved.",
    );
  }

  if (proposedResponsibility) {
    try {
      await assertResponsibilityRelations(input.calendarId, proposedResponsibility);
    } catch (error) {
      throw new ApprovalEngineError(
        409,
        error instanceof Error
          ? error.message
          : "The responsibility details are no longer valid.",
      );
    }
  }

  const respondedAt = new Date();
  const sql = getSql();
  const marker = {
    proposalId: proposal.id,
    calendarId: input.calendarId,
    actorMembershipId: input.actor.membershipId,
    respondedAt,
  };
  const statements = [acceptanceTransitionStatement(sql, marker)];

  if (proposal.action === "create" && proposedResponsibility) {
    statements.push(sql`
      INSERT INTO responsibilities (
        id, calendar_id, series_id, title, responsible_participant_id,
        due_date, due_time, category, note, recurrence, recurrence_end_date,
        linked_event_id, linked_expense_id, created_by, updated_at
      )
      SELECT
        ${proposedResponsibility.id},
        ${input.calendarId},
        ${proposedResponsibility.seriesId},
        ${proposedResponsibility.title},
        ${proposedResponsibility.responsibleParticipantId},
        ${proposedResponsibility.dueDate},
        ${proposedResponsibility.dueTime},
        ${proposedResponsibility.category},
        ${proposedResponsibility.note},
        ${proposedResponsibility.recurrence},
        ${proposedResponsibility.recurrenceEndDate},
        ${proposedResponsibility.linkedEventId},
        ${proposedResponsibility.linkedExpenseId},
        ${proposal.proposedByParticipantId},
        now()
      WHERE ${markerExists(sql, marker)}
    `);
    for (const childId of proposedResponsibility.childIds) {
      statements.push(sql`
        INSERT INTO responsibility_children (responsibility_id, child_id)
        SELECT ${proposedResponsibility.id}, ${childId}
        WHERE ${markerExists(sql, marker)}
      `);
    }
  } else if (proposal.action === "edit" && proposedResponsibility) {
    statements.push(
      sql`
        UPDATE responsibilities
        SET
          title = ${proposedResponsibility.title},
          responsible_participant_id = ${proposedResponsibility.responsibleParticipantId},
          due_date = ${proposedResponsibility.dueDate},
          due_time = ${proposedResponsibility.dueTime},
          category = ${proposedResponsibility.category},
          note = ${proposedResponsibility.note},
          recurrence = ${proposedResponsibility.recurrence},
          recurrence_end_date = ${proposedResponsibility.recurrenceEndDate},
          linked_event_id = ${proposedResponsibility.linkedEventId},
          linked_expense_id = ${proposedResponsibility.linkedExpenseId},
          updated_at = now()
        WHERE id = ${proposal.entityId}
          AND calendar_id = ${input.calendarId}
          AND completed_at IS NULL
          AND ${markerExists(sql, marker)}
      `,
      sql`
        DELETE FROM responsibility_children
        WHERE responsibility_id = ${proposal.entityId}
          AND ${markerExists(sql, marker)}
      `,
    );
    for (const childId of proposedResponsibility.childIds) {
      statements.push(sql`
        INSERT INTO responsibility_children (responsibility_id, child_id)
        SELECT ${proposal.entityId}, ${childId}
        WHERE ${markerExists(sql, marker)}
      `);
    }
  } else {
    statements.push(sql`
      DELETE FROM responsibilities
      WHERE id = ${proposal.entityId}
        AND calendar_id = ${input.calendarId}
        AND completed_at IS NULL
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
          ? "responsibility.create"
          : proposal.action === "edit"
            ? "responsibility.update"
            : "responsibility.delete"},
        'responsibility',
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
      "The responsibility changed before this proposal could be approved.",
    );
  }

  return {
    details: await verifyAccepted(input.calendarId, proposal.id),
    googleSyncQueued: false,
  };
}
