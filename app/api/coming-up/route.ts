import { addMonths, format, parseISO } from "date-fns";
import { and, asc, eq, isNotNull, isNull, gte, lte, ne, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { loadEffectiveAssignmentMap } from "@/lib/assignments/effective";
import { localDateInTimeZone } from "@/lib/calendar/time";
import { getDb } from "@/lib/db";
import { children, events, participants } from "@/lib/db/schema";
import { expandEventOccurrences } from "@/lib/events/recurrence";
import { getCalendarSession } from "@/lib/security/session";

export async function GET() {
  const session = await getCalendarSession();
  if (!session) {
    return NextResponse.json({ error: "Calendar access is required." }, { status: 401 });
  }

  try {
    const db = getDb();
    const today = localDateInTimeZone(session.calendarTimezone);
    const horizon = format(addMonths(parseISO(today), 4), "yyyy-MM-dd");

    const [parentRows, childRows, eventRows] = await db.batch([
      db
        .select({ id: participants.id, displayName: participants.displayName })
        .from(participants)
        .where(and(eq(participants.calendarId, session.calendarId), eq(participants.active, true)))
        .orderBy(asc(participants.createdAt)),
      db
        .select({ id: children.id })
        .from(children)
        .where(and(eq(children.calendarId, session.calendarId), eq(children.active, true)))
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
                  gte(events.startDate, today),
                  and(isNotNull(events.endDate), gte(events.endDate, today)),
                ),
              ),
              and(
                ne(events.recurrence, "none"),
                or(isNull(events.recurrenceEndDate), gte(events.recurrenceEndDate, today)),
              ),
            ),
          ),
        )
        .orderBy(asc(events.startDate)),
    ]);

    const assignments = await loadEffectiveAssignmentMap({
      calendarId: session.calendarId,
      childIds: childRows.map((child) => child.id),
      from: today,
      to: horizon,
    });

    const parentNames = new Map(parentRows.map((parent) => [parent.id, parent.displayName]));
    const handoversByDate = new Map<
      string,
      { directions: Set<string>; time: string | null }
    >();

    for (const assignment of assignments.values()) {
      if (
        !assignment.morningParentId ||
        !assignment.afternoonParentId ||
        assignment.morningParentId === assignment.afternoonParentId
      ) {
        continue;
      }
      const entry = handoversByDate.get(assignment.date) ?? {
        directions: new Set<string>(),
        time: null,
      };
      entry.directions.add(
        `${assignment.morningParentId}:${assignment.afternoonParentId}`,
      );
      entry.time ??= assignment.handoverTime?.slice(0, 5) ?? null;
      handoversByDate.set(assignment.date, entry);
    }

    const eventItems = expandEventOccurrences({
      events: eventRows,
      from: today,
      to: horizon,
    }).map((event) => ({
      id: `event-${event.id}-${event.startDate}`,
      title: event.title,
      date: event.startDate,
      time: null as string | null,
      kind: "Event" as const,
      category: event.category,
      href: "/calendar",
    }));

    const handoverItems = [...handoversByDate.entries()].map(([date, handover]) => {
      const direction = [...handover.directions][0];
      const [morningId, afternoonId] = direction?.split(":") ?? [];
      const morningName = morningId ? parentNames.get(morningId) : null;
      const afternoonName = afternoonId ? parentNames.get(afternoonId) : null;
      const title =
        handover.directions.size === 1 && morningName && afternoonName
          ? `Handover · ${morningName} to ${afternoonName}`
          : "Parent handover";

      return {
        id: `handover-${date}`,
        title,
        date,
        time: handover.time,
        kind: "Handover" as const,
        category: "handover",
        href: "/calendar",
      };
    });

    const items = [...eventItems, ...handoverItems]
      .sort(
        (a, b) =>
          a.date.localeCompare(b.date) ||
          (a.time ?? "00:00").localeCompare(b.time ?? "00:00") ||
          a.title.localeCompare(b.title),
      )
      .slice(0, 8);

    return NextResponse.json(
      { items, total: eventItems.length + handoverItems.length },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "Your events are unavailable." }, { status: 500 });
  }
}
