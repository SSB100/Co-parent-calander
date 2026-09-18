import { after, NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, getSql } from "@/lib/db";
import { googleCalendarConnections } from "@/lib/db/schema";
import { processDueGoogleSyncJobs } from "@/lib/google-calendar/queue";
import { isSameOriginMutation } from "@/lib/security/request";
import { getCalendarSession } from "@/lib/security/session";

export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ error: "This request was blocked for safety." }, { status: 403 });
  }
  const session = await getCalendarSession();
  if (!session) {
    return NextResponse.json({ error: "Calendar access is required." }, { status: 401 });
  }

  const rows = await getDb()
    .select({ id: googleCalendarConnections.id, status: googleCalendarConnections.status })
    .from(googleCalendarConnections)
    .where(eq(googleCalendarConnections.membershipId, session.membershipId))
    .limit(1);
  const connection = rows[0];
  if (!connection) {
    return NextResponse.json({ error: "Google Calendar is not connected." }, { status: 404 });
  }
  if (connection.status === "reconnect_required") {
    return NextResponse.json(
      { error: "Reconnect Google Calendar before syncing again." },
      { status: 409 },
    );
  }

  const sql = getSql();
  await sql.transaction([
    sql`
      INSERT INTO calendar_sync_jobs (connection_id, calendar_id, job_type, status, available_at)
      VALUES (${connection.id}, ${session.calendarId}, 'reconcile', 'pending', now())
    `,
    sql`
      INSERT INTO audit_log (
        calendar_id, actor_participant_id, action, entity_type, entity_id, after_state
      )
      VALUES (
        ${session.calendarId},
        ${session.participantId},
        'google.sync_requested',
        'google_calendar_connection',
        ${connection.id},
        '{"manual":true}'::jsonb
      )
    `,
  ]);

  after(async () => {
    try {
      await processDueGoogleSyncJobs({ connectionId: connection.id, limit: 4 });
    } catch {}
  });
  return NextResponse.json({ ok: true });
}
