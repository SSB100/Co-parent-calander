import { and, eq, gt, isNull, or } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { accessTokens, participants } from "@/lib/db/schema";
import {
  createEditorSessionRecord,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from "@/lib/security/session";
import { hashToken, looksLikeSecureToken } from "@/lib/security/tokens";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const invalidUrl = new URL("/?access=invalid", request.url);

  if (!looksLikeSecureToken(token)) {
    return NextResponse.redirect(invalidUrl);
  }

  const tokenHash = hashToken(token);
  const db = getDb();
  const now = new Date();

  const matches = await db
    .select({
      accessTokenId: accessTokens.id,
      calendarId: accessTokens.calendarId,
      participantId: accessTokens.participantId,
      colorKey: participants.colorKey,
    })
    .from(accessTokens)
    .innerJoin(participants, eq(accessTokens.participantId, participants.id))
    .where(
      and(
        eq(accessTokens.tokenHash, tokenHash),
        eq(accessTokens.type, "editor"),
        eq(accessTokens.calendarId, participants.calendarId),
        eq(participants.active, true),
        isNull(accessTokens.revokedAt),
        or(isNull(accessTokens.expiresAt), gt(accessTokens.expiresAt, now)),
      ),
    )
    .limit(1);

  const match = matches[0];
  if (!match?.participantId) {
    return NextResponse.redirect(invalidUrl);
  }

  const session = await createEditorSessionRecord({
    calendarId: match.calendarId,
    participantId: match.participantId,
  });

  await db
    .update(accessTokens)
    .set({ lastUsedAt: now })
    .where(eq(accessTokens.id, match.accessTokenId));

  const destination = match.colorKey === "setup" ? "/setup" : "/";
  const response = NextResponse.redirect(new URL(destination, request.url));
  response.cookies.set(
    SESSION_COOKIE_NAME,
    session.token,
    sessionCookieOptions(session.expiresAt),
  );

  return response;
}
