import { differenceInCalendarDays, parseISO } from "date-fns";
import { and, asc, eq, gt, gte, isNotNull, isNull, lte, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import {
  calendars,
  children,
  events,
  parentingAssignments,
  participants,
  recurringRuleChildren,
  recurringRules,
} from "@/lib/db/schema";
import { resolveRecurringAssignments } from "@/lib/recurrence/fortnight";
import { getCalendarSession } from "@/lib/security/session";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => !Number.isNaN(parseISO(value).getTime()), "Invalid date");

const rangeSchema = z
  .object({ from: isoDate, to: isoDate })
  .refine((value) => value.from <= value.to, { message: "The start date must be before the end date." })
  .refine((value) => differenceInCalendarDays(parseISO(value.to), parseISO(value.from)) <= 62, {
    message: "Calendar ranges are limited to 63 days.",
  });

function localDateTimeParts(timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-NZ", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "00";
  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    time: `${value("hour")}:${value("minute")}:${value("second")}`,
  };
}

export async function GET(request: Request) {
  const session = await getCalendarSession();
  if (!session) return NextResponse.json({ error: "Calendar access is required." }, { status: 401 });

  const url = new URL(request.url);
  const parsed = rangeSchema.safeParse({ from: url.searchParams.get("from"), to: url.searchParams.get("to") });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Choose a valid calendar range." }, { status: 400 });
  }

  const db = getDb();
  const { from, to } = parsed.data;
  const calendarRows = await db
    .select({ id: calendars.id, name: calendars.name, timezone: calendars.timezone, shareEnabled: calendars.shareEnabled })
    .from(calendars)
    .where(eq(calendars.id, session.calendarId))
    .limit(1);

  const calendar = calendarRows[0];
  if (!calendar) return NextResponse.json({ error: "Calendar not found." }, { status: 404 });
  const now = localDateTimeParts(calendar.timezone);

  const [parentRows, childRows, manualAssignmentRows, recurringRuleRows, recurringRuleChildRows, eventRows, nextHandoverRows, nextEventRows] = await db.batch([
    db.select({ id: participants.id, displayName: participants.displayName, colorKey: participants.colorKey })
      .from(participants)
      .where(and(eq(participants.calendarId, session.calendarId), eq(participants.active, true)))
      .orderBy(asc(participants.createdAt)),
    db.select({ id: children.id, displayName: children.displayName })
      .from(children)
      .where(and(eq(children.calendarId, session.calendarId), eq(children.active, true)))
      .orderBy(asc(children.createdAt)),
    db.select({
      id: parentingAssignments.id,
      childId: parentingAssignments.childId,
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
        gte(parentingAssignments.assignmentDate, from),
        lte(parentingAssignments.assignmentDate, to),
      ))
      .orderBy(asc(parentingAssignments.assignmentDate)),
    db.select({ id: recurringRules.id, parentId: recurringRules.parentId, startDate: recurringRules.startDate, endDate: recurringRules.endDate, rrule: recurringRules.rrule })
      .from(recurringRules)
      .where(and(eq(recurringRules.calendarId, session.calendarId), eq(recurringRules.active, true))),
    db.select({ ruleId: recurringRuleChildren.recurringRuleId, childId: recurringRuleChildren.childId })
      .from(recurringRuleChildren)
      .innerJoin(recurringRules, eq(recurringRuleChildren.recurringRuleId, recurringRules.id))
      .where(and(eq(recurringRules.calendarId, session.calendarId), eq(recurringRules.active, true))),
    db.select({ id: events.id, title: events.title, description: events.description, category: events.category, startDate: events.startDate, endDate: events.endDate })
      .from(events)
      .where(and(
        eq(events.calendarId, session.calendarId),
        lte(events.startDate, to),
        or(isNull(events.endDate), gte(events.endDate, from)),
      ))
      .orderBy(asc(events.startDate)),
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
        isNotNull(parentingAssignments.handoverTime),
        or(
          gt(parentingAssignments.assignmentDate, now.date),
          and(eq(parentingAssignments.assignmentDate, now.date), gte(parentingAssignments.handoverTime, now.time)),
        ),
      ))
      .orderBy(asc(parentingAssignments.assignmentDate), asc(parentingAssignments.handoverTime))
      .limit(1),
    db.select({ id: events.id, title: events.title, description: events.description, category: events.category, startDate: events.startDate, endDate: events.endDate })
      .from(events)
      .where(and(
        eq(events.calendarId, session.calendarId),
        or(gte(events.startDate, now.date), and(isNotNull(events.endDate), gte(events.endDate, now.date))),
      ))
      .orderBy(asc(events.startDate))
      .limit(1),
  ]);

  const assignments = resolveRecurringAssignments({
    manualAssignments: manualAssignmentRows,
    rules: recurringRuleRows,
    ruleChildren: recurringRuleChildRows,
    from,
    to,
  });

  return NextResponse.json({
    calendar,
    currentParticipantId: session.participantId,
    currentUserName: session.userName,
    permission: session.permission,
    participants: parentRows,
    children: childRows,
    assignments,
    events: eventRows,
    recurringScheduleActive: recurringRuleRows.length > 0,
    nextHandover: nextHandoverRows[0] ?? null,
    nextEvent: nextEventRows[0] ?? null,
  });
}
