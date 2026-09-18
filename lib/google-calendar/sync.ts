import { createHash } from "node:crypto";
import { addMonths, format, subDays } from "date-fns";
import { and, asc, eq, gte, isNotNull, isNull, lte, ne, or } from "drizzle-orm";
import { loadEffectiveAssignmentMap } from "@/lib/assignments/effective";
import { getDb } from "@/lib/db";
import { expandEventOccurrences } from "@/lib/events/recurrence";
import {
  calendars,
  children,
  events,
  googleCalendarConnections,
  googleEventLinks,
  participants,
} from "@/lib/db/schema";
import {
  GOOGLE_SYNC_FUTURE_MONTHS,
  GOOGLE_SYNC_PAST_DAYS,
} from "@/lib/google-calendar/config";
import {
  createSecondaryCalendar,
  deleteManagedEvent,
  GoogleApiError,
  updateSecondaryCalendar,
  upsertManagedEvent,
} from "@/lib/google-calendar/google-api";
import {
  buildDesiredGoogleEvents,
  googleEventIdForLocalKey,
  type DesiredGoogleEvent,
} from "@/lib/google-calendar/mapping";
import {
  type GoogleConnection,
  withGoogleAccess,
} from "@/lib/google-calendar/tokens";

function syncHorizon() {
  const today = new Date();
  return {
    from: format(subDays(today, GOOGLE_SYNC_PAST_DAYS), "yyyy-MM-dd"),
    to: format(addMonths(today, GOOGLE_SYNC_FUTURE_MONTHS), "yyyy-MM-dd"),
  };
}

function contentHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}


async function ensureGeneratedCalendar(
  connection: GoogleConnection,
  calendar: { name: string; timezone: string },
) {
  const summary = `Covie — ${calendar.name}`;
  if (connection.googleCalendarId) {
    try {
      await withGoogleAccess(connection, (accessToken) =>
        updateSecondaryCalendar(accessToken, connection.googleCalendarId!, {
          summary,
          timeZone: calendar.timezone,
        }),
      );
      return { connection, recreated: false };
    } catch (error) {
      if (!(error instanceof GoogleApiError) || error.status !== 404) throw error;
    }
  }

  const created = await withGoogleAccess(connection, (accessToken) =>
    createSecondaryCalendar(accessToken, { summary, timeZone: calendar.timezone }),
  );
  const db = getDb();
  await db
    .update(googleCalendarConnections)
    .set({
      googleCalendarId: created.id,
      googleCalendarName: summary,
      status: "initial_sync",
      lastError: null,
      updatedAt: new Date(),
    })
    .where(eq(googleCalendarConnections.id, connection.id));
  await db.delete(googleEventLinks).where(eq(googleEventLinks.connectionId, connection.id));

  return {
    connection: {
      ...connection,
      googleCalendarId: created.id,
      googleCalendarName: summary,
      status: "initial_sync" as const,
    },
    recreated: true,
  };
}

async function loadCalendar(connection: GoogleConnection) {
  const rows = await getDb()
    .select({ name: calendars.name, timezone: calendars.timezone })
    .from(calendars)
    .where(eq(calendars.id, connection.calendarId))
    .limit(1);
  const calendar = rows[0];
  if (!calendar) throw new Error("Calendar no longer exists.");
  return calendar;
}

async function loadDesired(
  connection: GoogleConnection,
  calendar: { name: string; timezone: string },
  dates: { from: string; to: string },
) {
  const db = getDb();
  const [parentRows, childRows, eventRows] = await db.batch([
    db
      .select({ id: participants.id, displayName: participants.displayName })
      .from(participants)
      .where(and(eq(participants.calendarId, connection.calendarId), eq(participants.active, true)))
      .orderBy(asc(participants.createdAt)),
    db
      .select({ id: children.id, displayName: children.displayName })
      .from(children)
      .where(and(eq(children.calendarId, connection.calendarId), eq(children.active, true)))
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
          eq(events.calendarId, connection.calendarId),
          lte(events.startDate, dates.to),
          or(
            and(
              eq(events.recurrence, "none"),
              or(
                gte(events.startDate, dates.from),
                and(isNotNull(events.endDate), gte(events.endDate, dates.from)),
              ),
            ),
            and(
              ne(events.recurrence, "none"),
              or(isNull(events.recurrenceEndDate), gte(events.recurrenceEndDate, dates.from)),
            ),
          ),
        ),
      )
      .orderBy(asc(events.startDate)),
  ]);

  const childIds = childRows.map((child) => child.id);
  const assignmentMap = await loadEffectiveAssignmentMap({
    calendarId: connection.calendarId,
    childIds,
    from: dates.from,
    to: dates.to,
  });

  return buildDesiredGoogleEvents({
    parents: parentRows,
    children: childRows,
    assignments: [...assignmentMap.values()],
    events: expandEventOccurrences({
      events: eventRows,
      from: dates.from,
      to: dates.to,
    }),
    settings: {
      syncParenting: connection.syncParenting,
      syncHandovers: connection.syncHandovers,
      syncSharedEvents: connection.syncSharedEvents,
      syncLocations: connection.syncLocations,
      syncSharedNotes: connection.syncSharedNotes,
      parentLabelMode: connection.parentLabelMode,
    },
    timeZone: calendar.timezone,
  });
}

async function loadLinks(connectionId: string, from: string, to: string) {
  return getDb()
    .select()
    .from(googleEventLinks)
    .where(
      and(
        eq(googleEventLinks.connectionId, connectionId),
        lte(googleEventLinks.rangeStart, to),
        gte(googleEventLinks.rangeEnd, from),
      ),
    );
}

function managedBody(connectionId: string, desired: DesiredGoogleEvent) {
  return {
    ...desired.body,
    extendedProperties: {
      private: {
        coparentManaged: "1",
        coparentConnection: connectionId,
        coparentKey: desired.localKey,
      },
    },
  };
}

export async function syncGoogleConnection(input: {
  connectionId: string;
  rangeStart?: string | null;
  rangeEnd?: string | null;
  force?: boolean;
}) {
  const db = getDb();
  const connectionRows = await db
    .select()
    .from(googleCalendarConnections)
    .where(eq(googleCalendarConnections.id, input.connectionId))
    .limit(1);
  let connection = connectionRows[0];
  if (!connection) return { created: 0, updated: 0, deleted: 0, skipped: 0 };

  const calendar = await loadCalendar(connection);
  const horizon = syncHorizon();

  if (
    !input.force &&
    input.rangeStart &&
    input.rangeEnd &&
    (input.rangeEnd < horizon.from || input.rangeStart > horizon.to)
  ) {
    return { created: 0, updated: 0, deleted: 0, skipped: 0 };
  }

  const ensured = await ensureGeneratedCalendar(connection, calendar);
  connection = ensured.connection;
  if (!connection.googleCalendarId) throw new Error("Google calendar could not be created.");

  const force = Boolean(input.force || ensured.recreated);
  let targetStart = force ? horizon.from : input.rangeStart ?? horizon.from;
  let targetEnd = force ? horizon.to : input.rangeEnd ?? horizon.to;
  targetStart = targetStart < horizon.from ? horizon.from : targetStart;
  targetEnd = targetEnd > horizon.to ? horizon.to : targetEnd;

  let links = await loadLinks(connection.id, targetStart, targetEnd);

  if (!force) {
    const parentingLinks = links.filter((link) => link.eventKind === "parenting");
    for (const link of parentingLinks) {
      if (link.rangeStart < targetStart) targetStart = link.rangeStart;
      if (link.rangeEnd > targetEnd) targetEnd = link.rangeEnd;
    }
    targetStart = targetStart < horizon.from ? horizon.from : targetStart;
    targetEnd = targetEnd > horizon.to ? horizon.to : targetEnd;
    links = await loadLinks(connection.id, targetStart, targetEnd);
  }

  const desired = await loadDesired(connection, calendar, {
    from: targetStart,
    to: targetEnd,
  });
  const desiredKeys = new Set(desired.map((item) => item.localKey));
  const linkByKey = new Map(links.map((link) => [link.localKey, link]));
  let created = 0;
  let updated = 0;
  let deleted = 0;
  let skipped = 0;

  for (const item of desired) {
    const body = managedBody(connection.id, item);
    const hash = contentHash(body);
    const existing = linkByKey.get(item.localKey);
    if (existing && existing.contentHash === hash && !force) {
      skipped += 1;
      continue;
    }

    const eventId =
      existing?.googleEventId ?? googleEventIdForLocalKey(connection.id, item.localKey);
    await withGoogleAccess(connection, (accessToken) =>
      upsertManagedEvent(
        accessToken,
        connection.googleCalendarId!,
        eventId,
        body,
        Boolean(existing),
      ),
    );
    await db
      .insert(googleEventLinks)
      .values({
        connectionId: connection.id,
        localKey: item.localKey,
        googleEventId: eventId,
        eventKind: item.kind,
        localEntityId: item.localEntityId,
        rangeStart: item.rangeStart,
        rangeEnd: item.rangeEnd,
        contentHash: hash,
      })
      .onConflictDoUpdate({
        target: [googleEventLinks.connectionId, googleEventLinks.localKey],
        set: {
          googleEventId: eventId,
          eventKind: item.kind,
          localEntityId: item.localEntityId,
          rangeStart: item.rangeStart,
          rangeEnd: item.rangeEnd,
          contentHash: hash,
          updatedAt: new Date(),
        },
      });
    if (existing) updated += 1;
    else created += 1;
  }

  for (const link of links) {
    if (desiredKeys.has(link.localKey)) continue;
    await withGoogleAccess(connection, (accessToken) =>
      deleteManagedEvent(accessToken, connection.googleCalendarId!, link.googleEventId),
    );
    await db.delete(googleEventLinks).where(eq(googleEventLinks.id, link.id));
    deleted += 1;
  }

  const now = new Date();
  await db
    .update(googleCalendarConnections)
    .set({
      status: "active",
      googleCalendarName: `Covie — ${calendar.name}`,
      lastAttemptedSyncAt: now,
      lastSuccessfulSyncAt: now,
      lastError: null,
      updatedAt: now,
    })
    .where(eq(googleCalendarConnections.id, connection.id));

  return { created, updated, deleted, skipped };
}

export async function deleteGeneratedGoogleCalendar(connection: GoogleConnection) {
  if (!connection.googleCalendarId) return;
  const { deleteSecondaryCalendar } = await import("@/lib/google-calendar/google-api");
  await withGoogleAccess(connection, (accessToken) =>
    deleteSecondaryCalendar(accessToken, connection.googleCalendarId!),
  );
}
