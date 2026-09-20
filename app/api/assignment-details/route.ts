import { parseISO } from "date-fns";
import { and, eq, inArray } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ApprovalEngineError,
  createApprovalProposal,
} from "@/lib/approvals/engine";
import { approvalActorFromSession, proposalReasonSchema, sharedApprovalTargetForSession } from "@/lib/approvals/http";
import { loadEffectiveAssignmentMap } from "@/lib/assignments/effective";
import { getDb, getSql } from "@/lib/db";
import { children, parentingAssignments, participants } from "@/lib/db/schema";
import { buildCalendarSyncJobStatement, expandGoogleSyncRange } from "@/lib/google-calendar/outbox";
import { kickGoogleCalendarSync } from "@/lib/google-calendar/dispatch";
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

const ownershipSchema = z.object({
  morningParentId: z.string().uuid().nullable(),
  afternoonParentId: z.string().uuid().nullable(),
});

const detailsSchema = z
  .object({
    date: isoDate,
    parentId: z.string().uuid().nullable().optional(),
    period: z.enum(["full_day", "morning", "afternoon"]).optional(),
    ownership: ownershipSchema.optional(),
    handoverTime: nullableTime,
    handoverLocation: nullableLocation,
    note: nullableNote,
    reason: proposalReasonSchema,
  })
  .superRefine((value, context) => {
    if (!value.ownership && value.parentId === undefined) {
      context.addIssue({
        code: "custom",
        path: ["ownership"],
        message: "Choose a custody state before saving this day.",
      });
    }
  });

function approvalError(error: unknown) {
  if (error instanceof ApprovalEngineError) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode });
  }
  return NextResponse.json(
    { error: "That day proposal could not be saved. Please refresh and try again." },
    { status: 409 },
  );
}

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

  const { date, handoverTime, handoverLocation, note } = parsed.data;
  const parentId = parsed.data.parentId ?? null;
  const period = parsed.data.period ?? "full_day";
  const ownership = parsed.data.ownership ?? null;
  const selectedParentIds = [
    ...new Set(
      (ownership
        ? [ownership.morningParentId, ownership.afternoonParentId]
        : [parentId]
      ).filter((value): value is string => Boolean(value)),
    ),
  ];
  const db = getDb();

  if (selectedParentIds.length > 0) {
    const parentRows = await db
      .select({ id: participants.id })
      .from(participants)
      .where(
        and(
          eq(participants.calendarId, session.calendarId),
          eq(participants.active, true),
          inArray(participants.id, selectedParentIds),
        ),
      );

    if (parentRows.length !== selectedParentIds.length) {
      return NextResponse.json(
        { error: "One of the selected parents is no longer part of this calendar." },
        { status: 400 },
      );
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
      morningParentId: parentingAssignments.parentId,
      afternoonParentId: parentingAssignments.afternoonParentId,
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

  const effective = await loadEffectiveAssignmentMap({
    calendarId: session.calendarId,
    childIds,
    from: date,
    to: date,
  });

  const previousAssignments = childRows.map((child) => {
    const current = effective.get(`${child.id}:${date}`);
    return {
      childId: child.id,
      date,
      morningParentId: current?.morningParentId ?? null,
      afternoonParentId: current?.afternoonParentId ?? null,
      handoverTime: current?.handoverTime ?? null,
      handoverLocation: current?.handoverLocation ?? null,
      note: current?.note ?? null,
    };
  });

  const nextAssignments = childRows.map((child) => {
    const current = effective.get(`${child.id}:${date}`);
    let morningParentId = current?.morningParentId ?? null;
    let afternoonParentId = current?.afternoonParentId ?? null;

    if (ownership) {
      morningParentId = ownership.morningParentId;
      afternoonParentId = ownership.afternoonParentId;
    } else if (period === "full_day") {
      morningParentId = parentId;
      afternoonParentId = parentId;
    } else if (period === "morning") {
      morningParentId = parentId;
    } else {
      afternoonParentId = parentId;
    }

    const rowHasAssignment = Boolean(morningParentId || afternoonParentId);
    return {
      childId: child.id,
      date,
      morningParentId,
      afternoonParentId,
      handoverTime: rowHasAssignment ? handoverTime : null,
      handoverLocation: rowHasAssignment ? handoverLocation : null,
      note: rowHasAssignment ? note : null,
    };
  });

  const hasAnyAssignment = nextAssignments.some(
    (assignment) => assignment.morningParentId || assignment.afternoonParentId,
  );
  if (!hasAnyAssignment && (handoverTime || handoverLocation || note)) {
    return NextResponse.json(
      { error: "Assign this day before adding handover details or a note." },
      { status: 400 },
    );
  }

  try {
    const approvalTarget = await sharedApprovalTargetForSession(session);

    if (approvalTarget.required && approvalTarget.approverMembershipId) {
      const result = await createApprovalProposal({
        calendarId: session.calendarId,
        actor: approvalActorFromSession(session),
        entityType: "parenting_schedule",
        entityId: session.calendarId,
        action: "edit",
        previousState: {
          kind: "parenting_assignments",
          dates: [date],
          assignments: previousAssignments,
        },
        proposedState: {
          kind: "parenting_assignments",
          dates: [date],
          assignments: nextAssignments,
        },
        reason: parsed.data.reason,
        approverMembershipId: approvalTarget.approverMembershipId,
      });

      return NextResponse.json(
        {
          ok: true,
          pending: true,
          proposalId: result?.proposal.id ?? null,
          approverName: result?.proposal.approverName ?? approvalTarget.approverName,
          date,
          affectedChildren: childRows.length,
        },
        { status: 202 },
      );
    }
  } catch (error) {
    return approvalError(error);
  }

  const beforeState = JSON.stringify({ assignments: existing });
  const afterState = JSON.stringify({
    date,
    childIds,
    parentId,
    period,
    ownership,
    assignments: nextAssignments,
    handoverTime: hasAnyAssignment ? handoverTime : null,
    handoverLocation: hasAnyAssignment ? handoverLocation : null,
    note: hasAnyAssignment ? note : null,
  });

  const sql = getSql();
  const statements = nextAssignments.map((assignment) => sql`
    INSERT INTO parenting_assignments (
      calendar_id,
      child_id,
      assignment_date,
      parent_id,
      afternoon_parent_id,
      handover_time,
      handover_location,
      note,
      created_by,
      updated_at
    )
    VALUES (
      ${session.calendarId},
      ${assignment.childId},
      ${date},
      ${assignment.morningParentId},
      ${assignment.afternoonParentId},
      ${assignment.handoverTime},
      ${assignment.handoverLocation},
      ${assignment.note},
      ${session.participantId},
      now()
    )
    ON CONFLICT (calendar_id, child_id, assignment_date)
    DO UPDATE SET
      parent_id = EXCLUDED.parent_id,
      afternoon_parent_id = EXCLUDED.afternoon_parent_id,
      handover_time = EXCLUDED.handover_time,
      handover_location = EXCLUDED.handover_location,
      note = EXCLUDED.note,
      created_by = EXCLUDED.created_by,
      updated_at = now()
  `);

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
      ${hasAnyAssignment ? "assignment.details_update" : "assignment.single_clear"},
      'parenting_assignment_batch',
      ${beforeState}::jsonb,
      ${afterState}::jsonb
    )
  `);

  const syncRange = expandGoogleSyncRange(date);
  statements.push(
    buildCalendarSyncJobStatement(sql, {
      calendarId: session.calendarId,
      rangeStart: syncRange.from,
      rangeEnd: syncRange.to,
    }),
  );

  try {
    await sql.transaction(statements);
  } catch {
    return NextResponse.json(
      { error: "That day could not be updated. Please refresh and try again." },
      { status: 409 },
    );
  }

  kickGoogleCalendarSync(session.calendarId);

  return NextResponse.json({
    ok: true,
    pending: false,
    date,
    parentId,
    period,
    ownership,
    affectedChildren: childRows.length,
  });
}
