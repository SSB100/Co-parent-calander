import { addMonths, format, parseISO } from "date-fns";
import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { loadEffectiveAssignmentMap } from "@/lib/assignments/effective";
import { localDateInTimeZone } from "@/lib/calendar/time";
import { getDb } from "@/lib/db";
import { children, participants } from "@/lib/db/schema";
import { expandEventOccurrences } from "@/lib/events/recurrence";
import { listEvents } from "@/lib/events/service";
import { getCalendarSession } from "@/lib/security/session";
import { comingUp } from "@/lib/workspace/coming-up";

export async function GET() {
  const session = await getCalendarSession();
  if (!session) {
    return NextResponse.json(
      { error: "Calendar access is required." },
      { status: 401 },
    );
  }

  try {
    const today = localDateInTimeZone(session.calendarTimezone);
    const horizon = format(addMonths(parseISO(today), 3), "yyyy-MM-dd");
    const db = getDb();

    const [eventRows, childRows, parentRows] = await Promise.all([
      listEvents({
        calendarId: session.calendarId,
        calendarTimezone: session.calendarTimezone,
        targetDate: null,
      }),
      db
        .select({ id: children.id })
        .from(children)
        .where(
          and(
            eq(children.calendarId, session.calendarId),
            eq(children.active, true),
          ),
        )
        .orderBy(asc(children.createdAt)),
      db
        .select({ id: participants.id, displayName: participants.displayName })
        .from(participants)
        .where(
          and(
            eq(participants.calendarId, session.calendarId),
            eq(participants.active, true),
          ),
        )
        .orderBy(asc(participants.createdAt)),
    ]);

    const eventOccurrences = expandEventOccurrences({
      events: eventRows,
      from: today,
      to: horizon,
    }).map((event) => ({
      id: `${event.id}:${event.startDate}`,
      title: event.title,
      startDate: event.startDate,
    }));

    const effectiveAssignments = await loadEffectiveAssignmentMap({
      calendarId: session.calendarId,
      childIds: childRows.map((child) => child.id),
      from: today,
      to: horizon,
    });

    const parentNames = new Map(
      parentRows.map((parent) => [parent.id, parent.displayName]),
    );
    const handoversByDate = new Map<
      string,
      { id: string; title: string; date: string }
    >();

    for (const assignment of effectiveAssignments.values()) {
      if (
        !assignment.morningParentId ||
        !assignment.afternoonParentId ||
        assignment.morningParentId === assignment.afternoonParentId ||
        handoversByDate.has(assignment.date)
      ) {
        continue;
      }

      const fromName =
        parentNames.get(assignment.morningParentId) ?? "Parent";
      const toName =
        parentNames.get(assignment.afternoonParentId) ?? "Parent";
      handoversByDate.set(assignment.date, {
        id: `handover:${assignment.date}`,
        title: `Handover · ${fromName} → ${toName}`,
        date: assignment.date,
      });
    }

    return NextResponse.json(
      comingUp(eventOccurrences, [...handoversByDate.values()], today),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Your events are unavailable." },
      { status: 500 },
    );
  }
}
