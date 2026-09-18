import { after, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { getDb, getSql } from "@/lib/db";
import { calendars, googleCalendarConnections } from "@/lib/db/schema";
import { getGoogleCalendarConfig } from "@/lib/google-calendar/config";
import { encryptGoogleSecret } from "@/lib/google-calendar/crypto";
import { createSecondaryCalendar, exchangeAuthorizationCode } from "@/lib/google-calendar/google-api";
import { GOOGLE_OAUTH_COOKIE, readGoogleOAuthState } from "@/lib/google-calendar/oauth";
import { processDueGoogleSyncJobs } from "@/lib/google-calendar/queue";
import { getCalendarSession } from "@/lib/security/session";

function redirect(status: string) {
  const config = getGoogleCalendarConfig();
  const response = NextResponse.redirect(
    new URL(`/calendar?google=${encodeURIComponent(status)}`, config.appUrl),
  );
  response.cookies.set(GOOGLE_OAUTH_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/google-calendar",
    maxAge: 0,
  });
  return response;
}

export async function GET(request: Request) {
  const config = getGoogleCalendarConfig();
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  if (url.searchParams.get("error")) return redirect("cancelled");
  if (!code || !returnedState) return redirect("error");

  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(GOOGLE_OAUTH_COOKIE)?.value;
  if (!cookieValue) return redirect("expired");

  let state: ReturnType<typeof readGoogleOAuthState>;
  try {
    state = readGoogleOAuthState(cookieValue);
  } catch {
    return redirect("expired");
  }
  if (state.state !== returnedState) return redirect("error");

  const session = await getCalendarSession();
  if (
    !session ||
    session.membershipId !== state.membershipId ||
    session.calendarId !== state.calendarId
  ) {
    return redirect("error");
  }

  try {
    const token = await exchangeAuthorizationCode(config, code, state.verifier);
    const db = getDb();
    const existingRows = await db
      .select()
      .from(googleCalendarConnections)
      .where(eq(googleCalendarConnections.membershipId, session.membershipId))
      .limit(1);
    const existing = existingRows[0] ?? null;
    const refreshTokenEncrypted = token.refresh_token
      ? encryptGoogleSecret(token.refresh_token, config.encryptionKey)
      : existing?.refreshTokenEncrypted ?? null;
    if (!refreshTokenEncrypted) return redirect("reconnect_required");

    const values = {
      calendarId: session.calendarId,
      membershipId: session.membershipId,
      accessTokenEncrypted: encryptGoogleSecret(token.access_token, config.encryptionKey),
      refreshTokenEncrypted,
      tokenExpiresAt: new Date(Date.now() + Math.max(60, token.expires_in) * 1000),
      scope: token.scope ?? null,
      status: "initial_sync" as const,
      lastError: null,
      updatedAt: new Date(),
    };
    const connectionRows = await db
      .insert(googleCalendarConnections)
      .values(values)
      .onConflictDoUpdate({
        target: googleCalendarConnections.membershipId,
        set: values,
      })
      .returning();
    let connection = connectionRows[0];
    if (!connection) return redirect("error");

    const calendarRows = await db
      .select({ name: calendars.name, timezone: calendars.timezone })
      .from(calendars)
      .where(eq(calendars.id, session.calendarId))
      .limit(1);
    const calendar = calendarRows[0];
    if (!calendar) return redirect("error");

    if (!connection.googleCalendarId) {
      const summary = `Covie — ${calendar.name}`;
      const created = await createSecondaryCalendar(token.access_token, {
        summary,
        timeZone: calendar.timezone,
      });
      const updatedRows = await db
        .update(googleCalendarConnections)
        .set({
          googleCalendarId: created.id,
          googleCalendarName: summary,
          updatedAt: new Date(),
        })
        .where(eq(googleCalendarConnections.id, connection.id))
        .returning();
      connection =
        updatedRows[0] ??
        { ...connection, googleCalendarId: created.id, googleCalendarName: summary };
    }

    const sql = getSql();
    await sql.transaction([
      sql`
        INSERT INTO calendar_sync_jobs (connection_id, calendar_id, job_type, status, available_at)
        VALUES (${connection.id}, ${session.calendarId}, 'full', 'pending', now())
      `,
      sql`
        INSERT INTO audit_log (
          calendar_id, actor_participant_id, action, entity_type, entity_id, after_state
        )
        VALUES (
          ${session.calendarId},
          ${session.participantId},
          'google.connect',
          'google_calendar_connection',
          ${connection.id},
          ${JSON.stringify({ status: "initial_sync" })}::jsonb
        )
      `,
    ]);

    after(async () => {
      try {
        await processDueGoogleSyncJobs({ connectionId: connection.id, limit: 2 });
      } catch {}
    });
    return redirect("connected");
  } catch {
    return redirect("error");
  }
}
