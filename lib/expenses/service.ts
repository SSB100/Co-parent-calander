import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, or } from "drizzle-orm";
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
  expenseProposalStateSchema,
  financialSignature,
  loadExpenseSnapshot,
  type ExpenseDetails,
} from "@/lib/expenses/model";

export type ExpenseReadSession = {
  calendarId: string;
  membershipId: string;
  participantId: string | null;
  permission: CalendarApprovalPermission;
};

export type ExpenseWriteSession = {
  calendarId: string;
  membershipId: string;
  participantId: string;
  permission: CalendarApprovalPermission;
};

export class ExpenseServiceError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "ExpenseServiceError";
  }
}

function serviceFailure(
  error: unknown,
  fallback: string,
  statusCode = 409,
): never {
  if (error instanceof ExpenseServiceError) throw error;
  if (error instanceof ApprovalEngineError) {
    throw new ExpenseServiceError(error.statusCode, error.message);
  }

  const message =
    error instanceof Error && error.message
      ? error.message
      : fallback;
  throw new ExpenseServiceError(statusCode, message);
}

function proposalExpenseState(id: string, details: ExpenseDetails) {
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
      shares: snapshot.shares.map((share) => ({
        participantId: share.participantId,
        shareCents: share.shareCents,
      })),
    },
  };
}

function proposalTouchesDate(
  proposal: { previousState: unknown; proposedState: unknown },
  date: string,
) {
  for (const value of [proposal.proposedState, proposal.previousState]) {
    const parsed = expenseProposalStateSchema.safeParse(value);
    const expense = parsed.success ? parsed.data.expense : null;
    if (expense && (expense.expenseDate === date || expense.dueDate === date)) {
      return true;
    }
  }
  return false;
}

export async function listExpenses(input: {
  session: ExpenseReadSession;
  date: string | null;
}) {
  const { session, date } = input;
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
      .select({ id: children.id, displayName: children.displayName })
      .from(children)
      .where(
        and(
          eq(children.calendarId, session.calendarId),
          eq(children.active, true),
        ),
      )
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
          paidCents: expenseShares.paidCents,
          paidAt: expenseShares.paidAt,
        })
        .from(expenseShares)
        .where(inArray(expenseShares.expenseId, ids))
        .orderBy(asc(expenseShares.createdAt))
    : [];

  const sharesByExpense = new Map<
    string,
    Array<{
      participantId: string;
      shareCents: number;
      paidCents: number;
      paidAt: string | null;
    }>
  >();
  for (const share of shareRows) {
    const current = sharesByExpense.get(share.expenseId) ?? [];
    current.push({
      participantId: share.participantId,
      shareCents: share.shareCents,
      paidCents: share.paidCents,
      paidAt: share.paidAt?.toISOString() ?? null,
    });
    sharesByExpense.set(share.expenseId, current);
  }

  return {
    currentParticipantId: session.participantId,
    currentMembershipId: session.membershipId,
    permission: session.permission,
    participants: parentRows,
    children: childRows,
    expenses: expenseRows.map((expense) => ({
      ...expense,
      settledAt: expense.settledAt?.toISOString() ?? null,
      createdAt: expense.createdAt.toISOString(),
      updatedAt: expense.updatedAt.toISOString(),
      shares: sharesByExpense.get(expense.id) ?? [],
    })),
    pendingProposals: (date
      ? pending.filter((proposal) => proposalTouchesDate(proposal, date))
      : pending).map((proposal) => ({
        ...proposal,
        status: "waiting" as const,
        submittedAt: proposal.submittedAt?.toISOString() ?? null,
        respondedAt: proposal.respondedAt?.toISOString() ?? null,
        withdrawnAt: proposal.withdrawnAt?.toISOString() ?? null,
        createdAt: proposal.createdAt.toISOString(),
        updatedAt: proposal.updatedAt.toISOString(),
      })),
  };
}

export async function createExpense(input: {
  session: ExpenseWriteSession;
  details: ExpenseDetails;
  reason: string | null;
}) {
  const { session, details, reason } = input;

  try {
    await assertExpenseRelations(session.calendarId, details);
  } catch (error) {
    serviceFailure(
      error,
      "Choose valid parents and children for this expense.",
    );
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

      return {
        ok: true as const,
        pending: true as const,
        proposalId: result?.proposal.id ?? null,
        approverName: result?.proposal.approverName ?? target.approverName,
      };
    }
  } catch (error) {
    serviceFailure(error, "The expense proposal could not be saved.");
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
          ${session.calendarId},
          ${session.participantId},
          'expense.create',
          'expense',
          ${id},
          ${JSON.stringify({ ...details, settlementStatus })}::jsonb
        )
      `,
    ]);
  } catch {
    throw new ExpenseServiceError(409, "The expense could not be saved.");
  }

  return { ok: true as const, pending: false as const, id };
}

export async function updateExpense(input: {
  session: ExpenseWriteSession;
  id: string;
  details: ExpenseDetails;
  reason: string | null;
}) {
  const { session, id, details, reason } = input;
  const existing = await loadExpenseSnapshot(session.calendarId, id);
  if (!existing) throw new ExpenseServiceError(404, "Expense not found.");

  try {
    await assertExpenseRelations(session.calendarId, details);
  } catch (error) {
    serviceFailure(
      error,
      "Choose valid parents and children for this expense.",
    );
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

      return {
        ok: true as const,
        pending: true as const,
        proposalId: result?.proposal.id ?? null,
        approverName: result?.proposal.approverName ?? target.approverName,
      };
    }
  } catch (error) {
    serviceFailure(error, "The expense proposal could not be saved.");
  }

  const financialChanged =
    financialSignature(existing) !== financialSignature(details);
  const nextSettlementStatus = defaultSettlementStatus(details);
  const sql = getSql();

  try {
    const statements = [
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
        WHERE id = ${id}
          AND calendar_id = ${session.calendarId}
      `,
    ];

    if (financialChanged) {
      statements.push(sql`DELETE FROM expense_shares WHERE expense_id = ${id}`);
      for (const share of details.shares) {
        statements.push(sql`
          INSERT INTO expense_shares (expense_id, participant_id, share_cents)
          VALUES (${id}, ${share.participantId}, ${share.shareCents})
        `);
      }
    }

    statements.push(sql`
      INSERT INTO audit_log (
        calendar_id, actor_participant_id, action, entity_type, entity_id,
        before_state, after_state
      )
      VALUES (
        ${session.calendarId},
        ${session.participantId},
        'expense.update',
        'expense',
        ${id},
        ${JSON.stringify(existing)}::jsonb,
        ${JSON.stringify({
          ...details,
          settlementStatus: financialChanged
            ? nextSettlementStatus
            : existing.settlementStatus,
        })}::jsonb
      )
    `);

    await sql.transaction(statements);
  } catch {
    throw new ExpenseServiceError(409, "The expense could not be updated.");
  }

  return { ok: true as const, pending: false as const, id };
}

export async function deleteExpense(input: {
  session: ExpenseWriteSession;
  id: string;
  reason: string | null;
}) {
  const { session, id, reason } = input;
  const existing = await loadExpenseSnapshot(session.calendarId, id);
  if (!existing) throw new ExpenseServiceError(404, "Expense not found.");

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
    serviceFailure(error, "The expense proposal could not be saved.");
  }

  const sql = getSql();
  try {
    await sql.transaction([
      sql`
        DELETE FROM expenses
        WHERE id = ${existing.id}
          AND calendar_id = ${session.calendarId}
      `,
      sql`
        INSERT INTO audit_log (
          calendar_id, actor_participant_id, action, entity_type, entity_id, before_state
        )
        VALUES (
          ${session.calendarId},
          ${session.participantId},
          'expense.delete',
          'expense',
          ${existing.id},
          ${JSON.stringify(existing)}::jsonb
        )
      `,
    ]);
  } catch {
    throw new ExpenseServiceError(409, "The expense could not be deleted.");
  }

  return { ok: true as const, pending: false as const };
}

export async function updateExpenseSettlement(input: {
  session: ExpenseWriteSession;
  id: string;
  paidCents: number;
}) {
  const { session, id, paidCents } = input;
  const db = getDb();
  const [expenseRows, shareRows] = await Promise.all([
    db
      .select({
        id: expenses.id,
        settlementStatus: expenses.settlementStatus,
      })
      .from(expenses)
      .where(
        and(
          eq(expenses.id, id),
          eq(expenses.calendarId, session.calendarId),
        ),
      )
      .limit(1),
    db
      .select({
        participantId: expenseShares.participantId,
        shareCents: expenseShares.shareCents,
        paidCents: expenseShares.paidCents,
      })
      .from(expenseShares)
      .where(
        and(
          eq(expenseShares.expenseId, id),
          eq(expenseShares.participantId, session.participantId),
        ),
      )
      .limit(1),
  ]);

  const expense = expenseRows[0];
  if (!expense) throw new ExpenseServiceError(404, "Shared cost not found.");

  const share = shareRows[0];
  if (!share) {
    throw new ExpenseServiceError(
      403,
      "You can only update your own share of this shared cost.",
    );
  }
  if (share.shareCents <= 0) {
    throw new ExpenseServiceError(
      409,
      "Your share is zero, so there is no payment amount to record.",
    );
  }
  if (paidCents > share.shareCents) {
    throw new ExpenseServiceError(
      400,
      "The amount paid cannot be more than your share.",
    );
  }
  if (paidCents === share.paidCents) {
    return {
      ok: true as const,
      settlementStatus: expense.settlementStatus,
      paidCents,
      shareCents: share.shareCents,
    };
  }

  const completedAt = paidCents >= share.shareCents ? new Date() : null;
  const sql = getSql();

  try {
    await sql.transaction([
      sql`
        SELECT id
        FROM expenses
        WHERE id = ${id}::uuid
          AND calendar_id = ${session.calendarId}::uuid
        FOR UPDATE
      `,
      sql`
        UPDATE expense_shares
        SET
          paid_cents = ${paidCents}::integer,
          paid_at = ${completedAt}::timestamptz,
          updated_at = now()
        WHERE expense_id = ${id}::uuid
          AND participant_id = ${session.participantId}::uuid
      `,
      sql`
        UPDATE expenses
        SET
          settlement_status = CASE
            WHEN NOT EXISTS (
              SELECT 1
              FROM expense_shares share
              WHERE share.expense_id = ${id}::uuid
                AND share.paid_cents < share.share_cents
            ) THEN 'settled'::expense_settlement_status
            ELSE 'outstanding'::expense_settlement_status
          END,
          settled_at = CASE
            WHEN NOT EXISTS (
              SELECT 1
              FROM expense_shares share
              WHERE share.expense_id = ${id}::uuid
                AND share.paid_cents < share.share_cents
            ) THEN COALESCE(settled_at, now())
            ELSE NULL
          END,
          settled_by_participant_id = NULL,
          updated_at = now()
        WHERE id = ${id}::uuid
          AND calendar_id = ${session.calendarId}::uuid
      `,
      sql`
        INSERT INTO audit_log (
          calendar_id, actor_participant_id, action, entity_type, entity_id,
          before_state, after_state
        )
        SELECT
          calendar_id,
          ${session.participantId}::uuid,
          'expense.share_payment.update',
          'expense',
          id,
          jsonb_build_object(
            'participantId', ${session.participantId}::text,
            'paidCents', ${share.paidCents}::integer,
            'shareCents', ${share.shareCents}::integer,
            'settlementStatus', ${expense.settlementStatus}::text
          ),
          jsonb_build_object(
            'participantId', ${session.participantId}::text,
            'paidCents', ${paidCents}::integer,
            'shareCents', ${share.shareCents}::integer,
            'settlementStatus', settlement_status::text
          )
        FROM expenses
        WHERE id = ${id}::uuid
          AND calendar_id = ${session.calendarId}::uuid
      `,
    ]);
  } catch (error) {
    console.error("Shared cost payment update failed", {
      expenseId: id,
      participantId: session.participantId,
      message: error instanceof Error ? error.message : "unknown database error",
    });
    throw new ExpenseServiceError(
      409,
      "Your payment amount could not be updated.",
    );
  }

  const updatedRows = await db
    .select({ settlementStatus: expenses.settlementStatus })
    .from(expenses)
    .where(
      and(
        eq(expenses.id, id),
        eq(expenses.calendarId, session.calendarId),
      ),
    )
    .limit(1);

  return {
    ok: true as const,
    settlementStatus: updatedRows[0]?.settlementStatus ?? "outstanding",
    paidCents,
    shareCents: share.shareCents,
  };
}
