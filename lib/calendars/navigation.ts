import { and, asc, eq, isNotNull, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  calendars,
  calendarMemberships,
  participants,
} from "@/lib/db/schema";
import type { CalendarTemplateId } from "@/lib/templates/calendar-templates";

export type CalendarNavigationOption = {
  id: string;
  name: string;
  calendarType: CalendarTemplateId;
  permission: "owner" | "editor" | "viewer";
  displayName: string | null;
};

const navigationSelection = {
  id: calendars.id,
  name: calendars.name,
  calendarType: calendars.type,
  permission: calendarMemberships.permission,
  displayName: participants.displayName,
};

export async function listCalendarNavigationOptions(
  userId: string,
): Promise<CalendarNavigationOption[]> {
  const db = getDb();

  return db
    .select(navigationSelection)
    .from(calendarMemberships)
    .innerJoin(calendars, eq(calendarMemberships.calendarId, calendars.id))
    .leftJoin(
      participants,
      eq(calendarMemberships.participantId, participants.id),
    )
    .where(
      and(
        eq(calendarMemberships.userId, userId),
        isNull(calendars.archivedAt),
      ),
    )
    .orderBy(asc(calendarMemberships.createdAt));
}

export async function listArchivedCalendarNavigationOptions(
  userId: string,
): Promise<CalendarNavigationOption[]> {
  const db = getDb();

  return db
    .select(navigationSelection)
    .from(calendarMemberships)
    .innerJoin(calendars, eq(calendarMemberships.calendarId, calendars.id))
    .leftJoin(
      participants,
      eq(calendarMemberships.participantId, participants.id),
    )
    .where(
      and(
        eq(calendarMemberships.userId, userId),
        eq(calendarMemberships.permission, "owner"),
        isNotNull(calendars.archivedAt),
      ),
    )
    .orderBy(asc(calendarMemberships.createdAt));
}
