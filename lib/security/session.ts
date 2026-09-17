import { and, eq, gt, isNull } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb } from "@/lib/db";
import { participants, sessions } from "@/lib/db/schema";
import { generateSecureToken, hashToken } from "@/lib/security/tokens";

export const SESSION_COOKIE_NAME = "coparent_session";
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

export async function getEditorSession() {
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
