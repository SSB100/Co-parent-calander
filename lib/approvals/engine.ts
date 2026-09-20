import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getDb, getSql } from "@/lib/db";
import {
  approvalProposalHistory,
  approvalProposals,
  calendarMemberships,
  participants,
} from "@/lib/db/schema";
import {
  canCreateProposal,
  canRespondToProposal,
  canSubmitProposal,
  canUseApprover,
  canWithdrawProposal,
} from "@/lib/approvals/rules";
import type {
  ApprovalActor,
  ProposalAction,
  ProposalStatus,
} from "@/lib/approvals/types";

export class ApprovalEngineError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "ApprovalEngineError";
  }
}

type CreateApprovalProposalInput = {
  calendarId: string;
  actor: ApprovalActor;
  entityType: string;
  entityId: string;
  action: ProposalAction;
  previousState: unknown | null;
  proposedState: unknown | null;
  reason?: string | null;
  approverMembershipId?: string | null;
  saveAsDraft?: boolean;
};

type ProposalFilters = {
  status?: ProposalStatus;
  entityType?: string;
  entityId?: string;
  limit?: number;
};

function jsonValue(value: unknown | null) {
  return value === null ? null : JSON.stringify(value);
}

function asPolicyRecord(proposal: {
  status: ProposalStatus;
  proposedByMembershipId: string;
  proposedByParticipantId: string | null;
  approverMembershipId: string | null;
}) {
  return {
    status: proposal.status,
    proposedByMembershipId: proposal.proposedByMembershipId,
    proposedByParticipantId: proposal.proposedByParticipantId,
    approverMembershipId: proposal.approverMembershipId,
  };
}

async function loadParticipantNames(calendarId: string, participantIds: Array<string | null>) {
  const ids = [...new Set(participantIds.filter((value): value is string => Boolean(value)))];
  if (ids.length === 0) return new Map<string, string>();

  const rows = await getDb()
    .select({ id: participants.id, displayName: participants.displayName })
    .from(participants)
    .where(and(eq(participants.calendarId, calendarId), inArray(participants.id, ids)));

  return new Map(rows.map((row) => [row.id, row.displayName]));
}

async function decorateProposals<T extends {
  proposedByParticipantId: string | null;
  approverParticipantId: string | null;
}>(calendarId: string, rows: T[]) {
  const names = await loadParticipantNames(
    calendarId,
    rows.flatMap((row) => [row.proposedByParticipantId, row.approverParticipantId]),
  );
  return rows.map((row) => ({
    ...row,
    proposedByName: row.proposedByParticipantId
      ? names.get(row.proposedByParticipantId) ?? "Parent"
      : "Parent",
    approverName: row.approverParticipantId
      ? names.get(row.approverParticipantId) ?? "Other parent"
      : null,
  }));
}

export async function listApprovalProposals(
  calendarId: string,
  filters: ProposalFilters = {},
) {
  const conditions = [eq(approvalProposals.calendarId, calendarId)];
  if (filters.status) conditions.push(eq(approvalProposals.status, filters.status));
  if (filters.entityType) conditions.push(eq(approvalProposals.entityType, filters.entityType));
  if (filters.entityId) conditions.push(eq(approvalProposals.entityId, filters.entityId));

  const rows = await getDb()
    .select()
    .from(approvalProposals)
    .where(and(...conditions))
    .orderBy(desc(approvalProposals.updatedAt))
    .limit(Math.max(1, Math.min(filters.limit ?? 50, 100)));

  return decorateProposals(calendarId, rows);
}

export async function getApprovalProposal(
  calendarId: string,
  proposalId: string,
) {
  const rows = await getDb()
    .select()
    .from(approvalProposals)
    .where(
      and(
        eq(approvalProposals.id, proposalId),
        eq(approvalProposals.calendarId, calendarId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function getApprovalProposalDetails(
  calendarId: string,
  proposalId: string,
) {
  const proposal = await getApprovalProposal(calendarId, proposalId);
  if (!proposal) return null;

  const history = await getDb()
    .select()
    .from(approvalProposalHistory)
    .where(
      and(
        eq(approvalProposalHistory.calendarId, calendarId),
        eq(approvalProposalHistory.proposalId, proposalId),
      ),
    )
    .orderBy(asc(approvalProposalHistory.occurredAt));

  const names = await loadParticipantNames(
    calendarId,
    [
      proposal.proposedByParticipantId,
      proposal.approverParticipantId,
      ...history.map((item) => item.actorParticipantId),
    ],
  );

  return {
    proposal: {
      ...proposal,
      proposedByName: proposal.proposedByParticipantId
        ? names.get(proposal.proposedByParticipantId) ?? "Parent"
        : "Parent",
      approverName: proposal.approverParticipantId
        ? names.get(proposal.approverParticipantId) ?? "Other parent"
        : null,
    },
    history: history.map((item) => ({
      ...item,
      actorName: item.actorParticipantId
        ? names.get(item.actorParticipantId) ?? "Parent"
        : "System",
    })),
  };
}

async function resolveApprover(input: {
  calendarId: string;
  proposer: ApprovalActor;
  requestedMembershipId?: string | null;
}) {
  const rows = await getDb()
    .select({
      membershipId: calendarMemberships.id,
      participantId: calendarMemberships.participantId,
      permission: calendarMemberships.permission,
      displayName: participants.displayName,
    })
    .from(calendarMemberships)
    .leftJoin(participants, eq(calendarMemberships.participantId, participants.id))
    .where(eq(calendarMemberships.calendarId, input.calendarId));

  const candidates = rows
    .filter(
      (row) =>
        row.membershipId !== input.proposer.membershipId &&
        row.permission !== "viewer" &&
        Boolean(row.participantId),
    )
    .map((row) => ({
      membershipId: row.membershipId,
      participantId: row.participantId,
      permission: row.permission,
      displayName: row.displayName,
    }));

  const selected = input.requestedMembershipId
    ? candidates.find((candidate) => candidate.membershipId === input.requestedMembershipId)
    : candidates.length === 1
      ? candidates[0]
      : null;

  if (!selected?.participantId) {
    if (candidates.length === 0) {
      throw new ApprovalEngineError(
        409,
        "The other parent needs edit access before this change can be sent for approval.",
      );
    }
    throw new ApprovalEngineError(400, "Choose which parent should approve this change.");
  }

  const approver: ApprovalActor = {
    membershipId: selected.membershipId,
    participantId: selected.participantId,
    permission: selected.permission,
  };

  if (!canUseApprover(input.proposer, approver)) {
    throw new ApprovalEngineError(403, "You cannot approve your own proposal.");
  }

  return {
    ...approver,
    displayName: selected.displayName ?? "Other parent",
  };
}

async function assertNoWaitingConflict(input: {
  calendarId: string;
  entityType: string;
  entityId: string;
  excludeProposalId?: string;
}) {
  const rows = await getDb()
    .select({ id: approvalProposals.id })
    .from(approvalProposals)
    .where(
      and(
        eq(approvalProposals.calendarId, input.calendarId),
        eq(approvalProposals.entityType, input.entityType),
        eq(approvalProposals.entityId, input.entityId),
        eq(approvalProposals.status, "waiting"),
      ),
    )
    .limit(1);

  if (rows[0] && rows[0].id !== input.excludeProposalId) {
    throw new ApprovalEngineError(
      409,
      "A change for this item is already waiting for approval.",
    );
  }
}

export async function createApprovalProposal(input: CreateApprovalProposalInput) {
  if (!canCreateProposal(input.actor)) {
    throw new ApprovalEngineError(403, "Edit access is required to propose a shared change.");
  }

  const status: ProposalStatus = input.saveAsDraft ? "draft" : "waiting";
  const approver =
    status === "waiting" || input.approverMembershipId
      ? await resolveApprover({
          calendarId: input.calendarId,
          proposer: input.actor,
          requestedMembershipId: input.approverMembershipId,
        })
      : null;

  if (status === "waiting") {
    await assertNoWaitingConflict({
      calendarId: input.calendarId,
      entityType: input.entityType,
      entityId: input.entityId,
    });
  }

  const id = randomUUID();
  const sql = getSql();
  const previousState = jsonValue(input.previousState);
  const proposedState = jsonValue(input.proposedState);
  const details = JSON.stringify({
    entityType: input.entityType,
    entityId: input.entityId,
    action: input.action,
  });
  const eventType = status === "draft" ? "proposal.draft_created" : "proposal.submitted";
  const auditAction = status === "draft" ? "proposal.create_draft" : "proposal.submit";

  try {
    await sql.transaction([
      sql`
        INSERT INTO approval_proposals (
          id,
          calendar_id,
          entity_type,
          entity_id,
          action,
          proposed_by_membership_id,
          proposed_by_participant_id,
          approver_membership_id,
          approver_participant_id,
          reason,
          previous_state,
          proposed_state,
          status,
          submitted_at,
          created_at,
          updated_at
        )
        VALUES (
          ${id},
          ${input.calendarId},
          ${input.entityType},
          ${input.entityId},
          ${input.action},
          ${input.actor.membershipId},
          ${input.actor.participantId},
          ${approver?.membershipId ?? null},
          ${approver?.participantId ?? null},
          ${input.reason ?? null},
          ${previousState}::jsonb,
          ${proposedState}::jsonb,
          ${status},
          ${status === "waiting" ? new Date() : null},
          now(),
          now()
        )
      `,
      sql`
        INSERT INTO approval_proposal_history (
          proposal_id,
          calendar_id,
          actor_membership_id,
          actor_participant_id,
          event_type,
          from_status,
          to_status,
          details
        )
        VALUES (
          ${id},
          ${input.calendarId},
          ${input.actor.membershipId},
          ${input.actor.participantId},
          ${eventType},
          NULL,
          ${status},
          ${details}::jsonb
        )
      `,
      sql`
        INSERT INTO audit_log (
          calendar_id,
          actor_participant_id,
          action,
          entity_type,
          entity_id,
          after_state
        )
        VALUES (
          ${input.calendarId},
          ${input.actor.participantId},
          ${auditAction},
          'proposal',
          ${id},
          ${JSON.stringify({
            status,
            targetEntityType: input.entityType,
            targetEntityId: input.entityId,
            action: input.action,
          })}::jsonb
        )
      `,
    ]);
  } catch {
    if (status === "waiting") {
      throw new ApprovalEngineError(
        409,
        "A change for this item is already waiting for approval.",
      );
    }
    throw new ApprovalEngineError(409, "That proposal could not be saved.");
  }

  return getApprovalProposalDetails(input.calendarId, id);
}

export async function submitApprovalProposal(input: {
  calendarId: string;
  actor: ApprovalActor;
  proposalId: string;
  approverMembershipId?: string | null;
}) {
  const proposal = await getApprovalProposal(input.calendarId, input.proposalId);
  if (!proposal) throw new ApprovalEngineError(404, "Proposal not found.");
  if (!canSubmitProposal(input.actor, asPolicyRecord(proposal))) {
    throw new ApprovalEngineError(403, "Only the parent who created this draft can send it.");
  }

  const approver = await resolveApprover({
    calendarId: input.calendarId,
    proposer: input.actor,
    requestedMembershipId: input.approverMembershipId ?? proposal.approverMembershipId,
  });
  await assertNoWaitingConflict({
    calendarId: input.calendarId,
    entityType: proposal.entityType,
    entityId: proposal.entityId,
    excludeProposalId: proposal.id,
  });

  const sql = getSql();
  try {
    const rows = (await sql`
      WITH transitioned AS (
        UPDATE approval_proposals
        SET
          status = 'waiting',
          approver_membership_id = ${approver.membershipId},
          approver_participant_id = ${approver.participantId},
          submitted_at = now(),
          updated_at = now()
        WHERE id = ${proposal.id}
          AND calendar_id = ${input.calendarId}
          AND status = 'draft'
          AND proposed_by_membership_id = ${input.actor.membershipId}
        RETURNING *
      ),
      history_insert AS (
        INSERT INTO approval_proposal_history (
          proposal_id,
          calendar_id,
          actor_membership_id,
          actor_participant_id,
          event_type,
          from_status,
          to_status,
          details
        )
        SELECT
          id,
          calendar_id,
          ${input.actor.membershipId},
          ${input.actor.participantId},
          'proposal.submitted',
          'draft',
          'waiting',
          jsonb_build_object('approverMembershipId', ${approver.membershipId})
        FROM transitioned
        RETURNING id
      ),
      audit_insert AS (
        INSERT INTO audit_log (
          calendar_id,
          actor_participant_id,
          action,
          entity_type,
          entity_id,
          before_state,
          after_state
        )
        SELECT
          calendar_id,
          ${input.actor.participantId},
          'proposal.submit',
          'proposal',
          id,
          jsonb_build_object('status', 'draft'),
          jsonb_build_object(
            'status', 'waiting',
            'targetEntityType', entity_type,
            'targetEntityId', entity_id
          )
        FROM transitioned
        RETURNING id
      )
      SELECT id FROM transitioned
    `) as Array<{ id: string }>;

    if (rows.length === 0) {
      throw new ApprovalEngineError(409, "This draft changed before it could be sent.");
    }
  } catch (error) {
    if (error instanceof ApprovalEngineError) throw error;
    throw new ApprovalEngineError(
      409,
      "A change for this item is already waiting for approval.",
    );
  }

  return getApprovalProposalDetails(input.calendarId, input.proposalId);
}

export async function acceptApprovalProposal(input: {
  calendarId: string;
  actor: ApprovalActor;
  proposalId: string;
}) {
  const proposal = await getApprovalProposal(input.calendarId, input.proposalId);
  if (!proposal) throw new ApprovalEngineError(404, "Proposal not found.");
  if (!canRespondToProposal(input.actor, asPolicyRecord(proposal))) {
    throw new ApprovalEngineError(403, "Only the parent this was sent to can approve it.");
  }

  const declineReason = input.declineReason ?? null;
  const sql = getSql();
  const rows = (await sql`
    WITH transitioned AS (
      UPDATE approval_proposals
      SET status = 'approved', responded_at = now(), updated_at = now()
      WHERE id = ${proposal.id}
        AND calendar_id = ${input.calendarId}
        AND status = 'waiting'
        AND approver_membership_id = ${input.actor.membershipId}
      RETURNING *
    ),
    history_insert AS (
      INSERT INTO approval_proposal_history (
        proposal_id,
        calendar_id,
        actor_membership_id,
        actor_participant_id,
        event_type,
        from_status,
        to_status,
        details
      )
      SELECT
        id,
        calendar_id,
        ${input.actor.membershipId},
        ${input.actor.participantId},
        'proposal.approved',
        'waiting',
        'approved',
        NULL
      FROM transitioned
      RETURNING id
    ),
    audit_insert AS (
      INSERT INTO audit_log (
        calendar_id,
        actor_participant_id,
        action,
        entity_type,
        entity_id,
        before_state,
        after_state
      )
      SELECT
        calendar_id,
        ${input.actor.participantId},
        'proposal.accept',
        'proposal',
        id,
        jsonb_build_object('status', 'waiting'),
        jsonb_build_object(
          'status', 'approved',
          'targetEntityType', entity_type,
          'targetEntityId', entity_id
        )
      FROM transitioned
      RETURNING id
    )
    SELECT id FROM transitioned
  `) as Array<{ id: string }>;

  if (rows.length === 0) {
    throw new ApprovalEngineError(409, "This proposal is no longer waiting for approval.");
  }

  return getApprovalProposalDetails(input.calendarId, input.proposalId);
}

export async function declineApprovalProposal(input: {
  calendarId: string;
  actor: ApprovalActor;
  proposalId: string;
  declineReason?: string | null;
}) {
  const proposal = await getApprovalProposal(input.calendarId, input.proposalId);
  if (!proposal) throw new ApprovalEngineError(404, "Proposal not found.");
  if (!canRespondToProposal(input.actor, asPolicyRecord(proposal))) {
    throw new ApprovalEngineError(403, "Only the parent this was sent to can decline it.");
  }

  const sql = getSql();
  const rows = (await sql`
    WITH transitioned AS (
      UPDATE approval_proposals
      SET
        status = 'declined',
        decline_reason = ${declineReason}::text,
        responded_at = now(),
        updated_at = now()
      WHERE id = ${proposal.id}
        AND calendar_id = ${input.calendarId}
        AND status = 'waiting'
        AND approver_membership_id = ${input.actor.membershipId}
      RETURNING *
    ),
    history_insert AS (
      INSERT INTO approval_proposal_history (
        proposal_id,
        calendar_id,
        actor_membership_id,
        actor_participant_id,
        event_type,
        from_status,
        to_status,
        details
      )
      SELECT
        id,
        calendar_id,
        ${input.actor.membershipId},
        ${input.actor.participantId},
        'proposal.declined',
        'waiting',
        'declined',
        jsonb_build_object('declineReason', ${declineReason}::text)
      FROM transitioned
      RETURNING id
    ),
    audit_insert AS (
      INSERT INTO audit_log (
        calendar_id,
        actor_participant_id,
        action,
        entity_type,
        entity_id,
        before_state,
        after_state
      )
      SELECT
        calendar_id,
        ${input.actor.participantId},
        'proposal.decline',
        'proposal',
        id,
        jsonb_build_object('status', 'waiting'),
        jsonb_build_object(
          'status', 'declined',
          'targetEntityType', entity_type,
          'targetEntityId', entity_id,
          'declineReason', ${declineReason}::text
        )
      FROM transitioned
      RETURNING id
    )
    SELECT id FROM transitioned
  `) as Array<{ id: string }>;

  if (rows.length === 0) {
    throw new ApprovalEngineError(409, "This proposal is no longer waiting for approval.");
  }

  return getApprovalProposalDetails(input.calendarId, input.proposalId);
}

export async function withdrawApprovalProposal(input: {
  calendarId: string;
  actor: ApprovalActor;
  proposalId: string;
}) {
  const proposal = await getApprovalProposal(input.calendarId, input.proposalId);
  if (!proposal) throw new ApprovalEngineError(404, "Proposal not found.");
  if (!canWithdrawProposal(input.actor, asPolicyRecord(proposal))) {
    throw new ApprovalEngineError(403, "Only the parent who proposed this change can withdraw it.");
  }

  const fromStatus = proposal.status;
  const actorParticipantId = input.actor.participantId ?? proposal.proposedByParticipantId;
  const transitionedAt = new Date();
  const sql = getSql();

  try {
    await sql.transaction([
      sql`
        UPDATE approval_proposals
        SET
          status = 'withdrawn',
          withdrawn_at = ${transitionedAt}::timestamptz,
          updated_at = ${transitionedAt}::timestamptz
        WHERE id = ${proposal.id}
          AND calendar_id = ${input.calendarId}
          AND (
            proposed_by_membership_id = ${input.actor.membershipId}
            OR (
              ${input.actor.participantId}::uuid IS NOT NULL
              AND proposed_by_participant_id = ${input.actor.participantId}
            )
          )
          AND status IN ('draft', 'waiting')
      `,
      sql`
        INSERT INTO approval_proposal_history (
          proposal_id,
          calendar_id,
          actor_membership_id,
          actor_participant_id,
          event_type,
          from_status,
          to_status,
          details
        )
        SELECT
          id,
          calendar_id,
          ${input.actor.membershipId}::uuid,
          ${actorParticipantId}::uuid,
          'proposal.withdrawn',
          ${fromStatus}::proposal_status,
          'withdrawn',
          NULL
        FROM approval_proposals
        WHERE id = ${proposal.id}
          AND calendar_id = ${input.calendarId}
          AND status = 'withdrawn'
          AND withdrawn_at = ${transitionedAt}::timestamptz
      `,
      sql`
        INSERT INTO audit_log (
          calendar_id,
          actor_participant_id,
          action,
          entity_type,
          entity_id,
          before_state,
          after_state
        )
        SELECT
          calendar_id,
          ${actorParticipantId}::uuid,
          'proposal.withdraw',
          'proposal',
          id,
          jsonb_build_object('status', ${fromStatus}::text),
          jsonb_build_object(
            'status', 'withdrawn',
            'targetEntityType', entity_type,
            'targetEntityId', entity_id
          )
        FROM approval_proposals
        WHERE id = ${proposal.id}
          AND calendar_id = ${input.calendarId}
          AND status = 'withdrawn'
          AND withdrawn_at = ${transitionedAt}::timestamptz
      `,
    ]);
  } catch (error) {
    if (error instanceof ApprovalEngineError) throw error;
    console.error("Proposal withdrawal failed", {
      proposalId: input.proposalId,
      message: error instanceof Error ? error.message : "unknown database error",
    });
    throw new ApprovalEngineError(500, "That request could not be withdrawn. Please try again.");
  }

  const result = await getApprovalProposalDetails(input.calendarId, input.proposalId);
  if (!result || result.proposal.status !== "withdrawn") {
    throw new ApprovalEngineError(409, "This proposal can no longer be withdrawn.");
  }

  return result;
}
