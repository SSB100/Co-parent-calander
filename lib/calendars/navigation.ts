import { asc, eq } from "drizzle-orm";
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

export async function listCalendarNavigationOptions(
  userId: string,
): Promise<CalendarNavigationOption[]> {
  const db = getDb();

  return db
    .select({
      id: calendars.id,
      name: calendars.name,
      calendarType: calendars.type,
      permission: calendarMemberships.permission,
      displayName: participants.displayName,
    })
    .from(calendarMemberships)
    .innerJoin(calendars, eq(calendarMemberships.calendarId, calendars.id))
    .leftJoin(
      participants,
      eq(calendarMemberships.participantId, participants.id),
    )
    .where(eq(calendarMemberships.userId, userId))
    .orderBy(asc(calendarMemberships.createdAt));
}
