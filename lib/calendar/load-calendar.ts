import {
  addYears,
  differenceInCalendarDays,
  endOfMonth,
  endOfWeek,
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { and, asc, eq, gt, gte, isNotNull, isNull, lte, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { projectCalendarPendingProposals } from "@/lib/approvals/calendar-pending";
import { loadEffectiveAssignmentMap } from "@/lib/assignments/effective";
import { localDateTimePartsInTimeZone } from "@/lib/calendar/time";
import { listApprovalProposals } from "@/lib/approvals/engine";
import { getDb } from "@/lib/db";
import { expandEventOccurrences } from "@/lib/events/recurrence";
import { responsibilityProposalStateSchema } from "@/lib/responsibilities/model";
import {
  calendars,
  children,
  events,
  parentingAssignments,
  participants,
  parentingSchedules,
  responsibilities,
} from "@/lib/db/schema";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => !Number.isNaN(parseISO(value).getTime()), "Invalid date");

export const calendarRangeSchema = z
  .object({ from: isoDate, to: isoDate })
  .refine((value) => value.from <= value.to, { message: "The start date must be before the end date." })
  .refine((value) => differenceInCalendarDays(parseISO(value.to), parseISO(value.from)) <= 62, {
    message: "Calendar ranges are limited to 63 days.",
  });


export type CalendarLoadSession = {
  calendarId: string;
  calendarTimezone: string;
  participantId: string | null;
  membershipId: string;
  userName: string;
  permission: "owner" | "editor" | "viewer";
};

export class CalendarNotFoundError extends Error {
  constructor() {
    super("Calendar not found.");
    this.name = "CalendarNotFoundError";
  }
}

export function calendarRangeForDate(date: string) {
  const parsedDate = isoDate.parse(date);
  const month = startOfMonth(parseISO(parsedDate));
  const start = startOfWeek(month, { weekStartsOn: 1 });
  const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });

  return {
    month: format(month, "yyyy-MM-dd"),
    from: format(start, "yyyy-MM-dd"),
    to: format(end, "yyyy-MM-dd"),
  };
}

export async function loadCalendarData(
  session: CalendarLoadSession,
  input: unknown,
) {
  const { from, to } = calendarRangeSchema.parse(input);
  const db = getDb();
  const calendarRows = await db
    .select({ id: calendars.id, name: calendars.name, timezone: calendars.timezone, shareEnabled: calendars.shareEnabled })
    .from(calendars)
    .where(eq(calendars.id, session.calendarId))
    .limit(1);

  const calendar = calendarRows[0];
  if (!calendar) throw new CalendarNotFoundError();
  const now = localDateTimePartsInTimeZone(calendar.timezone);
  const inferredSplitHandoverTime = sql<string>`coalesce(${parentingAssignments.handoverTime}, '12:00:00'::time)`;

  const [parentRows, childRows, eventRows, responsibilityRows, nextHandoverRows, nextEventRows, scheduleRows] = await db.batch([
    db.select({
      id: participants.id,
      displayName: participants.displayName,
      colorKey: participants.colorKey,
      profileSlot: participants.profileSlot,
    })
      .from(participants)
      .where(and(eq(participants.calendarId, session.calendarId), eq(participants.active, true)))
      .orderBy(asc(participants.createdAt)),
    db.select({ id: children.id, displayName: children.displayName })
      .from(children)
      .where(and(eq(children.calendarId, session.calendarId), eq(children.active, true)))
      .orderBy(asc(children.createdAt)),
    db.select({
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
      .where(and(
        eq(events.calendarId, session.calendarId),
        lte(events.startDate, to),
        or(
          and(
            eq(events.recurrence, "none"),
            or(
              gte(events.startDate, from),
              and(isNotNull(events.endDate), gte(events.endDate, from)),
            ),
          ),
          and(
            ne(events.recurrence, "none"),
            or(isNull(events.recurrenceEndDate), gte(events.recurrenceEndDate, from)),
          ),
        ),
      ))
      .orderBy(asc(events.startDate)),
    db.select({
      date: responsibilities.dueDate,
      completedAt: responsibilities.completedAt,
    })
      .from(responsibilities)
      .where(and(
        eq(responsibilities.calendarId, session.calendarId),
        gte(responsibilities.dueDate, from),
        lte(responsibilities.dueDate, to),
      ))
      .orderBy(asc(responsibilities.dueDate)),
    db.select({
      date: parentingAssignments.assignmentDate,
      morningParentId: parentingAssignments.parentId,
      afternoonParentId: parentingAssignments.afternoonParentId,
      handoverTime: parentingAssignments.handoverTime,
      handoverLocation: parentingAssignments.handoverLocation,
      note: parentingAssignments.note,
    })
      .from(parentingAssignments)
      .where(and(
        eq(parentingAssignments.calendarId, session.calendarId),
        eq(parentingAssignments.source, "manual"),
        or(
          isNotNull(parentingAssignments.parentId),
          isNotNull(parentingAssignments.afternoonParentId),
        ),
        or(
          isNotNull(parentingAssignments.handoverTime),
          and(
            isNotNull(parentingAssignments.parentId),
            isNotNull(parentingAssignments.afternoonParentId),
            ne(parentingAssignments.parentId, parentingAssignments.afternoonParentId),
          ),
        ),
        or(
          gt(parentingAssignments.assignmentDate, now.date),
          and(
            eq(parentingAssignments.assignmentDate, now.date),
            gte(inferredSplitHandoverTime, now.time),
          ),
        ),
      ))
      .orderBy(asc(parentingAssignments.assignmentDate), asc(inferredSplitHandoverTime))
      .limit(1),
    db.select({
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
      .where(and(
        eq(events.calendarId, session.calendarId),
        lte(events.startDate, format(addYears(parseISO(now.date), 1), "yyyy-MM-dd")),
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
            or(isNull(events.recurrenceEndDate), gte(events.recurrenceEndDate, now.date)),
          ),
        ),
      ))
      .orderBy(asc(events.startDate))
      .limit(100),
    db
      .select({ id: parentingSchedules.id })
      .from(parentingSchedules)
      .where(
        and(
          eq(parentingSchedules.calendarId, session.calendarId),
          eq(parentingSchedules.active, true),
        ),
      )
      .limit(1),
  ]);

  const assignmentMap = await loadEffectiveAssignmentMap({
    calendarId: session.calendarId,
    childIds: childRows.map((child) => child.id),
    from,
    to,
  });
  const assignments = [...assignmentMap.values()];

  const visibleEvents = expandEventOccurrences({
    events: eventRows,
    from,
    to,
  });
  const nextEvent = expandEventOccurrences({
    events: nextEventRows,
    from: now.date,
    to: format(addYears(parseISO(now.date), 1), "yyyy-MM-dd"),
  })[0] ?? null;

  const waitingProposals = await listApprovalProposals(session.calendarId, {
    status: "waiting",
    limit: 50,
  });
  const pendingProposals = projectCalendarPendingProposals({
    proposals: waitingProposals.filter(
      (proposal) =>
        proposal.entityType === "parenting_schedule" ||
        proposal.entityType === "shared_event",
    ),
    from,
    to,
  });

  const responsibilityMarkerMap = new Map<
    string,
    { date: string; count: number; incompleteCount: number; pendingCount: number }
  >();
  for (const item of responsibilityRows) {
    const marker = responsibilityMarkerMap.get(item.date) ?? {
      date: item.date,
      count: 0,
      incompleteCount: 0,
      pendingCount: 0,
    };
    marker.count += 1;
    if (!item.completedAt) marker.incompleteCount += 1;
    responsibilityMarkerMap.set(item.date, marker);
  }

  for (const proposal of waitingProposals.filter(
    (item) => item.entityType === "responsibility",
  )) {
    const dates = new Set<string>();
    for (const state of [proposal.previousState, proposal.proposedState]) {
      const parsedState = responsibilityProposalStateSchema.safeParse(state);
      const dueDate = parsedState.success
        ? parsedState.data.responsibility?.dueDate
        : null;
      if (dueDate && dueDate >= from && dueDate <= to) dates.add(dueDate);
    }
    for (const date of dates) {
      const marker = responsibilityMarkerMap.get(date) ?? {
        date,
        count: 0,
        incompleteCount: 0,
        pendingCount: 0,
      };
      marker.pendingCount += 1;
      responsibilityMarkerMap.set(date, marker);
    }
  }

  const responsibilityMarkers = [...responsibilityMarkerMap.values()];

  return {
    calendar,
    currentParticipantId: session.participantId,
    currentMembershipId: session.membershipId,
    currentUserName: session.userName,
    permission: session.permission,
    participants: parentRows,
    children: childRows,
    assignments,
    events: visibleEvents,
    pendingProposals,
    responsibilityMarkers,
    recurringScheduleActive: scheduleRows.length > 0,
    nextHandover: nextHandoverRows[0] ?? null,
    nextEvent,
  };
}
