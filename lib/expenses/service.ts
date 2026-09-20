import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull, lte, or } from "drizzle-orm";
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
  expenseRecurringSeries,
  expenseShares,
  expenses,
  participants,
} from "@/lib/db/schema";
import { createRecurringExpenseSeries } from "@/lib/expenses/recurrence";
import {
  assertExpenseRelations,
  defaultSettlementStatus,
  expenseProposalStateSchema,
  financialSignature,
  loadExpenseSnapshot,
  type ExpenseDetails,
  type ExpenseRecurrence,
} from "@/lib/expenses/model";

export type ExpenseReadSession = {
  calendarId: string;
  calendarTimezone: string;
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

function proposalExpenseState(
  id: string,
  details: ExpenseDetails,
  recurrence: ExpenseRecurrence | null = null,
) {
  return {
    kind: "expense" as const,
    expense: { id, ...details },
    recurrence,
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
  } else {
    const today = localDateInTimeZone(session.calendarTimezone);
    conditions.push(
      or(
        isNull(expenses.seriesOccurrenceDate),
        lte(expenses.seriesOccurrenceDate, today),
      )!,
    );
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
        seriesId: expenses.seriesId,
        seriesOccurrenceDate: expenses.seriesOccurrenceDate,
        recurrenceFrequency: expenseRecurringSeries.frequency,
        settlementStatus: expenses.settlementStatus,
        settledAt: expenses.settledAt,
        settledByParticipantId: expenses.settledByParticipantId,
        createdAt: expenses.createdAt,
        updatedAt: expenses.updatedAt,
      })
      .from(expenses)
      .leftJoin(
        expenseRecurringSeries,
        eq(expenses.seriesId, expenseRecurringSeries.id),
      )
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
  recurrence: ExpenseRecurrence | null;
}) {
  const { session, details, reason, recurrence } = input;

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
        proposedState: proposalExpenseState(id, details, recurrence),
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

  if (recurrence) {
    try {
      const recurring = await createRecurringExpenseSeries({
        calendarId: session.calendarId,
        createdByParticipantId: session.participantId,
        firstExpenseId: id,
        details,
        recurrence,
      });
      return {
        ok: true as const,
        pending: false as const,
        id,
        seriesId: recurring.seriesId,
      };
    } catch (error) {
      serviceFailure(error, "The recurring shared cost could not be saved.");
    }
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
  paymentCents: number;
}) {
  const { session, id, paymentCents } = input;
  const db = getDb();

  const shareRows = await db
    .select({
      id: expenseShares.id,
      shareCents: expenseShares.shareCents,
      paidCents: expenseShares.paidCents,
    })
    .from(expenseShares)
    .innerJoin(expenses, eq(expenses.id, expenseShares.expenseId))
    .where(
      and(
        eq(expenses.id, id),
        eq(expenses.calendarId, session.calendarId),
        eq(expenseShares.participantId, session.participantId),
      ),
    )
    .limit(1);

  const share = shareRows[0];
  if (!share) {
    throw new ExpenseServiceError(
      403,
      "You can only add payments to your own share of this shared cost.",
    );
  }
  if (share.shareCents <= 0) {
    throw new ExpenseServiceError(
      409,
      "Your share is zero, so there is no payment to record.",
    );
  }

  const remainingCents = Math.max(0, share.shareCents - share.paidCents);
  if (remainingCents === 0) {
    throw new ExpenseServiceError(409, "Your share is already paid in full.");
  }
  if (paymentCents > remainingCents) {
    throw new ExpenseServiceError(
      400,
      `You only have ${(remainingCents / 100).toFixed(2)} left to pay on your share.`,
    );
  }

  const paymentId = randomUUID();
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
        INSERT INTO expense_share_payments (
          id, expense_share_id, participant_id, amount_cents, created_at
        )
        SELECT
          ${paymentId}::uuid,
          share.id,
          ${session.participantId}::uuid,
          ${paymentCents}::integer,
          now()
        FROM expense_shares share
        WHERE share.id = ${share.id}::uuid
          AND share.expense_id = ${id}::uuid
          AND share.participant_id = ${session.participantId}::uuid
          AND share.paid_cents + ${paymentCents}::integer <= share.share_cents
      `,
      sql`
        UPDATE expense_shares
        SET
          paid_cents = paid_cents + ${paymentCents}::integer,
          paid_at = CASE
            WHEN paid_cents + ${paymentCents}::integer = share_cents
              THEN now()
            ELSE NULL
          END,
          updated_at = now()
        WHERE id = ${share.id}::uuid
          AND expense_id = ${id}::uuid
          AND participant_id = ${session.participantId}::uuid
          AND EXISTS (
            SELECT 1
            FROM expense_share_payments payment
            WHERE payment.id = ${paymentId}::uuid
          )
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
          AND EXISTS (
            SELECT 1
            FROM expense_share_payments payment
            WHERE payment.id = ${paymentId}::uuid
          )
      `,
      sql`
        INSERT INTO audit_log (
          calendar_id, actor_participant_id, action, entity_type, entity_id,
          before_state, after_state
        )
        SELECT
          expense.calendar_id,
          ${session.participantId}::uuid,
          'expense.share_payment.add',
          'expense',
          expense.id,
          jsonb_build_object(
            'participantId', ${session.participantId}::text,
            'paidCents', share.paid_cents - ${paymentCents}::integer,
            'shareCents', share.share_cents
          ),
          jsonb_build_object(
            'participantId', ${session.participantId}::text,
            'paymentCents', ${paymentCents}::integer,
            'paidCents', share.paid_cents,
            'shareCents', share.share_cents,
            'settlementStatus', expense.settlement_status::text
          )
        FROM expenses expense
        JOIN expense_shares share
          ON share.expense_id = expense.id
         AND share.id = ${share.id}::uuid
        WHERE expense.id = ${id}::uuid
          AND expense.calendar_id = ${session.calendarId}::uuid
          AND EXISTS (
            SELECT 1
            FROM expense_share_payments payment
            WHERE payment.id = ${paymentId}::uuid
          )
      `,
    ]);
  } catch (error) {
    console.error("Shared cost payment add failed", {
      expenseId: id,
      participantId: session.participantId,
      message: error instanceof Error ? error.message : "unknown database error",
    });
    throw new ExpenseServiceError(409, "Your payment could not be added.");
  }

  const paymentRows = await sql`
    SELECT id
    FROM expense_share_payments
    WHERE id = ${paymentId}::uuid
    LIMIT 1
  `;
  if (paymentRows.length === 0) {
    throw new ExpenseServiceError(
      409,
      "Your remaining balance changed before this payment was saved. Refresh and try again.",
    );
  }

  const [updatedShareRows, updatedExpenseRows] = await Promise.all([
    db
      .select({
        paidCents: expenseShares.paidCents,
        shareCents: expenseShares.shareCents,
      })
      .from(expenseShares)
      .where(eq(expenseShares.id, share.id))
      .limit(1),
    db
      .select({ settlementStatus: expenses.settlementStatus })
      .from(expenses)
      .where(
        and(
          eq(expenses.id, id),
          eq(expenses.calendarId, session.calendarId),
        ),
      )
      .limit(1),
  ]);

  return {
    ok: true as const,
    paymentId,
    paymentCents,
    paidCents: updatedShareRows[0]?.paidCents ?? share.paidCents + paymentCents,
    shareCents: updatedShareRows[0]?.shareCents ?? share.shareCents,
    settlementStatus:
      updatedExpenseRows[0]?.settlementStatus ?? "outstanding",
  };
}
