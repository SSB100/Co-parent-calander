import { and, desc, eq, like } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, getSql } from "@/lib/db";
import { auditLog, parentingAssignments } from "@/lib/db/schema";
import { isSameOriginMutation } from "@/lib/security/request";
import { getEditorSession } from "@/lib/security/session";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const previousAssignment = z.object({
  id: z.string().uuid(),
  childId: z.string().uuid(),
  date: isoDate,
  morningParentId: z.string().uuid().nullable().optional(),
  parentId: z.string().uuid().nullable().optional(),
  afternoonParentId: z.string().uuid().nullable().optional(),
  handoverTime: z.string().nullable(),
  handoverLocation: z.string().nullable(),
  note: z.string().nullable(),
});
const beforeStateSchema = z.object({
  assignments: z.array(previousAssignment),
});
const afterStateSchema = z.object({
  dates: z.array(isoDate).min(1).max(62),
  childIds: z.array(z.string().uuid()).min(1),
  parentId: z.string().uuid().nullable(),
  period: z.enum(["full_day", "morning", "afternoon"]).optional(),
});

async function latestAssignmentAudit(calendarId: string) {
  const db = getDb();
  const rows = await db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      beforeState: auditLog.beforeState,
      afterState: auditLog.afterState,
      occurredAt: auditLog.occurredAt,
    })
    .from(auditLog)
    .where(and(eq(auditLog.calendarId, calendarId), like(auditLog.action, "assignment.%")))
    .orderBy(desc(auditLog.occurredAt))
    .limit(1);

  return rows[0] ?? null;
}

function eligibleBulkAudit(row: Awaited<ReturnType<typeof latestAssignmentAudit>>) {
  if (!row || (row.action !== "assignment.bulk_set" && row.action !== "assignment.bulk_clear")) {
    return null;
  }

  const before = beforeStateSchema.safeParse(row.beforeState);
  const after = afterStateSchema.safeParse(row.afterState);
  if (!before.success || !after.success) return null;

  return {
    ...row,
    before: before.data,
    after: after.data,
  };
}

export async function GET() {
  const session = await getEditorSession();
  if (!session) {
    return NextResponse.json({ error: "Editor access is required." }, { status: 401 });
  }

  const eligible = eligibleBulkAudit(await latestAssignmentAudit(session.calendarId));
  if (!eligible) {
    return NextResponse.json({ available: false });
  }

  return NextResponse.json({
    available: true,
    auditId: eligible.id,
    action: eligible.action,
    occurredAt: eligible.occurredAt,
    dateCount: eligible.after.dates.length,
  });
}

export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ error: "This request was blocked for safety." }, { status: 403 });
  }

  const session = await getEditorSession();
  if (!session) {
    return NextResponse.json({ error: "Editor access is required." }, { status: 401 });
  }

  const eligible = eligibleBulkAudit(await latestAssignmentAudit(session.calendarId));
  if (!eligible) {
    return NextResponse.json(
      { error: "There is no recent bulk assignment that can be safely undone." },
      { status: 409 },
    );
  }

  const { dates, childIds } = eligible.after;
  const db = getDb();
  const currentRows = await db
    .select({
      id: parentingAssignments.id,
      childId: parentingAssignments.childId,
      date: parentingAssignments.assignmentDate,
      morningParentId: parentingAssignments.parentId,
      afternoonParentId: parentingAssignments.afternoonParentId,
      handoverTime: parentingAssignments.handoverTime,
      handoverLocation: parentingAssignments.handoverLocation,
      note: parentingAssignments.note,
    })
    .from(parentingAssignments)
    .where(eq(parentingAssignments.calendarId, session.calendarId));

  const affectedDates = new Set(dates);
  const affectedChildren = new Set(childIds);
  const currentAffected = currentRows.filter(
    (row) => affectedDates.has(row.date) && affectedChildren.has(row.childId),
  );

  const dateArray = `{${dates.join(",")}}`;
  const childArray = `{${childIds.join(",")}}`;
  const sql = getSql();
  const statements = [
    sql`
      DELETE FROM parenting_assignments
      WHERE calendar_id = ${session.calendarId}
        AND assignment_date = ANY(${dateArray}::date[])
        AND child_id = ANY(${childArray}::uuid[])
    `,
  ];

  for (const assignment of eligible.before.assignments) {
    const morningParentId = assignment.morningParentId ?? assignment.parentId ?? null;
    const afternoonParentId =
      assignment.afternoonParentId === undefined
        ? morningParentId
        : assignment.afternoonParentId;

    statements.push(sql`
      INSERT INTO parenting_assignments (
        id,
        calendar_id,
        child_id,
        assignment_date,
        parent_id,
        afternoon_parent_id,
        source,
        recurring_rule_id,
        handover_time,
        handover_location,
        note,
        created_by,
        updated_at
      )
      VALUES (
        ${assignment.id},
        ${session.calendarId},
        ${assignment.childId},
        ${assignment.date},
        ${morningParentId},
        ${afternoonParentId},
        'manual',
        NULL,
        ${assignment.handoverTime},
        ${assignment.handoverLocation},
        ${assignment.note},
        ${session.participantId},
        now()
      )
    `);
  }

  const beforeState = JSON.stringify({ assignments: currentAffected });
  const afterState = JSON.stringify({
    undoneAuditId: eligible.id,
    restoredAssignments: eligible.before.assignments.length,
    dates,
    childIds,
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
      'assignment.bulk_undo',
      'parenting_assignment_batch',
      ${beforeState}::jsonb,
      ${afterState}::jsonb
    )
  `);

  try {
    await sql.transaction(statements);
  } catch {
    return NextResponse.json(
      { error: "That bulk change could not be undone. Refresh the calendar and try again." },
      { status: 409 },
    );
  }

  return NextResponse.json({
    ok: true,
    undoneAuditId: eligible.id,
    restoredAssignments: eligible.before.assignments.length,
    dateCount: dates.length,
  });
}
