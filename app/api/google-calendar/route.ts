import { after, NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { and, count, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb, getSql } from "@/lib/db";
import { calendarSyncJobs, googleCalendarConnections } from "@/lib/db/schema";
import { isGoogleCalendarConfigured } from "@/lib/google-calendar/config";
import { processDueGoogleSyncJobs } from "@/lib/google-calendar/queue";
import { deleteGeneratedGoogleCalendar } from "@/lib/google-calendar/sync";
import { revokeConnectionToken } from "@/lib/google-calendar/tokens";
import { isSameOriginMutation } from "@/lib/security/request";
import { getCalendarSession } from "@/lib/security/session";

const settingsSchema = z.object({
  syncParenting: z.boolean(),
  syncHandovers: z.boolean(),
  syncSharedEvents: z.boolean(),
  syncLocations: z.boolean(),
  syncSharedNotes: z.boolean(),
  parentLabelMode: z.enum(["names", "neutral"]),
});
const disconnectSchema = z.object({ deleteCalendar: z.boolean() });

async function currentConnection(membershipId: string) {
  const rows = await getDb()
    .select()
    .from(googleCalendarConnections)
    .where(eq(googleCalendarConnections.membershipId, membershipId))
    .limit(1);
  return rows[0] ?? null;
}

export async function GET() {
  const session = await getCalendarSession();
  if (!session) {
    return NextResponse.json({ error: "Calendar access is required." }, { status: 401 });
  }

  const connection = await currentConnection(session.membershipId);
  if (!connection) {
    return NextResponse.json({
      configured: isGoogleCalendarConfigured(),
      connection: null,
    });
  }

  const pendingRows = await getDb()
    .select({ value: count() })
    .from(calendarSyncJobs)
    .where(
      and(
        eq(calendarSyncJobs.connectionId, connection.id),
        inArray(calendarSyncJobs.status, ["pending", "processing", "retry", "failed"]),
      ),
    );

  return NextResponse.json({
    configured: isGoogleCalendarConfigured(),
    connection: {
      status: connection.status,
      syncParenting: connection.syncParenting,
      syncHandovers: connection.syncHandovers,
      syncSharedEvents: connection.syncSharedEvents,
      syncLocations: connection.syncLocations,
      syncSharedNotes: connection.syncSharedNotes,
      parentLabelMode: connection.parentLabelMode,
      lastSuccessfulSyncAt: connection.lastSuccessfulSyncAt,
      lastAttemptedSyncAt: connection.lastAttemptedSyncAt,
      pendingOrFailedCount: pendingRows[0]?.value ?? 0,
      hasGeneratedCalendar: Boolean(connection.googleCalendarId),
    },
  });
}

export async function PATCH(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ error: "This request was blocked for safety." }, { status: 403 });
  }
  const session = await getCalendarSession();
  if (!session) {
    return NextResponse.json({ error: "Calendar access is required." }, { status: 401 });
  }
  const parsed = settingsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Choose valid sync settings." }, { status: 400 });
  }
  const connection = await currentConnection(session.membershipId);
  if (!connection) {
    return NextResponse.json({ error: "Google Calendar is not connected." }, { status: 404 });
  }

  const beforeState = JSON.stringify({
    syncParenting: connection.syncParenting,
    syncHandovers: connection.syncHandovers,
    syncSharedEvents: connection.syncSharedEvents,
    syncLocations: connection.syncLocations,
    syncSharedNotes: connection.syncSharedNotes,
    parentLabelMode: connection.parentLabelMode,
  });
  const afterState = JSON.stringify(parsed.data);
  const sql = getSql();

  await sql.transaction([
    sql`
      UPDATE google_calendar_connections
      SET
        sync_parenting = ${parsed.data.syncParenting},
        sync_handovers = ${parsed.data.syncHandovers},
        sync_shared_events = ${parsed.data.syncSharedEvents},
        sync_locations = ${parsed.data.syncLocations},
        sync_shared_notes = ${parsed.data.syncSharedNotes},
        parent_label_mode = ${parsed.data.parentLabelMode},
        updated_at = now()
      WHERE id = ${connection.id} AND membership_id = ${session.membershipId}
    `,
    sql`
      INSERT INTO calendar_sync_jobs (connection_id, calendar_id, job_type, status, available_at)
      VALUES (${connection.id}, ${session.calendarId}, 'full', 'pending', now())
    `,
    sql`
      INSERT INTO audit_log (
        calendar_id, actor_participant_id, action, entity_type, entity_id, before_state, after_state
      )
      VALUES (
        ${session.calendarId},
        ${session.participantId},
        'google.settings_update',
        'google_calendar_connection',
        ${connection.id},
        ${beforeState}::jsonb,
        ${afterState}::jsonb
      )
    `,
  ]);

  after(async () => {
    await processDueGoogleSyncJobs({ connectionId: connection.id, limit: 2 });
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ error: "This request was blocked for safety." }, { status: 403 });
  }
  const session = await getCalendarSession();
  if (!session) {
    return NextResponse.json({ error: "Calendar access is required." }, { status: 401 });
  }
  const parsed = disconnectSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Choose how to disconnect Google Calendar." }, { status: 400 });
  }

  const connection = await currentConnection(session.membershipId);
  if (!connection) return NextResponse.json({ ok: true });

  if (parsed.data.deleteCalendar) {
    if (!isGoogleCalendarConfigured()) {
      return NextResponse.json(
        { error: "Google Calendar must be configured before the generated calendar can be removed." },
        { status: 503 },
      );
    }
    try {
      await deleteGeneratedGoogleCalendar(connection);
    } catch {
      return NextResponse.json(
        { error: "The generated Google calendar could not be removed. Reconnect Google Calendar and try again." },
        { status: 409 },
      );
    }
  } else if (isGoogleCalendarConfigured()) {
    await revokeConnectionToken(connection);
  }

  const sql = getSql();
  await sql.transaction([
    sql`DELETE FROM google_calendar_connections WHERE id = ${connection.id} AND membership_id = ${session.membershipId}`,
    sql`
      INSERT INTO audit_log (
        calendar_id, actor_participant_id, action, entity_type, entity_id, after_state
      )
      VALUES (
        ${session.calendarId},
        ${session.participantId},
        'google.disconnect',
        'google_calendar_connection',
        ${connection.id},
        ${JSON.stringify({ deletedGoogleCalendar: parsed.data.deleteCalendar })}::jsonb
      )
    `,
  ]);

  return NextResponse.json({ ok: true });
}
