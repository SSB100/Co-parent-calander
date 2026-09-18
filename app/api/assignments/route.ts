import { parseISO } from "date-fns";
import { and, eq, inArray } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { after, NextResponse } from "next/server";
import { z } from "zod";
import {
  ApprovalEngineError,
  createApprovalProposal,
} from "@/lib/approvals/engine";
import { getSharedApprovalTarget } from "@/lib/approvals/shared";
import { loadEffectiveAssignmentMap } from "@/lib/assignments/effective";
import { getDb, getSql } from "@/lib/db";
import { children, parentingAssignments, participants } from "@/lib/db/schema";
import { buildCalendarSyncJobStatement, expandGoogleSyncRange } from "@/lib/google-calendar/outbox";
import { processDueGoogleSyncJobs } from "@/lib/google-calendar/queue";
import { isSameOriginMutation } from "@/lib/security/request";
import { getEditorSession } from "@/lib/security/session";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => !Number.isNaN(parseISO(value).getTime()), "Invalid date");

const ownershipSchema = z.object({
  morningParentId: z.string().uuid().nullable(),
  afternoonParentId: z.string().uuid().nullable(),
});

const mutationSchema = z
  .object({
    dates: z.array(isoDate).min(1).max(62),
    parentId: z.string().uuid().nullable().optional(),
    period: z.enum(["full_day", "morning", "afternoon"]).optional(),
    ownership: ownershipSchema.optional(),
    reason: z
      .string()
      .trim()
      .max(500, "Keep the reason under 500 characters.")
      .nullable()
      .optional()
      .transform((value) => (value ? value : null)),
  })
  .superRefine((value, context) => {
    if (!value.ownership && value.parentId === undefined) {
      context.addIssue({
        code: "custom",
        path: ["ownership"],
        message: "Choose a custody state before updating these dates.",
      });
    }
  });

function approvalError(error: unknown) {
  if (error instanceof ApprovalEngineError) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode });
  }
  return NextResponse.json(
    { error: "That schedule proposal could not be saved. Please refresh and try again." },
    { status: 409 },
  );
}

export async function POST(request: NextRequest) {
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
    return NextResponse.json({ error: "The calendar update could not be read." }, { status: 400 });
  }

  const parsed = mutationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Choose valid dates and a custody state." },
      { status: 400 },
    );
  }

  const dates = [...new Set(parsed.data.dates)].sort();
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
      { error: "Add at least one child before assigning calendar days." },
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
        inArray(parentingAssignments.assignmentDate, dates),
      ),
    );

  const effective = await loadEffectiveAssignmentMap({
    calendarId: session.calendarId,
    childIds,
    from: dates[0],
    to: dates[dates.length - 1],
  });

  const previousAssignments = dates.flatMap((date) =>
    childRows.map((child) => {
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
    }),
  );

  const proposedAssignments = dates.flatMap((date) =>
    childRows.map((child) => {
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

      const hasAssignment = Boolean(morningParentId || afternoonParentId);
      return {
        childId: child.id,
        date,
        morningParentId,
        afternoonParentId,
        handoverTime: hasAssignment ? current?.handoverTime ?? null : null,
        handoverLocation: hasAssignment ? current?.handoverLocation ?? null : null,
        note: hasAssignment ? current?.note ?? null : null,
      };
    }),
  );

  try {
    const approvalTarget = await getSharedApprovalTarget({
      calendarId: session.calendarId,
      actorMembershipId: session.membershipId,
      actorParticipantId: session.participantId!,
    });

    if (approvalTarget.required && approvalTarget.approverMembershipId) {
      const result = await createApprovalProposal({
        calendarId: session.calendarId,
        actor: {
          membershipId: session.membershipId,
          participantId: session.participantId,
          permission: session.permission,
        },
        entityType: "parenting_schedule",
        entityId: session.calendarId,
        action: "edit",
        previousState: {
          kind: "parenting_assignments",
          dates,
          assignments: previousAssignments,
        },
        proposedState: {
          kind: "parenting_assignments",
          dates,
          assignments: proposedAssignments,
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
          dates,
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
    dates,
    childIds,
    parentId,
    period,
    ownership,
  });

  const sql = getSql();
  const statements = proposedAssignments.map((assignment) => {
    if (!assignment.morningParentId && !assignment.afternoonParentId) {
      return sql`
        INSERT INTO parenting_assignments (
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
          ${session.calendarId},
          ${assignment.childId},
          ${assignment.date},
          NULL,
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
          afternoon_parent_id = NULL,
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
        afternoon_parent_id,
        source,
        recurring_rule_id,
        created_by,
        updated_at
      )
      VALUES (
        ${session.calendarId},
        ${assignment.childId},
        ${assignment.date},
        ${assignment.morningParentId},
        ${assignment.afternoonParentId},
        'manual',
        NULL,
        ${session.participantId},
        now()
      )
      ON CONFLICT (calendar_id, child_id, assignment_date)
      DO UPDATE SET
        parent_id = EXCLUDED.parent_id,
        afternoon_parent_id = EXCLUDED.afternoon_parent_id,
        source = 'manual',
        recurring_rule_id = NULL,
        created_by = EXCLUDED.created_by,
        updated_at = now()
    `;
  });

  const hasAssignedOwner = ownership
    ? Boolean(ownership.morningParentId || ownership.afternoonParentId)
    : Boolean(parentId);

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
      ${hasAssignedOwner ? "assignment.bulk_set" : "assignment.bulk_clear"},
      'parenting_assignment_batch',
      ${beforeState}::jsonb,
      ${afterState}::jsonb
    )
  `);

  const syncRange = expandGoogleSyncRange(dates[0], dates[dates.length - 1]);
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
      { error: "Those dates could not be updated. Please refresh the calendar and try again." },
      { status: 409 },
    );
  }

  after(async () => {
    try {
      await processDueGoogleSyncJobs({ calendarId: session.calendarId, limit: 8 });
    } catch {}
  });

  return NextResponse.json({
    ok: true,
    pending: false,
    dates,
    parentId,
    period,
    ownership,
    affectedChildren: childRows.length,
  });
}
