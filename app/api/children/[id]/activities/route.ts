import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  childActivitySchema,
  changedActivityFields,
  type ChildActivityInput,
} from "@/lib/children/profile";
import { getDb, getSql } from "@/lib/db";
import { childActivities, children } from "@/lib/db/schema";
import { isSameOriginMutation } from "@/lib/security/request";
import { getEditorSession } from "@/lib/security/session";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const childIdSchema = z.string().uuid();
const updateSchema = childActivitySchema.safeExtend({ id: z.string().uuid() });
const deleteSchema = z.object({ id: z.string().uuid() });

async function parseChildId(context: RouteContext) {
  const params = await context.params;
  return childIdSchema.safeParse(params.id);
}

async function assertChild(calendarId: string, childId: string) {
  const rows = await getDb()
    .select({ id: children.id })
    .from(children)
    .where(
      and(
        eq(children.id, childId),
        eq(children.calendarId, calendarId),
        eq(children.active, true),
      ),
    )
    .limit(1);
  return Boolean(rows[0]);
}

function activityInput(row: {
  activityName: string;
  organisation: string | null;
  contactName: string | null;
  contactDetails: string | null;
  location: string | null;
  scheduleInfo: string | null;
  notes: string | null;
}): ChildActivityInput {
  return {
    activityName: row.activityName,
    organisation: row.organisation,
    contactName: row.contactName,
    contactDetails: row.contactDetails,
    location: row.location,
    scheduleInfo: row.scheduleInfo,
    notes: row.notes,
  };
}

export async function POST(request: NextRequest, context: RouteContext) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ error: "This request was blocked for safety." }, { status: 403 });
  }
  const session = await getEditorSession();
  if (!session) {
    return NextResponse.json({ error: "Editor access is required." }, { status: 401 });
  }

  const parsedChild = await parseChildId(context);
  if (!parsedChild.success) {
    return NextResponse.json({ error: "Choose a valid child profile." }, { status: 400 });
  }
  if (!(await assertChild(session.calendarId, parsedChild.data))) {
    return NextResponse.json({ error: "Child profile not found." }, { status: 404 });
  }

  const parsed = childActivitySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Check the activity details." },
      { status: 400 },
    );
  }

  const id = randomUUID();
  const sql = getSql();
  try {
    await sql.transaction([
      sql`
        INSERT INTO child_activities (
          id, calendar_id, child_id, activity_name, organisation, contact_name,
          contact_details, location, schedule_info, notes, created_by, updated_at
        )
        VALUES (
          ${id}, ${session.calendarId}, ${parsedChild.data},
          ${parsed.data.activityName}, ${parsed.data.organisation},
          ${parsed.data.contactName}, ${parsed.data.contactDetails},
          ${parsed.data.location}, ${parsed.data.scheduleInfo},
          ${parsed.data.notes}, ${session.participantId}, now()
        )
      `,
      sql`
        INSERT INTO audit_log (
          calendar_id, actor_participant_id, action, entity_type, entity_id, after_state
        )
        VALUES (
          ${session.calendarId}, ${session.participantId},
          'child_activity.create', 'child_activity', ${parsedChild.data},
          ${JSON.stringify({
            activityId: id,
            activityName: parsed.data.activityName,
          })}::jsonb
        )
      `,
    ]);
  } catch {
    return NextResponse.json({ error: "The activity could not be added." }, { status: 409 });
  }

  return NextResponse.json({ ok: true, id });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ error: "This request was blocked for safety." }, { status: 403 });
  }
  const session = await getEditorSession();
  if (!session) {
    return NextResponse.json({ error: "Editor access is required." }, { status: 401 });
  }

  const parsedChild = await parseChildId(context);
  if (!parsedChild.success) {
    return NextResponse.json({ error: "Choose a valid child profile." }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Check the activity details." },
      { status: 400 },
    );
  }

  const db = getDb();
  const existingRows = await db
    .select({
      activityName: childActivities.activityName,
      organisation: childActivities.organisation,
      contactName: childActivities.contactName,
      contactDetails: childActivities.contactDetails,
      location: childActivities.location,
      scheduleInfo: childActivities.scheduleInfo,
      notes: childActivities.notes,
    })
    .from(childActivities)
    .where(
      and(
        eq(childActivities.id, parsed.data.id),
        eq(childActivities.childId, parsedChild.data),
        eq(childActivities.calendarId, session.calendarId),
      ),
    )
    .limit(1);

  const existing = existingRows[0];
  if (!existing) {
    return NextResponse.json({ error: "Activity not found." }, { status: 404 });
  }

  const { id, ...after } = parsed.data;
  const changedFields = changedActivityFields(activityInput(existing), after);
  if (changedFields.length === 0) {
    return NextResponse.json({ ok: true, changedFields: [] });
  }

  const sql = getSql();
  try {
    await sql.transaction([
      sql`
        UPDATE child_activities
        SET
          activity_name = ${after.activityName},
          organisation = ${after.organisation},
          contact_name = ${after.contactName},
          contact_details = ${after.contactDetails},
          location = ${after.location},
          schedule_info = ${after.scheduleInfo},
          notes = ${after.notes},
          updated_at = now()
        WHERE id = ${id}
          AND child_id = ${parsedChild.data}
          AND calendar_id = ${session.calendarId}
      `,
      sql`
        INSERT INTO audit_log (
          calendar_id, actor_participant_id, action, entity_type, entity_id, after_state
        )
        VALUES (
          ${session.calendarId}, ${session.participantId},
          'child_activity.update', 'child_activity', ${parsedChild.data},
          ${JSON.stringify({
            activityId: id,
            activityName: after.activityName,
            changedFields,
          })}::jsonb
        )
      `,
    ]);
  } catch {
    return NextResponse.json({ error: "The activity could not be updated." }, { status: 409 });
  }

  return NextResponse.json({ ok: true, changedFields });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ error: "This request was blocked for safety." }, { status: 403 });
  }
  const session = await getEditorSession();
  if (!session) {
    return NextResponse.json({ error: "Editor access is required." }, { status: 401 });
  }

  const parsedChild = await parseChildId(context);
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsedChild.success || !parsed.success) {
    return NextResponse.json({ error: "Choose a valid activity." }, { status: 400 });
  }

  const db = getDb();
  const existingRows = await db
    .select({ activityName: childActivities.activityName })
    .from(childActivities)
    .where(
      and(
        eq(childActivities.id, parsed.data.id),
        eq(childActivities.childId, parsedChild.data),
        eq(childActivities.calendarId, session.calendarId),
      ),
    )
    .limit(1);

  const existing = existingRows[0];
  if (!existing) {
    return NextResponse.json({ error: "Activity not found." }, { status: 404 });
  }

  const sql = getSql();
  try {
    await sql.transaction([
      sql`
        DELETE FROM child_activities
        WHERE id = ${parsed.data.id}
          AND child_id = ${parsedChild.data}
          AND calendar_id = ${session.calendarId}
      `,
      sql`
        INSERT INTO audit_log (
          calendar_id, actor_participant_id, action, entity_type, entity_id, after_state
        )
        VALUES (
          ${session.calendarId}, ${session.participantId},
          'child_activity.delete', 'child_activity', ${parsedChild.data},
          ${JSON.stringify({
            activityId: parsed.data.id,
            activityName: existing.activityName,
          })}::jsonb
        )
      `,
    ]);
  } catch {
    return NextResponse.json({ error: "The activity could not be removed." }, { status: 409 });
  }

  return NextResponse.json({ ok: true });
}
