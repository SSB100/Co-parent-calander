import { differenceInCalendarDays, parseISO } from "date-fns";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import {
  calendars,
  children,
  parentingAssignments,
  participants,
} from "@/lib/db/schema";
import { getEditorSession } from "@/lib/security/session";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => !Number.isNaN(parseISO(value).getTime()), "Invalid date");

const rangeSchema = z
  .object({
    from: isoDate,
    to: isoDate,
  })
  .refine((value) => value.from <= value.to, {
    message: "The start date must be before the end date.",
  })
  .refine(
    (value) => differenceInCalendarDays(parseISO(value.to), parseISO(value.from)) <= 62,
    { message: "Calendar ranges are limited to 63 days." },
  );

export async function GET(request: Request) {
  const session = await getEditorSession();

  if (!session) {
    return NextResponse.json({ error: "Editor access is required." }, { status: 401 });
  }

  const url = new URL(request.url);
  const parsed = rangeSchema.safeParse({
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Choose a valid calendar range." },
      { status: 400 },
    );
  }

  const db = getDb();
  const { from, to } = parsed.data;

  const [calendarRows, parentRows, childRows, assignmentRows] = await db.batch([
    db
      .select({
        id: calendars.id,
        name: calendars.name,
        timezone: calendars.timezone,
        shareEnabled: calendars.shareEnabled,
      })
      .from(calendars)
      .where(eq(calendars.id, session.calendarId))
      .limit(1),
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
      .select({
        id: children.id,
        displayName: children.displayName,
      })
      .from(children)
      .where(and(eq(children.calendarId, session.calendarId), eq(children.active, true)))
      .orderBy(asc(children.createdAt)),
    db
      .select({
        id: parentingAssignments.id,
        childId: parentingAssignments.childId,
        date: parentingAssignments.assignmentDate,
        parentId: parentingAssignments.parentId,
        handoverTime: parentingAssignments.handoverTime,
        handoverLocation: parentingAssignments.handoverLocation,
        note: parentingAssignments.note,
      })
      .from(parentingAssignments)
      .where(
        and(
          eq(parentingAssignments.calendarId, session.calendarId),
          gte(parentingAssignments.assignmentDate, from),
          lte(parentingAssignments.assignmentDate, to),
        ),
      )
      .orderBy(asc(parentingAssignments.assignmentDate)),
  ]);

  const calendar = calendarRows[0];
  if (!calendar) {
    return NextResponse.json({ error: "Calendar not found." }, { status: 404 });
  }

  return NextResponse.json({
    calendar,
    currentParticipantId: session.participantId,
    participants: parentRows,
    children: childRows,
    assignments: assignmentRows,
  });
}
