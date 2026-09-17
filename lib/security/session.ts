import { and, asc, eq, gt, isNull } from "drizzle-orm";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { calendarMemberships, participants, sessions } from "@/lib/db/schema";
import { generateSecureToken, hashToken } from "@/lib/security/tokens";

export const SESSION_COOKIE_NAME = "coparent_session";
export const SELECTED_CALENDAR_COOKIE_NAME = "coparent_calendar";
const SESSION_DAYS = 30;

export function sessionCookieOptions(expires: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires,
  };
}

export async function createEditorSessionRecord(input: {
  calendarId: string;
  participantId: string;
}) {
  const token = generateSecureToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  const db = getDb();
  await db.insert(sessions).values({
    calendarId: input.calendarId,
    participantId: input.participantId,
    tokenHash,
    expiresAt,
  });

  return { token, expiresAt };
}

export async function getLegacyEditorSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const tokenHash = hashToken(token);
  const db = getDb();
  const rows = await db
    .select({
      sessionId: sessions.id,
      participantId: participants.id,
      calendarId: participants.calendarId,
      displayName: participants.displayName,
      colorKey: participants.colorKey,
    })
    .from(sessions)
    .innerJoin(participants, eq(sessions.participantId, participants.id))
    .where(
      and(
        eq(sessions.tokenHash, tokenHash),
        eq(sessions.calendarId, participants.calendarId),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, new Date()),
        eq(participants.active, true),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}

export async function getCalendarSession() {
  const { data: accountSession } = await auth.getSession();
  if (!accountSession?.user) return null;

  const cookieStore = await cookies();
  const selectedCalendarId = cookieStore.get(SELECTED_CALENDAR_COOKIE_NAME)?.value;
  const db = getDb();
  const conditions = [eq(calendarMemberships.userId, accountSession.user.id)];

  if (selectedCalendarId) {
    conditions.push(eq(calendarMemberships.calendarId, selectedCalendarId));
  }

  const rows = await db
    .select({
      membershipId: calendarMemberships.id,
      calendarId: calendarMemberships.calendarId,
      participantId: calendarMemberships.participantId,
      permission: calendarMemberships.permission,
      displayName: participants.displayName,
      colorKey: participants.colorKey,
    })
    .from(calendarMemberships)
    .leftJoin(participants, eq(calendarMemberships.participantId, participants.id))
    .where(and(...conditions))
    .orderBy(asc(calendarMemberships.createdAt))
    .limit(1);

  const membership = rows[0];
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

export async function claimLegacyCalendarForCurrentUser() {
  const [{ data: accountSession }, legacySession] = await Promise.all([
    auth.getSession(),
    getLegacyEditorSession(),
  ]);
  if (!accountSession?.user || !legacySession) return null;

  const db = getDb();
  const existing = await db
    .select({ calendarId: calendarMemberships.calendarId })
    .from(calendarMemberships)
    .where(
      and(
        eq(calendarMemberships.calendarId, legacySession.calendarId),
        eq(calendarMemberships.userId, accountSession.user.id),
      ),
    )
    .limit(1);
  if (existing[0]) return existing[0].calendarId;

  const calendarMembers = await db
    .select({ id: calendarMemberships.id })
    .from(calendarMemberships)
    .where(eq(calendarMemberships.calendarId, legacySession.calendarId))
    .limit(1);

  await db
    .insert(calendarMemberships)
    .values({
      calendarId: legacySession.calendarId,
      userId: accountSession.user.id,
      participantId: legacySession.participantId,
      permission: calendarMembers.length === 0 ? "owner" : "editor",
    })
    .onConflictDoNothing();

  return legacySession.calendarId;
}
