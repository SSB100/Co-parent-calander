import { addYears, format, parseISO } from "date-fns";
import {
  and,
  asc,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { listApprovalProposals } from "@/lib/approvals/engine";
import { loadEffectiveAssignmentMap } from "@/lib/assignments/effective";
import { localDateTimePartsInTimeZone } from "@/lib/calendar/time";
import { getDb } from "@/lib/db";
import {
  calendars,
  children,
  events,
  expenseShares,
  expenses,
  parentingAssignments,
  participants,
  responsibilities,
} from "@/lib/db/schema";
import { expandEventOccurrences } from "@/lib/events/recurrence";
import {
  aggregateParentingLabel,
  attentionCutoff,
  expenseReimbursementContext,
  proposalDisplay,
  urgencyForDate,
} from "@/lib/home/summary";


export type HomeLoadSession = {
  calendarId: string;
  participantId: string | null;
  membershipId: string;
  userName: string;
  permission: "owner" | "editor" | "viewer";
};

export class HomeNotFoundError extends Error {
  constructor() {
    super("Calendar not found.");
    this.name = "HomeNotFoundError";
  }
}

export async function loadHomeData(session: HomeLoadSession) {
  const db = getDb();
  const calendarRows = await db
    .select({
      id: calendars.id,
      name: calendars.name,
      timezone: calendars.timezone,
    })
    .from(calendars)
    .where(eq(calendars.id, session.calendarId))
    .limit(1);

  const calendar = calendarRows[0];
  if (!calendar) {
    throw new HomeNotFoundError();
  }

  const now = localDateTimePartsInTimeZone(calendar.timezone);
  const horizon = format(addYears(parseISO(now.date), 1), "yyyy-MM-dd");
  const attentionThrough = attentionCutoff(now.date, 3);
  const inferredSplitHandoverTime = sql<string>`coalesce(${parentingAssignments.handoverTime}, '12:00:00'::time)`;

  const [
    parentRows,
    childRows,
    eventRows,
    handoverRows,
    expenseRows,
    responsibilityRows,
  ] = await Promise.all([
    db
      .select({
        id: participants.id,
        displayName: participants.displayName,
        colorKey: participants.colorKey,
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
    db
      .select({
        id: events.id,
        title: events.title,
        description: events.description,
        category: events.category,
        startDate: events.startDate,
        endDate: events.endDate,
        recurrence: events.recurrence,
        recurrenceEndDate: events.recurrenceEndDate,
      })
      .from(events)
      .where(
        and(
          eq(events.calendarId, session.calendarId),
          lte(events.startDate, horizon),
          or(
            and(
              eq(events.recurrence, "none"),
              or(
                gte(events.startDate, now.date),
                and(isNotNull(events.endDate), gte(events.endDate, now.date)),
              ),
            ),
            and(
              ne(events.recurrence, "none"),
              or(
                isNull(events.recurrenceEndDate),
                gte(events.recurrenceEndDate, now.date),
              ),
            ),
          ),
        ),
      )
      .orderBy(asc(events.startDate))
      .limit(250),
    db
      .select({
        date: parentingAssignments.assignmentDate,
        morningParentId: parentingAssignments.parentId,
        afternoonParentId: parentingAssignments.afternoonParentId,
        handoverTime: parentingAssignments.handoverTime,
        handoverLocation: parentingAssignments.handoverLocation,
        note: parentingAssignments.note,
      })
      .from(parentingAssignments)
      .where(
        and(
          eq(parentingAssignments.calendarId, session.calendarId),
          or(
            isNotNull(parentingAssignments.handoverTime),
            and(
              isNotNull(parentingAssignments.parentId),
              isNotNull(parentingAssignments.afternoonParentId),
              ne(
                parentingAssignments.parentId,
                parentingAssignments.afternoonParentId,
              ),
            ),
          ),
          or(
            gt(parentingAssignments.assignmentDate, now.date),
            and(
              eq(parentingAssignments.assignmentDate, now.date),
              gte(inferredSplitHandoverTime, now.time),
            ),
          ),
        ),
      )
      .orderBy(
        asc(parentingAssignments.assignmentDate),
        asc(inferredSplitHandoverTime),
      )
      .limit(20),
    db
      .select({
        id: expenses.id,
        title: expenses.title,
        amountCents: expenses.amountCents,
        paidByParticipantId: expenses.paidByParticipantId,
        dueDate: expenses.dueDate,
      })
      .from(expenses)
      .where(
        and(
          eq(expenses.calendarId, session.calendarId),
          eq(expenses.settlementStatus, "outstanding"),
          isNotNull(expenses.dueDate),
        ),
      )
      .orderBy(asc(expenses.dueDate), asc(expenses.createdAt))
      .limit(100),
    db
      .select({
        id: responsibilities.id,
        title: responsibilities.title,
        responsibleParticipantId: responsibilities.responsibleParticipantId,
        dueDate: responsibilities.dueDate,
        dueTime: responsibilities.dueTime,
        category: responsibilities.category,
        completedAt: responsibilities.completedAt,
      })
      .from(responsibilities)
      .where(
        and(
          eq(responsibilities.calendarId, session.calendarId),
          or(
            isNull(responsibilities.completedAt),
            eq(responsibilities.dueDate, now.date),
          ),
        ),
      )
      .orderBy(
        asc(responsibilities.dueDate),
        asc(responsibilities.dueTime),
      )
      .limit(200),
  ]);

  const todayAssignmentMap = await loadEffectiveAssignmentMap({
    calendarId: session.calendarId,
    childIds: childRows.map((child) => child.id),
    from: now.date,
    to: now.date,
  });
  const todayAssignments = [...todayAssignmentMap.values()];

  const parentingLabel = aggregateParentingLabel({
    rows: todayAssignments,
    childCount: childRows.length,
    currentParticipantId: session.participantId,
    participants: parentRows,
  });

  const expandedEvents = expandEventOccurrences({
    events: eventRows,
    from: now.date,
    to: horizon,
  });
  const todayEvents = expandedEvents.filter(
    (event) => event.startDate <= now.date && (event.endDate ?? event.startDate) >= now.date,
  );
  const nextEvent =
    expandedEvents.find((event) => event.startDate > now.date) ?? null;

  const todayManualHandover =
    handoverRows.find((handover) => handover.date === now.date) ?? null;
  const nextHandover = handoverRows[0] ?? null;

  const expenseIds = expenseRows.map((expense) => expense.id);
  const shareRows = expenseIds.length
    ? await db
        .select({
          expenseId: expenseShares.expenseId,
          participantId: expenseShares.participantId,
          shareCents: expenseShares.shareCents,
          paidAt: expenseShares.paidAt,
        })
        .from(expenseShares)
        .where(inArray(expenseShares.expenseId, expenseIds))
    : [];

  const sharesByExpense = new Map<
    string,
    Array<{
      participantId: string;
      shareCents: number;
      paidAt: Date | null;
    }>
  >();
  for (const share of shareRows) {
    const current = sharesByExpense.get(share.expenseId) ?? [];
    current.push({
      participantId: share.participantId,
      shareCents: share.shareCents,
      paidAt: share.paidAt,
    });
    sharesByExpense.set(share.expenseId, current);
  }

  const expenseAttention = expenseRows
    .filter(
      (expense) =>
        expense.dueDate !== null &&
        expense.dueDate <= attentionThrough,
    )
    .map((expense) => {
      const shares = sharesByExpense.get(expense.id) ?? [];
      return {
        ...expense,
        dueDate: expense.dueDate!,
        urgency: urgencyForDate(expense.dueDate!, now.date),
        reimbursement: expenseReimbursementContext({
          amountCents: expense.amountCents,
          paidByParticipantId: expense.paidByParticipantId,
          shares,
          currentParticipantId: session.participantId,
        }),
      };
    })
    .filter(
      (expense) =>
        !session.participantId ||
        expense.reimbursement.amountCents > 0,
    );

  const nextExpenseRow =
    expenseRows.find(
      (expense) =>
        expense.dueDate !== null &&
        expense.dueDate > attentionThrough,
    ) ?? null;
  const nextExpense = nextExpenseRow?.dueDate
    ? {
        ...nextExpenseRow,
        dueDate: nextExpenseRow.dueDate,
        reimbursement: expenseReimbursementContext({
          amountCents: nextExpenseRow.amountCents,
          paidByParticipantId: nextExpenseRow.paidByParticipantId,
          shares: sharesByExpense.get(nextExpenseRow.id) ?? [],
          currentParticipantId: session.participantId,
        }),
      }
    : null;

  const responsibilityAttention = responsibilityRows
    .filter(
      (item) =>
        !item.completedAt &&
        item.dueDate <= now.date,
    )
    .map((item) => ({
      ...item,
      completedAt: item.completedAt?.toISOString() ?? null,
      dueTime: item.dueTime ? item.dueTime.slice(0, 5) : null,
      urgency: urgencyForDate(item.dueDate, now.date),
    }));

  const todayResponsibilities = responsibilityRows
    .filter((item) => item.dueDate === now.date)
    .map((item) => ({
      ...item,
      completedAt: item.completedAt?.toISOString() ?? null,
      dueTime: item.dueTime ? item.dueTime.slice(0, 5) : null,
      urgency: urgencyForDate(item.dueDate, now.date),
    }));

  const nextResponsibilityRow =
    responsibilityRows.find(
      (item) => !item.completedAt && item.dueDate > now.date,
    ) ?? null;
  const nextResponsibility = nextResponsibilityRow
    ? {
        ...nextResponsibilityRow,
        completedAt: nextResponsibilityRow.completedAt?.toISOString() ?? null,
        dueTime: nextResponsibilityRow.dueTime
          ? nextResponsibilityRow.dueTime.slice(0, 5)
          : null,
        urgency: urgencyForDate(nextResponsibilityRow.dueDate, now.date),
      }
    : null;

  const waitingProposals = await listApprovalProposals(session.calendarId, {
    status: "waiting",
    limit: 100,
  });
  const actionableApprovals = waitingProposals
    .filter(
      (proposal) =>
        proposal.approverMembershipId === session.membershipId ||
        proposal.proposedByMembershipId === session.membershipId,
    )
    .map((proposal) => ({
      id: proposal.id,
      entityType: proposal.entityType,
      action: proposal.action,
      proposedByMembershipId: proposal.proposedByMembershipId,
      approverMembershipId: proposal.approverMembershipId,
      proposedByName: proposal.proposedByName,
      approverName: proposal.approverName,
      reason: proposal.reason,
      ...proposalDisplay({
        entityType: proposal.entityType,
        action: proposal.action,
        previousState: proposal.previousState,
        proposedState: proposal.proposedState,
      }),
    }));

  return {
    calendar,
    currentParticipantId: session.participantId,
    currentMembershipId: session.membershipId,
    currentUserName: session.userName,
    permission: session.permission,
    participants: parentRows,
    children: childRows,
    today: {
      date: now.date,
      parentingLabel,
      handover: todayManualHandover,
      events: todayEvents.slice(0, 8),
      responsibilities: todayResponsibilities.slice(0, 8),
    },
    needsAttention: {
      approvals: actionableApprovals,
      expenses: expenseAttention,
      responsibilities: responsibilityAttention,
    },
    comingUp: {
      handover: nextHandover,
      event: nextEvent,
      expense: nextExpense,
      responsibility: nextResponsibility,
    },
  };
}
