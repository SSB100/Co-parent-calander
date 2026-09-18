import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import {
  ApprovalEngineError,
  createApprovalProposal,
  listApprovalProposals,
} from "@/lib/approvals/engine";
import {
  approvalActorFromSession,
  sharedApprovalTargetForSession,
} from "@/lib/approvals/http";
import type { CalendarApprovalPermission } from "@/lib/approvals/types";
import { localDateInTimeZone } from "@/lib/calendar/time";
import { getDb, getSql } from "@/lib/db";
import {
  children,
  events,
  expenses,
  participants,
  responsibilities,
  responsibilityChildren,
} from "@/lib/db/schema";
import type { ResponsibilityCompletionOperation } from "@/lib/responsibilities/contracts";
import {
  assertResponsibilityRelations,
  loadResponsibilitySnapshot,
  needsResponsibilityApproval,
  nextResponsibilityDueDate,
  responsibilityProposalStateSchema,
  responsibilityStatus,
  type ResponsibilityDetails,
} from "@/lib/responsibilities/model";

export type ResponsibilityReadSession = {
  calendarId: string;
  calendarTimezone: string;
  membershipId: string;
  participantId: string | null;
  permission: CalendarApprovalPermission;
};

export type ResponsibilityWriteSession = {
  calendarId: string;
  calendarTimezone: string;
  membershipId: string;
  participantId: string;
  permission: CalendarApprovalPermission;
};

export class ResponsibilityServiceError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "ResponsibilityServiceError";
  }
}

function serviceFailure(
  error: unknown,
  fallback: string,
  statusCode = 409,
): never {
  if (error instanceof ResponsibilityServiceError) throw error;
  if (error instanceof ApprovalEngineError) {
    throw new ResponsibilityServiceError(error.statusCode, error.message);
  }

  const message =
    error instanceof Error && error.message
      ? error.message
      : fallback;

  throw new ResponsibilityServiceError(statusCode, message);
}

function proposalState(
  id: string,
  seriesId: string,
  details: ResponsibilityDetails,
) {
  return {
    kind: "responsibility" as const,
    responsibility: {
      id,
      seriesId,
      ...details,
    },
  };
}

function previousProposalState(
  snapshot: NonNullable<Awaited<ReturnType<typeof loadResponsibilitySnapshot>>>,
) {
  return {
    kind: "responsibility" as const,
    responsibility: {
      id: snapshot.id,
      seriesId: snapshot.seriesId,
      title: snapshot.title,
      childIds: snapshot.childIds,
      responsibleParticipantId: snapshot.responsibleParticipantId,
      dueDate: snapshot.dueDate,
      dueTime: snapshot.dueTime ? snapshot.dueTime.slice(0, 5) : null,
      category: snapshot.category,
      note: snapshot.note,
      recurrence: snapshot.recurrence,
      recurrenceEndDate: snapshot.recurrenceEndDate,
      linkedEventId: snapshot.linkedEventId,
      linkedExpenseId: snapshot.linkedExpenseId,
    },
  };
}

function proposalTouchesDate(
  proposal: { previousState: unknown; proposedState: unknown },
  date: string,
) {
  for (const state of [proposal.previousState, proposal.proposedState]) {
    const parsed = responsibilityProposalStateSchema.safeParse(state);
    if (parsed.success && parsed.data.responsibility?.dueDate === date) {
      return true;
    }
  }
  return false;
}

export async function listResponsibilities(input: {
  session: ResponsibilityReadSession;
  date: string | null;
}) {
  const { session, date } = input;
  const db = getDb();
  const conditions = [eq(responsibilities.calendarId, session.calendarId)];
  if (date) conditions.push(eq(responsibilities.dueDate, date));

  const [
    responsibilityRows,
    participantRows,
    childRows,
    eventRows,
    expenseRows,
    pendingProposals,
  ] = await Promise.all([
    db
      .select({
        id: responsibilities.id,
        seriesId: responsibilities.seriesId,
        title: responsibilities.title,
        responsibleParticipantId: responsibilities.responsibleParticipantId,
        dueDate: responsibilities.dueDate,
        dueTime: responsibilities.dueTime,
        category: responsibilities.category,
        note: responsibilities.note,
        recurrence: responsibilities.recurrence,
        recurrenceEndDate: responsibilities.recurrenceEndDate,
        linkedEventId: responsibilities.linkedEventId,
        linkedExpenseId: responsibilities.linkedExpenseId,
        completedAt: responsibilities.completedAt,
        completedByParticipantId: responsibilities.completedByParticipantId,
        nextOccurrenceId: responsibilities.nextOccurrenceId,
        createdAt: responsibilities.createdAt,
        updatedAt: responsibilities.updatedAt,
      })
      .from(responsibilities)
      .where(and(...conditions))
      .orderBy(
        asc(responsibilities.completedAt),
        asc(responsibilities.dueDate),
        asc(responsibilities.dueTime),
      )
      .limit(date ? 100 : 300),
    db
      .select({
        id: participants.id,
        displayName: participants.displayName,
        colorKey: participants.colorKey,
        profileSlot: participants.profileSlot,
      })
      .from(participants)
      .where(
        and(
          eq(participants.calendarId, session.calendarId),
          eq(participants.active, true),
        ),
      )
      .orderBy(asc(participants.createdAt)),
    db
      .select({
        id: children.id,
        displayName: children.displayName,
      })
      .from(children)
      .where(
        and(
          eq(children.calendarId, session.calendarId),
          eq(children.active, true),
        ),
      )
      .orderBy(asc(children.createdAt)),
    db
      .select({
        id: events.id,
        title: events.title,
        startDate: events.startDate,
      })
      .from(events)
      .where(eq(events.calendarId, session.calendarId))
      .orderBy(desc(events.startDate))
      .limit(100),
    db
      .select({
        id: expenses.id,
        title: expenses.title,
        expenseDate: expenses.expenseDate,
      })
      .from(expenses)
      .where(eq(expenses.calendarId, session.calendarId))
      .orderBy(desc(expenses.expenseDate))
      .limit(100),
    listApprovalProposals(session.calendarId, {
      status: "waiting",
      entityType: "responsibility",
      limit: 100,
    }),
  ]);

  const ids = responsibilityRows.map((row) => row.id);
  const responsibilityChildRows = ids.length
    ? await db
        .select({
          responsibilityId: responsibilityChildren.responsibilityId,
          childId: responsibilityChildren.childId,
        })
        .from(responsibilityChildren)
        .where(inArray(responsibilityChildren.responsibilityId, ids))
        .orderBy(asc(responsibilityChildren.createdAt))
    : [];

  const childIdsByResponsibility = new Map<string, string[]>();
  for (const item of responsibilityChildRows) {
    const current = childIdsByResponsibility.get(item.responsibilityId) ?? [];
    current.push(item.childId);
    childIdsByResponsibility.set(item.responsibilityId, current);
  }

  const today = localDateInTimeZone(session.calendarTimezone);
  return {
    currentParticipantId: session.participantId,
    currentMembershipId: session.membershipId,
    permission: session.permission,
    participants: participantRows,
    children: childRows,
    events: eventRows,
    expenses: expenseRows,
    responsibilities: responsibilityRows.map((item) => ({
      ...item,
      dueTime: item.dueTime ? item.dueTime.slice(0, 5) : null,
      childIds: childIdsByResponsibility.get(item.id) ?? [],
      status: responsibilityStatus(item, today),
    })),
    pendingProposals: date
      ? pendingProposals.filter((proposal) =>
          proposalTouchesDate(proposal, date),
        )
      : pendingProposals,
  };
}

export async function createResponsibility(input: {
  session: ResponsibilityWriteSession;
  details: ResponsibilityDetails;
  reason: string | null;
}) {
  const { session, details, reason } = input;

  try {
    await assertResponsibilityRelations(session.calendarId, details);
  } catch (error) {
    serviceFailure(error, "Choose valid responsibility details.");
  }

  const id = randomUUID();
  const seriesId = id;

  try {
    const target = await sharedApprovalTargetForSession(session);
    if (
      needsResponsibilityApproval({
        sharedApprovalAvailable: target.required,
        actorParticipantId: session.participantId,
        proposedResponsibleParticipantId: details.responsibleParticipantId,
      }) &&
      target.approverMembershipId
    ) {
      const result = await createApprovalProposal({
        calendarId: session.calendarId,
        actor: approvalActorFromSession(session),
        entityType: "responsibility",
        entityId: id,
        action: "create",
        previousState: null,
        proposedState: proposalState(id, seriesId, details),
        reason,
        approverMembershipId: target.approverMembershipId,
      });

      return {
        ok: true as const,
        pending: true as const,
        proposalId: result?.proposal.id ?? null,
        approverName: result?.proposal.approverName ?? target.approverName,
      };
    }
  } catch (error) {
    serviceFailure(error, "The responsibility proposal could not be saved.");
  }

  const sql = getSql();
  try {
    await sql.transaction([
      sql`
        INSERT INTO responsibilities (
          id, calendar_id, series_id, title, responsible_participant_id,
          due_date, due_time, category, note, recurrence, recurrence_end_date,
          linked_event_id, linked_expense_id, created_by, updated_at
        )
        VALUES (
          ${id}, ${session.calendarId}, ${seriesId}, ${details.title},
          ${details.responsibleParticipantId}, ${details.dueDate},
          ${details.dueTime}, ${details.category}, ${details.note},
          ${details.recurrence}, ${details.recurrenceEndDate},
          ${details.linkedEventId}, ${details.linkedExpenseId},
          ${session.participantId}, now()
        )
      `,
      ...details.childIds.map((childId) => sql`
        INSERT INTO responsibility_children (responsibility_id, child_id)
        VALUES (${id}, ${childId})
      `),
      sql`
        INSERT INTO audit_log (
          calendar_id, actor_participant_id, action, entity_type, entity_id,
          after_state
        )
        VALUES (
          ${session.calendarId}, ${session.participantId},
          'responsibility.create', 'responsibility', ${id},
          ${JSON.stringify({ id, seriesId, ...details })}::jsonb
        )
      `,
    ]);
  } catch {
    throw new ResponsibilityServiceError(
      409,
      "The responsibility could not be saved.",
    );
  }

  return { ok: true as const, pending: false as const, id };
}

export async function updateResponsibility(input: {
  session: ResponsibilityWriteSession;
  id: string;
  details: ResponsibilityDetails;
  reason: string | null;
}) {
  const { session, id, details, reason } = input;
  const existing = await loadResponsibilitySnapshot(session.calendarId, id);

  if (!existing) {
    throw new ResponsibilityServiceError(404, "Responsibility not found.");
  }
  if (existing.completedAt) {
    throw new ResponsibilityServiceError(
      409,
      "Completed responsibilities stay in history and cannot be edited.",
    );
  }

  try {
    await assertResponsibilityRelations(session.calendarId, details);
  } catch (error) {
    serviceFailure(error, "Choose valid responsibility details.");
  }

  try {
    const target = await sharedApprovalTargetForSession(session);
    if (
      needsResponsibilityApproval({
        sharedApprovalAvailable: target.required,
        actorParticipantId: session.participantId,
        previousResponsibleParticipantId: existing.responsibleParticipantId,
        proposedResponsibleParticipantId: details.responsibleParticipantId,
      }) &&
      target.approverMembershipId
    ) {
      const result = await createApprovalProposal({
        calendarId: session.calendarId,
        actor: approvalActorFromSession(session),
        entityType: "responsibility",
        entityId: id,
        action: "edit",
        previousState: previousProposalState(existing),
        proposedState: proposalState(id, existing.seriesId, details),
        reason,
        approverMembershipId: target.approverMembershipId,
      });

      return {
        ok: true as const,
        pending: true as const,
        proposalId: result?.proposal.id ?? null,
        approverName: result?.proposal.approverName ?? target.approverName,
      };
    }
  } catch (error) {
    serviceFailure(error, "The responsibility proposal could not be saved.");
  }

  const sql = getSql();
  try {
    await sql.transaction([
      sql`
        UPDATE responsibilities
        SET
          title = ${details.title},
          responsible_participant_id = ${details.responsibleParticipantId},
          due_date = ${details.dueDate},
          due_time = ${details.dueTime},
          category = ${details.category},
          note = ${details.note},
          recurrence = ${details.recurrence},
          recurrence_end_date = ${details.recurrenceEndDate},
          linked_event_id = ${details.linkedEventId},
          linked_expense_id = ${details.linkedExpenseId},
          updated_at = now()
        WHERE id = ${id}
          AND calendar_id = ${session.calendarId}
          AND completed_at IS NULL
      `,
      sql`
        DELETE FROM responsibility_children
        WHERE responsibility_id = ${id}
      `,
      ...details.childIds.map((childId) => sql`
        INSERT INTO responsibility_children (responsibility_id, child_id)
        VALUES (${id}, ${childId})
      `),
      sql`
        INSERT INTO audit_log (
          calendar_id, actor_participant_id, action, entity_type, entity_id,
          before_state, after_state
        )
        VALUES (
          ${session.calendarId}, ${session.participantId},
          'responsibility.update', 'responsibility', ${id},
          ${JSON.stringify(existing)}::jsonb,
          ${JSON.stringify({
            id,
            seriesId: existing.seriesId,
            ...details,
          })}::jsonb
        )
      `,
    ]);
  } catch {
    throw new ResponsibilityServiceError(
      409,
      "The responsibility could not be updated.",
    );
  }

  return { ok: true as const, pending: false as const, id };
}

export async function deleteResponsibility(input: {
  session: ResponsibilityWriteSession;
  id: string;
  reason: string | null;
}) {
  const { session, id, reason } = input;
  const existing = await loadResponsibilitySnapshot(session.calendarId, id);

  if (!existing) {
    throw new ResponsibilityServiceError(404, "Responsibility not found.");
  }
  if (existing.completedAt) {
    throw new ResponsibilityServiceError(
      409,
      "Completed responsibilities stay in history and cannot be removed.",
    );
  }

  try {
    const target = await sharedApprovalTargetForSession(session);
    if (
      needsResponsibilityApproval({
        sharedApprovalAvailable: target.required,
        actorParticipantId: session.participantId,
        previousResponsibleParticipantId: existing.responsibleParticipantId,
      }) &&
      target.approverMembershipId
    ) {
      const result = await createApprovalProposal({
        calendarId: session.calendarId,
        actor: approvalActorFromSession(session),
        entityType: "responsibility",
        entityId: existing.id,
        action: "delete",
        previousState: previousProposalState(existing),
        proposedState: {
          kind: "responsibility",
          responsibility: null,
        },
        reason,
        approverMembershipId: target.approverMembershipId,
      });

      return {
        ok: true as const,
        pending: true as const,
        proposalId: result?.proposal.id ?? null,
        approverName: result?.proposal.approverName ?? target.approverName,
      };
    }
  } catch (error) {
    serviceFailure(error, "The responsibility proposal could not be saved.");
  }

  const sql = getSql();
  try {
    await sql.transaction([
      sql`
        DELETE FROM responsibilities
        WHERE id = ${existing.id}
          AND calendar_id = ${session.calendarId}
          AND completed_at IS NULL
      `,
      sql`
        INSERT INTO audit_log (
          calendar_id, actor_participant_id, action, entity_type, entity_id,
          before_state
        )
        VALUES (
          ${session.calendarId}, ${session.participantId},
          'responsibility.delete', 'responsibility', ${existing.id},
          ${JSON.stringify(existing)}::jsonb
        )
      `,
    ]);
  } catch {
    throw new ResponsibilityServiceError(
      409,
      "The responsibility could not be removed.",
    );
  }

  return { ok: true as const, pending: false as const };
}

export async function updateResponsibilityCompletion(input: {
  session: ResponsibilityWriteSession;
  id: string;
  operation: ResponsibilityCompletionOperation;
}) {
  const { session, id, operation } = input;
  const existing = await loadResponsibilitySnapshot(session.calendarId, id);

  if (!existing) {
    throw new ResponsibilityServiceError(404, "Responsibility not found.");
  }

  if (existing.responsibleParticipantId !== session.participantId) {
    throw new ResponsibilityServiceError(
      403,
      "Only the responsible parent can update completion.",
    );
  }

  if (operation === "reopen") {
    if (!existing.completedAt) {
      return { ok: true as const, completed: false as const };
    }

    if (existing.nextOccurrenceId) {
      throw new ResponsibilityServiceError(
        409,
        "This recurring responsibility has already created its next occurrence and cannot be reopened.",
      );
    }

    const sql = getSql();
    try {
      await sql.transaction([
        sql`
          UPDATE responsibilities
          SET
            completed_at = NULL,
            completed_by_participant_id = NULL,
            updated_at = now()
          WHERE id = ${existing.id}
            AND calendar_id = ${session.calendarId}
            AND completed_by_participant_id = ${session.participantId}
        `,
        sql`
          INSERT INTO audit_log (
            calendar_id, actor_participant_id, action, entity_type, entity_id,
            before_state, after_state
          )
          VALUES (
            ${session.calendarId}, ${session.participantId},
            'responsibility.reopen', 'responsibility', ${existing.id},
            ${JSON.stringify({ completedAt: existing.completedAt })}::jsonb,
            ${JSON.stringify({ completedAt: null })}::jsonb
          )
        `,
      ]);
    } catch {
      throw new ResponsibilityServiceError(
        409,
        "The responsibility could not be reopened.",
      );
    }

    return { ok: true as const, completed: false as const };
  }

  if (existing.completedAt) {
    return {
      ok: true as const,
      completed: true as const,
      nextOccurrenceId: existing.nextOccurrenceId,
    };
  }

  const nextDueDate = nextResponsibilityDueDate(
    existing.dueDate,
    existing.recurrence,
  );
  const shouldGenerateNext =
    Boolean(nextDueDate) &&
    (!existing.recurrenceEndDate ||
      nextDueDate! <= existing.recurrenceEndDate);
  const nextId = shouldGenerateNext ? randomUUID() : null;
  const completedAt = new Date();
  const sql = getSql();

  const statements = [
    sql`
      UPDATE responsibilities
      SET
        completed_at = ${completedAt},
        completed_by_participant_id = ${session.participantId},
        next_occurrence_id = ${nextId},
        updated_at = now()
      WHERE id = ${existing.id}
        AND calendar_id = ${session.calendarId}
        AND responsible_participant_id = ${session.participantId}
        AND completed_at IS NULL
    `,
  ];

  if (nextId && nextDueDate) {
    statements.push(
      sql`
        INSERT INTO responsibilities (
          id, calendar_id, series_id, title, responsible_participant_id,
          due_date, due_time, category, note, recurrence, recurrence_end_date,
          linked_event_id, linked_expense_id, created_by, updated_at
        )
        SELECT
          ${nextId},
          calendar_id,
          series_id,
          title,
          responsible_participant_id,
          ${nextDueDate},
          due_time,
          category,
          note,
          recurrence,
          recurrence_end_date,
          linked_event_id,
          linked_expense_id,
          ${session.participantId},
          now()
        FROM responsibilities
        WHERE id = ${existing.id}
          AND calendar_id = ${session.calendarId}
          AND completed_at = ${completedAt}
          AND next_occurrence_id = ${nextId}
      `,
      sql`
        INSERT INTO responsibility_children (responsibility_id, child_id)
        SELECT ${nextId}, child_id
        FROM responsibility_children
        WHERE responsibility_id = ${existing.id}
          AND EXISTS (
            SELECT 1
            FROM responsibilities next_item
            WHERE next_item.id = ${nextId}
              AND next_item.calendar_id = ${session.calendarId}
          )
      `,
    );
  }

  statements.push(
    sql`
      INSERT INTO audit_log (
        calendar_id, actor_participant_id, action, entity_type, entity_id,
        before_state, after_state
      )
      VALUES (
        ${session.calendarId}, ${session.participantId},
        'responsibility.complete', 'responsibility', ${existing.id},
        ${JSON.stringify({ completedAt: null })}::jsonb,
        ${JSON.stringify({
          completedAt,
          nextOccurrenceId: nextId,
        })}::jsonb
      )
    `,
  );

  try {
    await sql.transaction(statements);
  } catch {
    throw new ResponsibilityServiceError(
      409,
      "The responsibility could not be completed.",
    );
  }

  return {
    ok: true as const,
    completed: true as const,
    nextOccurrenceId: nextId,
  };
}
