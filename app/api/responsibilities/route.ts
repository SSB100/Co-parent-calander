import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ApprovalEngineError,
  createApprovalProposal,
  listApprovalProposals,
} from "@/lib/approvals/engine";
import { getSharedApprovalTarget } from "@/lib/approvals/shared";
import { getDb, getSql } from "@/lib/db";
import {
  children,
  events,
  expenses,
  participants,
  responsibilities,
  responsibilityChildren,
} from "@/lib/db/schema";
import {
  assertResponsibilityRelations,
  loadResponsibilitySnapshot,
  needsResponsibilityApproval,
  responsibilityDetailsSchema,
  responsibilityProposalStateSchema,
  responsibilityStatus,
  type ResponsibilityDetails,
} from "@/lib/responsibilities/model";
import { isSameOriginMutation } from "@/lib/security/request";
import { getCalendarSession, getEditorSession } from "@/lib/security/session";

const proposalReason = z
  .string()
  .trim()
  .max(500, "Keep the reason under 500 characters.")
  .nullable()
  .optional()
  .transform((value) => (value ? value : null));

const createSchema = responsibilityDetailsSchema.safeExtend({ reason: proposalReason });
const editSchema = responsibilityDetailsSchema.safeExtend({
  id: z.string().uuid(),
  reason: proposalReason,
});
const deleteSchema = z.object({
  id: z.string().uuid(),
  reason: proposalReason,
});
const dateQuery = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

function todayInAuckland() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Pacific/Auckland",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function approvalActor(session: {
  membershipId: string;
  participantId: string;
  permission: "owner" | "editor" | "viewer";
}) {
  return {
    membershipId: session.membershipId,
    participantId: session.participantId,
    permission: session.permission,
  } as const;
}

function approvalError(error: unknown, fallback: string) {
  if (error instanceof ApprovalEngineError) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode });
  }
  return NextResponse.json(
    { error: error instanceof Error ? error.message : fallback },
    { status: 409 },
  );
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
    if (parsed.success && parsed.data.responsibility?.dueDate === date) return true;
  }
  return false;
}

async function approvalTarget(session: {
  calendarId: string;
  membershipId: string;
  participantId: string;
}) {
  return getSharedApprovalTarget({
    calendarId: session.calendarId,
    actorMembershipId: session.membershipId,
    actorParticipantId: session.participantId,
  });
}

export async function GET(request: NextRequest) {
  const session = await getCalendarSession();
  if (!session) {
    return NextResponse.json({ error: "Calendar access is required." }, { status: 401 });
  }

  const rawDate = request.nextUrl.searchParams.get("date");
  const parsedDate = rawDate ? dateQuery.safeParse(rawDate) : null;
  if (rawDate && !parsedDate?.success) {
    return NextResponse.json({ error: "Choose a valid responsibility date." }, { status: 400 });
  }
  const date = parsedDate?.success ? parsedDate.data : null;
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
      .orderBy(asc(responsibilities.completedAt), asc(responsibilities.dueDate), asc(responsibilities.dueTime))
      .limit(date ? 100 : 300),
    db
      .select({
        id: participants.id,
        displayName: participants.displayName,
        colorKey: participants.colorKey,
      })
      .from(participants)
      .where(and(eq(participants.calendarId, session.calendarId), eq(participants.active, true)))
      .orderBy(asc(participants.createdAt)),
    db
      .select({ id: children.id, displayName: children.displayName })
      .from(children)
      .where(and(eq(children.calendarId, session.calendarId), eq(children.active, true)))
      .orderBy(asc(children.createdAt)),
    db
      .select({ id: events.id, title: events.title, startDate: events.startDate })
      .from(events)
      .where(eq(events.calendarId, session.calendarId))
      .orderBy(desc(events.startDate))
      .limit(100),
    db
      .select({ id: expenses.id, title: expenses.title, expenseDate: expenses.expenseDate })
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

  const today = todayInAuckland();
  return NextResponse.json({
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
      ? pendingProposals.filter((proposal) => proposalTouchesDate(proposal, date))
      : pendingProposals,
  });
}

export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ error: "This request was blocked for safety." }, { status: 403 });
  }
  const session = await getEditorSession();
  if (!session) {
    return NextResponse.json({ error: "Editor access is required." }, { status: 401 });
  }

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Choose valid responsibility details." },
      { status: 400 },
    );
  }

  const { reason, ...details } = parsed.data;
  try {
    await assertResponsibilityRelations(session.calendarId, details);
  } catch (error) {
    return approvalError(error, "Choose valid responsibility details.");
  }

  const id = randomUUID();
  const seriesId = id;
  try {
    const target = await approvalTarget(session);
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
        actor: approvalActor(session),
        entityType: "responsibility",
        entityId: id,
        action: "create",
        previousState: null,
        proposedState: proposalState(id, seriesId, details),
        reason,
        approverMembershipId: target.approverMembershipId,
      });
      return NextResponse.json(
        {
          ok: true,
          pending: true,
          proposalId: result?.proposal.id ?? null,
          approverName: result?.proposal.approverName ?? target.approverName,
        },
        { status: 202 },
      );
    }
  } catch (error) {
    return approvalError(error, "The responsibility proposal could not be saved.");
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
          ${details.responsibleParticipantId}, ${details.dueDate}, ${details.dueTime},
          ${details.category}, ${details.note}, ${details.recurrence},
          ${details.recurrenceEndDate}, ${details.linkedEventId},
          ${details.linkedExpenseId}, ${session.participantId}, now()
        )
      `,
      ...details.childIds.map((childId) => sql`
        INSERT INTO responsibility_children (responsibility_id, child_id)
        VALUES (${id}, ${childId})
      `),
      sql`
        INSERT INTO audit_log (
          calendar_id, actor_participant_id, action, entity_type, entity_id, after_state
        )
        VALUES (
          ${session.calendarId}, ${session.participantId}, 'responsibility.create',
          'responsibility', ${id}, ${JSON.stringify({ id, seriesId, ...details })}::jsonb
        )
      `,
    ]);
  } catch {
    return NextResponse.json(
      { error: "The responsibility could not be saved." },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true, pending: false, id });
}

export async function PATCH(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ error: "This request was blocked for safety." }, { status: 403 });
  }
  const session = await getEditorSession();
  if (!session) {
    return NextResponse.json({ error: "Editor access is required." }, { status: 401 });
  }

  const parsed = editSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Choose valid responsibility details." },
      { status: 400 },
    );
  }

  const { id, reason, ...details } = parsed.data;
  const existing = await loadResponsibilitySnapshot(session.calendarId, id);
  if (!existing) {
    return NextResponse.json({ error: "Responsibility not found." }, { status: 404 });
  }
  if (existing.completedAt) {
    return NextResponse.json(
      { error: "Completed responsibilities stay in history and cannot be edited." },
      { status: 409 },
    );
  }

  try {
    await assertResponsibilityRelations(session.calendarId, details);
  } catch (error) {
    return approvalError(error, "Choose valid responsibility details.");
  }

  try {
    const target = await approvalTarget(session);
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
        actor: approvalActor(session),
        entityType: "responsibility",
        entityId: id,
        action: "edit",
        previousState: previousProposalState(existing),
        proposedState: proposalState(id, existing.seriesId, details),
        reason,
        approverMembershipId: target.approverMembershipId,
      });
      return NextResponse.json(
        {
          ok: true,
          pending: true,
          proposalId: result?.proposal.id ?? null,
          approverName: result?.proposal.approverName ?? target.approverName,
        },
        { status: 202 },
      );
    }
  } catch (error) {
    return approvalError(error, "The responsibility proposal could not be saved.");
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
      sql`DELETE FROM responsibility_children WHERE responsibility_id = ${id}`,
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
          ${session.calendarId}, ${session.participantId}, 'responsibility.update',
          'responsibility', ${id}, ${JSON.stringify(existing)}::jsonb,
          ${JSON.stringify({ id, seriesId: existing.seriesId, ...details })}::jsonb
        )
      `,
    ]);
  } catch {
    return NextResponse.json(
      { error: "The responsibility could not be updated." },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true, pending: false, id });
}

export async function DELETE(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ error: "This request was blocked for safety." }, { status: 403 });
  }
  const session = await getEditorSession();
  if (!session) {
    return NextResponse.json({ error: "Editor access is required." }, { status: 401 });
  }

  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Choose a valid responsibility." }, { status: 400 });
  }

  const existing = await loadResponsibilitySnapshot(session.calendarId, parsed.data.id);
  if (!existing) {
    return NextResponse.json({ error: "Responsibility not found." }, { status: 404 });
  }
  if (existing.completedAt) {
    return NextResponse.json(
      { error: "Completed responsibilities stay in history and cannot be removed." },
      { status: 409 },
    );
  }

  try {
    const target = await approvalTarget(session);
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
        actor: approvalActor(session),
        entityType: "responsibility",
        entityId: existing.id,
        action: "delete",
        previousState: previousProposalState(existing),
        proposedState: { kind: "responsibility", responsibility: null },
        reason: parsed.data.reason,
        approverMembershipId: target.approverMembershipId,
      });
      return NextResponse.json(
        {
          ok: true,
          pending: true,
          proposalId: result?.proposal.id ?? null,
          approverName: result?.proposal.approverName ?? target.approverName,
        },
        { status: 202 },
      );
    }
  } catch (error) {
    return approvalError(error, "The responsibility proposal could not be saved.");
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
          calendar_id, actor_participant_id, action, entity_type, entity_id, before_state
        )
        VALUES (
          ${session.calendarId}, ${session.participantId}, 'responsibility.delete',
          'responsibility', ${existing.id}, ${JSON.stringify(existing)}::jsonb
        )
      `,
    ]);
  } catch {
    return NextResponse.json(
      { error: "The responsibility could not be removed." },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true, pending: false });
}
