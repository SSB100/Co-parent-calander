import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, or } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ApprovalEngineError,
  createApprovalProposal,
  listApprovalProposals,
} from "@/lib/approvals/engine";
import { approvalActorFromSession, proposalReasonSchema, sharedApprovalTargetForSession } from "@/lib/approvals/http";
import { getDb, getSql } from "@/lib/db";
import {
  children,
  expenseShares,
  expenses,
  participants,
} from "@/lib/db/schema";
import {
  assertExpenseRelations,
  defaultSettlementStatus,
  expenseDetailsSchema,
  expenseProposalStateSchema,
  financialSignature,
  loadExpenseSnapshot,
  type ExpenseDetails,
} from "@/lib/expenses/model";
import { isSameOriginMutation } from "@/lib/security/request";
import { getCalendarSession, getEditorSession } from "@/lib/security/session";

const createSchema = expenseDetailsSchema.safeExtend({ reason: proposalReasonSchema });
const editSchema = expenseDetailsSchema.safeExtend({
  id: z.string().uuid(),
  reason: proposalReasonSchema,
});
const deleteSchema = z.object({
  id: z.string().uuid(),
  reason: proposalReasonSchema,
});
const dateQuery = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

function approvalError(error: unknown, fallback: string) {
  if (error instanceof ApprovalEngineError) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode });
  }
  const message = error instanceof Error ? error.message : fallback;
  return NextResponse.json({ error: message || fallback }, { status: 409 });
}

function proposalExpenseState(
  id: string,
  details: ExpenseDetails,
) {
  return {
    kind: "expense" as const,
    expense: { id, ...details },
  };
}

function previousProposalState(
  snapshot: NonNullable<Awaited<ReturnType<typeof loadExpenseSnapshot>>>,
) {
  return {
    kind: "expense" as const,
    expense: {
      id: snapshot.id,
      childId: snapshot.childId,
      expenseDate: snapshot.expenseDate,
      title: snapshot.title,
      category: snapshot.category,
      amountCents: snapshot.amountCents,
      paidByParticipantId: snapshot.paidByParticipantId,
      dueDate: snapshot.dueDate,
      note: snapshot.note,
      shares: snapshot.shares,
    },
  };
}

function proposalTouchesDate(proposal: { previousState: unknown; proposedState: unknown }, date: string) {
  for (const value of [proposal.proposedState, proposal.previousState]) {
    const parsed = expenseProposalStateSchema.safeParse(value);
    const expense = parsed.success ? parsed.data.expense : null;
    if (expense && (expense.expenseDate === date || expense.dueDate === date)) return true;
  }
  return false;
}

export async function GET(request: NextRequest) {
  const session = await getCalendarSession();
  if (!session) {
    return NextResponse.json({ error: "Calendar access is required." }, { status: 401 });
  }

  const rawDate = request.nextUrl.searchParams.get("date");
  const parsedDate = rawDate ? dateQuery.safeParse(rawDate) : null;
  if (rawDate && !parsedDate?.success) {
    return NextResponse.json({ error: "Choose a valid expense date." }, { status: 400 });
  }
  const date = parsedDate?.success ? parsedDate.data : null;

  const db = getDb();
  const conditions = [eq(expenses.calendarId, session.calendarId)];
  if (date) {
    conditions.push(or(eq(expenses.expenseDate, date), eq(expenses.dueDate, date))!);
  }

  const [expenseRows, parentRows, childRows, pending] = await Promise.all([
    db
      .select({
        id: expenses.id,
        childId: expenses.childId,
        expenseDate: expenses.expenseDate,
        title: expenses.title,
        category: expenses.category,
        amountCents: expenses.amountCents,
        paidByParticipantId: expenses.paidByParticipantId,
        dueDate: expenses.dueDate,
        note: expenses.note,
        settlementStatus: expenses.settlementStatus,
        settledAt: expenses.settledAt,
        settledByParticipantId: expenses.settledByParticipantId,
        createdAt: expenses.createdAt,
        updatedAt: expenses.updatedAt,
      })
      .from(expenses)
      .where(and(...conditions))
      .orderBy(desc(expenses.expenseDate), desc(expenses.createdAt))
      .limit(date ? 100 : 200),
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
    listApprovalProposals(session.calendarId, {
      status: "waiting",
      entityType: "expense",
      limit: 100,
    }),
  ]);

  const ids = expenseRows.map((row) => row.id);
  const shareRows = ids.length
    ? await db
        .select({
          expenseId: expenseShares.expenseId,
          participantId: expenseShares.participantId,
          shareCents: expenseShares.shareCents,
        })
        .from(expenseShares)
        .where(inArray(expenseShares.expenseId, ids))
        .orderBy(asc(expenseShares.createdAt))
    : [];

  const sharesByExpense = new Map<string, Array<{ participantId: string; shareCents: number }>>();
  for (const share of shareRows) {
    const current = sharesByExpense.get(share.expenseId) ?? [];
    current.push({ participantId: share.participantId, shareCents: share.shareCents });
    sharesByExpense.set(share.expenseId, current);
  }

  return NextResponse.json({
    currentParticipantId: session.participantId,
    currentMembershipId: session.membershipId,
    permission: session.permission,
    participants: parentRows,
    children: childRows,
    expenses: expenseRows.map((expense) => ({
      ...expense,
      shares: sharesByExpense.get(expense.id) ?? [],
    })),
    pendingProposals: date ? pending.filter((proposal) => proposalTouchesDate(proposal, date)) : pending,
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
      { error: parsed.error.issues[0]?.message ?? "Choose valid expense details." },
      { status: 400 },
    );
  }

  const { reason, ...details } = parsed.data;
  try {
    await assertExpenseRelations(session.calendarId, details);
  } catch (error) {
    return approvalError(error, "Choose valid parents and children for this expense.");
  }

  const id = randomUUID();
  try {
    const target = await sharedApprovalTargetForSession(session);
    if (target.required && target.approverMembershipId) {
      const result = await createApprovalProposal({
        calendarId: session.calendarId,
        actor: approvalActorFromSession(session),
        entityType: "expense",
        entityId: id,
        action: "create",
        previousState: null,
        proposedState: proposalExpenseState(id, details),
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
    return approvalError(error, "The expense proposal could not be saved.");
  }

  const settlementStatus = defaultSettlementStatus(details);
  const sql = getSql();
  try {
    await sql.transaction([
      sql`
        INSERT INTO expenses (
          id, calendar_id, child_id, expense_date, title, category, amount_cents,
          paid_by_participant_id, due_date, note, settlement_status, created_by, updated_at
        )
        VALUES (
          ${id}, ${session.calendarId}, ${details.childId}, ${details.expenseDate},
          ${details.title}, ${details.category}, ${details.amountCents},
          ${details.paidByParticipantId}, ${details.dueDate}, ${details.note},
          ${settlementStatus}, ${session.participantId}, now()
        )
      `,
      ...details.shares.map((share) => sql`
        INSERT INTO expense_shares (expense_id, participant_id, share_cents)
        VALUES (${id}, ${share.participantId}, ${share.shareCents})
      `),
      sql`
        INSERT INTO audit_log (
          calendar_id, actor_participant_id, action, entity_type, entity_id, after_state
        )
        VALUES (
          ${session.calendarId}, ${session.participantId}, 'expense.create', 'expense', ${id},
          ${JSON.stringify({ ...details, settlementStatus })}::jsonb
        )
      `,
    ]);
  } catch {
    return NextResponse.json({ error: "The expense could not be saved." }, { status: 409 });
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
      { error: parsed.error.issues[0]?.message ?? "Choose valid expense details." },
      { status: 400 },
    );
  }

  const { id, reason, ...details } = parsed.data;
  const existing = await loadExpenseSnapshot(session.calendarId, id);
  if (!existing) return NextResponse.json({ error: "Expense not found." }, { status: 404 });

  try {
    await assertExpenseRelations(session.calendarId, details);
  } catch (error) {
    return approvalError(error, "Choose valid parents and children for this expense.");
  }

  try {
    const target = await sharedApprovalTargetForSession(session);
    if (target.required && target.approverMembershipId) {
      const result = await createApprovalProposal({
        calendarId: session.calendarId,
        actor: approvalActorFromSession(session),
        entityType: "expense",
        entityId: id,
        action: "edit",
        previousState: previousProposalState(existing),
        proposedState: proposalExpenseState(id, details),
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
    return approvalError(error, "The expense proposal could not be saved.");
  }

  const financialChanged = financialSignature(existing) !== financialSignature(details);
  const nextSettlementStatus = defaultSettlementStatus(details);
  const sql = getSql();
  try {
    await sql.transaction([
      sql`
        UPDATE expenses
        SET
          child_id = ${details.childId},
          expense_date = ${details.expenseDate},
          title = ${details.title},
          category = ${details.category},
          amount_cents = ${details.amountCents},
          paid_by_participant_id = ${details.paidByParticipantId},
          due_date = ${details.dueDate},
          note = ${details.note},
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
        WHERE id = ${id} AND calendar_id = ${session.calendarId}
      `,
      sql`DELETE FROM expense_shares WHERE expense_id = ${id}`,
      ...details.shares.map((share) => sql`
        INSERT INTO expense_shares (expense_id, participant_id, share_cents)
        VALUES (${id}, ${share.participantId}, ${share.shareCents})
      `),
      sql`
        INSERT INTO audit_log (
          calendar_id, actor_participant_id, action, entity_type, entity_id,
          before_state, after_state
        )
        VALUES (
          ${session.calendarId}, ${session.participantId}, 'expense.update', 'expense', ${id},
          ${JSON.stringify(existing)}::jsonb,
          ${JSON.stringify({
            ...details,
            settlementStatus: financialChanged ? nextSettlementStatus : existing.settlementStatus,
          })}::jsonb
        )
      `,
    ]);
  } catch {
    return NextResponse.json({ error: "The expense could not be updated." }, { status: 409 });
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
    return NextResponse.json({ error: "Choose a valid expense." }, { status: 400 });
  }

  const existing = await loadExpenseSnapshot(session.calendarId, parsed.data.id);
  if (!existing) return NextResponse.json({ error: "Expense not found." }, { status: 404 });

  try {
    const target = await sharedApprovalTargetForSession(session);
    if (target.required && target.approverMembershipId) {
      const result = await createApprovalProposal({
        calendarId: session.calendarId,
        actor: approvalActorFromSession(session),
        entityType: "expense",
        entityId: existing.id,
        action: "delete",
        previousState: previousProposalState(existing),
        proposedState: { kind: "expense", expense: null },
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
    return approvalError(error, "The expense proposal could not be saved.");
  }

  const sql = getSql();
  try {
    await sql.transaction([
      sql`DELETE FROM expenses WHERE id = ${existing.id} AND calendar_id = ${session.calendarId}`,
      sql`
        INSERT INTO audit_log (
          calendar_id, actor_participant_id, action, entity_type, entity_id, before_state
        )
        VALUES (
          ${session.calendarId}, ${session.participantId}, 'expense.delete', 'expense',
          ${existing.id}, ${JSON.stringify(existing)}::jsonb
        )
      `,
    ]);
  } catch {
    return NextResponse.json({ error: "The expense could not be deleted." }, { status: 409 });
  }

  return NextResponse.json({ ok: true, pending: false });
}
