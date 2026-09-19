import { addMonths, format, parseISO } from "date-fns";
import {
  and,
  asc,
  eq,
  gte,
  isNotNull,
  isNull,
  lte,
  ne,
  or,
} from "drizzle-orm";
import { NextResponse } from "next/server";
import { loadEffectiveAssignmentMap } from "@/lib/assignments/effective";
import { localDateInTimeZone } from "@/lib/calendar/time";
import { getDb } from "@/lib/db";
import {
  children,
  events,
  expenses,
  participants,
  responsibilities,
} from "@/lib/db/schema";
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

    const [parentRows, childRows, eventRows, expenseRows, responsibilityRows] =
      await db.batch([
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
                  or(
                    isNull(events.recurrenceEndDate),
                    gte(events.recurrenceEndDate, today),
                  ),
                ),
              ),
            ),
          )
          .orderBy(asc(events.startDate)),
        db
          .select({
            id: expenses.id,
            title: expenses.title,
            amountCents: expenses.amountCents,
            dueDate: expenses.dueDate,
          })
          .from(expenses)
          .where(
            and(
              eq(expenses.calendarId, session.calendarId),
              eq(expenses.settlementStatus, "outstanding"),
            ),
          )
          .orderBy(asc(expenses.dueDate), asc(expenses.createdAt))
          .limit(50),
        db
          .select({
            id: responsibilities.id,
            title: responsibilities.title,
            dueDate: responsibilities.dueDate,
            dueTime: responsibilities.dueTime,
          })
          .from(responsibilities)
          .where(
            and(
              eq(responsibilities.calendarId, session.calendarId),
              isNull(responsibilities.completedAt),
            ),
          )
          .orderBy(
            asc(responsibilities.dueDate),
            asc(responsibilities.dueTime),
            asc(responsibilities.createdAt),
          )
          .limit(50),
      ]);

    const assignments = await loadEffectiveAssignmentMap({
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
          ? `${morningName} → ${afternoonName}`
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

    const allEventItems = [...eventItems, ...handoverItems].sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        (a.time ?? "00:00").localeCompare(b.time ?? "00:00") ||
        a.title.localeCompare(b.title),
    );

    const responsibilityItems = responsibilityRows
      .map((item) => ({
        id: item.id,
        title: item.title,
        date: item.dueDate,
        time: item.dueTime?.slice(0, 5) ?? null,
        overdue: item.dueDate < today,
        href: `/responsibilities#record-${encodeURIComponent(item.id)}`,
      }))
      .slice(0, 2);

    const expenseItems = expenseRows
      .map((item) => ({
        id: item.id,
        title: item.title,
        amountCents: item.amountCents,
        dueDate: item.dueDate,
        overdue: Boolean(item.dueDate && item.dueDate < today),
        href: `/expenses#record-${encodeURIComponent(item.id)}`,
      }))
      .sort(
        (a, b) =>
          (a.dueDate ?? "9999-12-31").localeCompare(b.dueDate ?? "9999-12-31") ||
          a.title.localeCompare(b.title),
      )
      .slice(0, 2);

    return NextResponse.json(
      {
        organiser: {
          responsibilities: responsibilityItems,
          responsibilityTotal: responsibilityRows.length,
          expenses: expenseItems,
          expenseTotal: expenseRows.length,
        },
        items: allEventItems.slice(0, 3),
        total: allEventItems.length,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Workspace context is unavailable." },
      { status: 500 },
    );
  }
}
