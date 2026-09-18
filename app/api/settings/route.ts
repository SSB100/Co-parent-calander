import { and, asc, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, getSql } from "@/lib/db";
import { calendars, children, participants } from "@/lib/db/schema";
import { buildCalendarSyncJobStatement } from "@/lib/google-calendar/outbox";
import { kickGoogleCalendarSync } from "@/lib/google-calendar/dispatch";
import { isSameOriginMutation } from "@/lib/security/request";
import { getCalendarSession, getEditorSession } from "@/lib/security/session";

const namedItem = z.object({
  id: z.string().uuid(),
  displayName: z.string().trim().min(1, "Names cannot be blank.").max(50, "Keep names under 50 characters."),
});

const settingsSchema = z.object({
  calendarName: z.string().trim().min(1, "Add a calendar name.").max(80, "Keep the calendar name under 80 characters."),
  parents: z.array(namedItem).min(1).max(2),
  children: z.array(namedItem).min(1).max(10),
});

export async function GET() {
  const session = await getCalendarSession();
  if (!session) {
    return NextResponse.json({ error: "Calendar access is required." }, { status: 401 });
  }

  const db = getDb();
  const [calendarRows, parentRows, childRows] = await db.batch([
    db
      .select({ id: calendars.id, name: calendars.name, timezone: calendars.timezone })
      .from(calendars)
      .where(eq(calendars.id, session.calendarId))
      .limit(1),
    db
      .select({ id: participants.id, displayName: participants.displayName })
      .from(participants)
      .where(and(eq(participants.calendarId, session.calendarId), eq(participants.active, true)))
      .orderBy(asc(participants.createdAt)),
    db
      .select({ id: children.id, displayName: children.displayName })
      .from(children)
      .where(and(eq(children.calendarId, session.calendarId), eq(children.active, true)))
      .orderBy(asc(children.createdAt)),
  ]);

  const calendar = calendarRows[0];
  if (!calendar) {
    return NextResponse.json({ error: "Calendar not found." }, { status: 404 });
  }

  return NextResponse.json({ calendar, parents: parentRows, children: childRows });
}

export async function PATCH(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ error: "This request was blocked for safety." }, { status: 403 });
  }

  const session = await getEditorSession();
  if (!session) {
    return NextResponse.json({ error: "Editor access is required." }, { status: 401 });
  }

  const parsed = settingsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Choose valid settings." }, { status: 400 });
  }

  const db = getDb();
  const [calendarRows, existingParents, existingChildren] = await db.batch([
    db
      .select({ id: calendars.id, name: calendars.name })
      .from(calendars)
      .where(eq(calendars.id, session.calendarId))
      .limit(1),
    db
      .select({ id: participants.id, displayName: participants.displayName })
      .from(participants)
      .where(and(eq(participants.calendarId, session.calendarId), eq(participants.active, true))),
    db
      .select({ id: children.id, displayName: children.displayName })
      .from(children)
      .where(and(eq(children.calendarId, session.calendarId), eq(children.active, true))),
  ]);

  if (!calendarRows[0]) {
    return NextResponse.json({ error: "Calendar not found." }, { status: 404 });
  }

  const parentIds = new Set(existingParents.map((item) => item.id));
  const childIds = new Set(existingChildren.map((item) => item.id));
  if (
    parsed.data.parents.length !== existingParents.length ||
    parsed.data.children.length !== existingChildren.length ||
    parsed.data.parents.some((item) => !parentIds.has(item.id)) ||
    parsed.data.children.some((item) => !childIds.has(item.id))
  ) {
    return NextResponse.json({ error: "The family members changed. Refresh settings and try again." }, { status: 409 });
  }

  if (new Set(parsed.data.parents.map((item) => item.displayName.toLowerCase())).size !== parsed.data.parents.length) {
    return NextResponse.json({ error: "Use a different display name for each parent." }, { status: 400 });
  }

  const sql = getSql();
  const statements = [
    sql`UPDATE calendars SET name = ${parsed.data.calendarName}, updated_at = now() WHERE id = ${session.calendarId}`,
  ];

  for (const parent of parsed.data.parents) {
    statements.push(sql`
      UPDATE participants
      SET display_name = ${parent.displayName}, updated_at = now()
      WHERE id = ${parent.id} AND calendar_id = ${session.calendarId}
    `);
  }

  for (const child of parsed.data.children) {
    statements.push(sql`
      UPDATE children
      SET display_name = ${child.displayName}, updated_at = now()
      WHERE id = ${child.id} AND calendar_id = ${session.calendarId}
    `);
  }

  const beforeState = JSON.stringify({
    calendarName: calendarRows[0].name,
    parents: existingParents,
    children: existingChildren,
  });
  const afterState = JSON.stringify(parsed.data);

  statements.push(sql`
    INSERT INTO audit_log (calendar_id, actor_participant_id, action, entity_type, before_state, after_state)
    VALUES (${session.calendarId}, ${session.participantId}, 'settings.update', 'calendar_settings', ${beforeState}::jsonb, ${afterState}::jsonb)
  `);

  statements.push(
    buildCalendarSyncJobStatement(sql, {
      calendarId: session.calendarId,
      jobType: "full",
    }),
  );

  try {
    await sql.transaction(statements);
  } catch {
    return NextResponse.json({ error: "Settings could not be saved." }, { status: 409 });
  }

  kickGoogleCalendarSync(session.calendarId);
  return NextResponse.json({ ok: true });
}
