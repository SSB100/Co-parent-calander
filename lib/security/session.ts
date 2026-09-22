import { and, asc, eq, isNull } from "drizzle-orm";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { calendars, calendarMemberships, participants } from "@/lib/db/schema";

export const SELECTED_CALENDAR_COOKIE_NAME = "coparent_calendar";

async function membershipForUser(userId: string, calendarId?: string) {
  const db = getDb();
  const conditions = [
    eq(calendarMemberships.userId, userId),
    isNull(calendars.archivedAt),
  ];

  if (calendarId) {
    conditions.push(eq(calendarMemberships.calendarId, calendarId));
  }

  const rows = await db
    .select({
      membershipId: calendarMemberships.id,
      calendarId: calendarMemberships.calendarId,
      calendarName: calendars.name,
      calendarType: calendars.type,
      calendarTimezone: calendars.timezone,
      participantId: calendarMemberships.participantId,
      permission: calendarMemberships.permission,
      displayName: participants.displayName,
      colorKey: participants.colorKey,
      profileSlot: participants.profileSlot,
    })
    .from(calendarMemberships)
    .innerJoin(calendars, eq(calendarMemberships.calendarId, calendars.id))
    .leftJoin(participants, eq(calendarMemberships.participantId, participants.id))
    .where(and(...conditions))
    .orderBy(asc(calendarMemberships.createdAt))
    .limit(1);

  return rows[0] ?? null;
}

export async function getCalendarSession() {
  const { data: accountSession } = await auth.getSession();
  if (!accountSession?.user) return null;

  const cookieStore = await cookies();
  const selectedCalendarId = cookieStore.get(SELECTED_CALENDAR_COOKIE_NAME)?.value;

  const selectedMembership = selectedCalendarId
    ? await membershipForUser(accountSession.user.id, selectedCalendarId)
    : null;
  const membership =
    selectedMembership ?? (await membershipForUser(accountSession.user.id));

  if (!membership) return null;

  return {
    ...membership,
    userId: accountSession.user.id,
    userName: accountSession.user.name,
    userEmail: accountSession.user.email,
  };
}

export async function getEditorSession() {
  const session = await getCalendarSession();
  if (!session || session.permission === "viewer" || !session.participantId) return null;
  return { ...session, participantId: session.participantId };
}

export async function getOwnerSession() {
  const session = await getCalendarSession();
  return session?.permission === "owner" ? session : null;
}
