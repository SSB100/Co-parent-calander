import { parseISO } from "date-fns";
import { and, eq, inArray } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, getSql } from "@/lib/db";
import { children, parentingAssignments, participants } from "@/lib/db/schema";
import { isSameOriginMutation } from "@/lib/security/request";
import { getEditorSession } from "@/lib/security/session";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => !Number.isNaN(parseISO(value).getTime()), "Invalid date");

const nullableTime = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Choose a valid handover time.")
  .nullable();

const nullableLocation = z
  .string()
  .trim()
  .max(120, "Keep the handover location under 120 characters.")
  .nullable()
  .transform((value) => (value ? value : null));

const nullableNote = z
  .string()
  .trim()
  .max(500, "Keep the note under 500 characters.")
  .nullable()
  .transform((value) => (value ? value : null));

const detailsSchema = z
  .object({
    date: isoDate,
    parentId: z.string().uuid().nullable(),
    handoverTime: nullableTime,
    handoverLocation: nullableLocation,
    note: nullableNote,
  })
  .superRefine((value, context) => {
    if (
      value.parentId === null &&
      (value.handoverTime || value.handoverLocation || value.note)
    ) {
      context.addIssue({
        code: "custom",
        message: "Assign the day to a parent before adding handover details or a note.",
      });
    }
  });

export async function PATCH(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ error: "This request was blocked for safety." }, { status: 403 });
  }

  const session = await getEditorSession();
  if (!session) {
    return NextResponse.json({ error: "Editor access is required." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "The day details could not be read." }, { status: 400 });
  }

  const parsed = detailsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Choose valid day details." },
      { status: 400 },
    );
  }

  const { date, parentId, handoverTime, handoverLocation, note } = parsed.data;
  const db = getDb();

  if (parentId) {
    const parentRows = await db
      .select({ id: participants.id })
      .from(participants)
      .where(
        and(
          eq(participants.id, parentId),
          eq(participants.calendarId, session.calendarId),
          eq(participants.active, true),
        ),
      )
      .limit(1);

    if (!parentRows[0]) {
      return NextResponse.json({ error: "That parent is not part of this calendar." }, { status: 400 });
    }
  }

  const childRows = await db
    .select({ id: children.id })
    .from(children)
    .where(and(eq(children.calendarId, session.calendarId), eq(children.active, true)));

  if (childRows.length === 0) {
    return NextResponse.json(
      { error: "Add at least one child before editing a calendar day." },
      { status: 409 },
    );
  }

  const childIds = childRows.map((child) => child.id);
  const existing = await db
    .select({
      id: parentingAssignments.id,
      childId: parentingAssignments.childId,
      date: parentingAssignments.assignmentDate,
      parentId: parentingAssignments.parentId,
      handoverTime: parentingAssignments.handoverTime,
      handoverLocation: parentingAssignments.handoverLocation,
      note: parentingAssignments.note,
    })
    .from(parentingAssignments)
    .where(
      and(
        eq(parentingAssignments.calendarId, session.calendarId),
        inArray(parentingAssignments.childId, childIds),
        eq(parentingAssignments.assignmentDate, date),
      ),
    );

  const beforeState = JSON.stringify({ assignments: existing });
  const afterState = JSON.stringify({
    date,
    childIds,
    parentId,
    handoverTime,
    handoverLocation,
    note,
  });

  const sql = getSql();
  const statements = childRows.map((child) => {
    if (!parentId) {
      return sql`
        INSERT INTO parenting_assignments (
          calendar_id,
          child_id,
          assignment_date,
          parent_id,
          source,
          recurring_rule_id,
          handover_time,
          handover_location,
          note,
          created_by,
          updated_at
        )
        VALUES (
          ${session.calendarId},
          ${child.id},
          ${date},
          NULL,
          'manual',
          NULL,
          NULL,
          NULL,
          NULL,
          ${session.participantId},
          now()
        )
        ON CONFLICT (calendar_id, child_id, assignment_date)
        DO UPDATE SET
          parent_id = NULL,
          source = 'manual',
          recurring_rule_id = NULL,
          handover_time = NULL,
          handover_location = NULL,
          note = NULL,
          created_by = EXCLUDED.created_by,
          updated_at = now()
      `;
    }

    return sql`
      INSERT INTO parenting_assignments (
        calendar_id,
        child_id,
        assignment_date,
        parent_id,
        source,
        recurring_rule_id,
        handover_time,
        handover_location,
        note,
        created_by,
        updated_at
      )
      VALUES (
        ${session.calendarId},
        ${child.id},
        ${date},
        ${parentId},
        'manual',
        NULL,
        ${handoverTime},
        ${handoverLocation},
        ${note},
        ${session.participantId},
        now()
      )
      ON CONFLICT (calendar_id, child_id, assignment_date)
      DO UPDATE SET
        parent_id = EXCLUDED.parent_id,
        source = 'manual',
        recurring_rule_id = NULL,
        handover_time = EXCLUDED.handover_time,
        handover_location = EXCLUDED.handover_location,
        note = EXCLUDED.note,
        created_by = EXCLUDED.created_by,
        updated_at = now()
    `;
  });

  statements.push(sql`
    INSERT INTO audit_log (
      calendar_id,
      actor_participant_id,
      action,
      entity_type,
      before_state,
      after_state
    )
    VALUES (
      ${session.calendarId},
      ${session.participantId},
      ${parentId ? "assignment.details_update" : "assignment.single_clear"},
      'parenting_assignment_batch',
      ${beforeState}::jsonb,
      ${afterState}::jsonb
    )
  `);

  try {
    await sql.transaction(statements);
  } catch {
    return NextResponse.json(
      { error: "That day could not be updated. Please refresh and try again." },
      { status: 409 },
    );
  }

  return NextResponse.json({
    ok: true,
    date,
    parentId,
    affectedChildren: childRows.length,
  });
}
