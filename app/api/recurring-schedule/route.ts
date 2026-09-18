import { randomUUID } from "node:crypto";
import { parseISO } from "date-fns";
import { and, asc, desc, eq, inArray, like } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { ApprovalEngineError, createApprovalProposal } from "@/lib/approvals/engine";
import { approvalActorFromSession, proposalReasonSchema, sharedApprovalTargetForSession } from "@/lib/approvals/http";
import { getDb, getSql } from "@/lib/db";
import { children, participants, recurringRules } from "@/lib/db/schema";
import {
  buildFortnightRuleText,
  dateForSlot,
  FORTNIGHT_SLOTS,
  normalizeAnchorDate,
  scheduleRangesOverlap,
  type RecurrencePeriod,
} from "@/lib/recurrence/fortnight";
import { buildCalendarSyncJobStatement } from "@/lib/google-calendar/outbox";
import { groupSavedSchedules } from "@/lib/recurrence/saved-schedules";
import { kickGoogleCalendarSync } from "@/lib/google-calendar/dispatch";
import { isSameOriginMutation } from "@/lib/security/request";
import { getEditorSession } from "@/lib/security/session";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => !Number.isNaN(parseISO(value).getTime()), "Choose a valid date.");

const scheduleSlotSchema = z
  .union([
    z.object({
      morningParentId: z.string().uuid().nullable(),
      afternoonParentId: z.string().uuid().nullable(),
    }),
    z.string().uuid(),
    z.null(),
  ])
  .transform((value) => {
    if (typeof value === "string") {
      return { morningParentId: value, afternoonParentId: value };
    }
    if (value === null) {
      return { morningParentId: null, afternoonParentId: null };
    }
    return value;
  });

const scheduleSchema = z
  .object({
    scheduleId: z.string().uuid().nullable().optional(),
    anchorDate: isoDate,
    endDate: isoDate.nullable(),
    pattern: z.array(scheduleSlotSchema).length(FORTNIGHT_SLOTS),
    reason: proposalReasonSchema,
  })
  .superRefine((value, context) => {
    if (value.endDate && value.endDate < value.anchorDate) {
      context.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "The repeating schedule end date cannot be before its start date.",
      });
    }
  });

const deleteSchema = z.object({
  scheduleId: z.string().uuid(),
  reason: proposalReasonSchema,
});

async function loadSchedules(calendarId: string) {
  const db = getDb();
  const [parentRows, ruleRows] = await db.batch([
    db
      .select({
        id: participants.id,
        displayName: participants.displayName,
        colorKey: participants.colorKey,
      })
      .from(participants)
      .where(and(eq(participants.calendarId, calendarId), eq(participants.active, true)))
      .orderBy(asc(participants.createdAt)),
    db
      .select({
        id: recurringRules.id,
        parentId: recurringRules.parentId,
        rrule: recurringRules.rrule,
        startDate: recurringRules.startDate,
        endDate: recurringRules.endDate,
        createdAt: recurringRules.createdAt,
      })
      .from(recurringRules)
      .where(and(eq(recurringRules.calendarId, calendarId), eq(recurringRules.active, true)))
      .orderBy(asc(recurringRules.startDate), desc(recurringRules.createdAt)),
  ]);

  return {
    schedules: groupSavedSchedules(ruleRows),
    participants: parentRows,
  };
}

function approvalError(error: unknown, fallback: string) {
  if (error instanceof ApprovalEngineError) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode });
  }
  return NextResponse.json({ error: fallback }, { status: 409 });
}

export async function GET() {
  const session = await getEditorSession();
  if (!session) {
    return NextResponse.json({ error: "Editor access is required." }, { status: 401 });
  }

  return NextResponse.json({
    ...(await loadSchedules(session.calendarId)),
    currentParticipantId: session.participantId,
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "The repeating schedule could not be read." }, { status: 400 });
  }

  const parsed = scheduleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Choose a valid repeating schedule." },
      { status: 400 },
    );
  }

  if (
    parsed.data.pattern.every(
      (slot) => slot.morningParentId === null && slot.afternoonParentId === null,
    )
  ) {
    return NextResponse.json(
      { error: "Choose at least one repeating day before saving this schedule." },
      { status: 400 },
    );
  }

  const scheduleId = parsed.data.scheduleId ?? randomUUID();
  const anchorDate = normalizeAnchorDate(parsed.data.anchorDate);
  const endDate = parsed.data.endDate;
  const pattern = parsed.data.pattern;
  const selectedParentIds = [
    ...new Set(
      pattern.flatMap((slot) => [slot.morningParentId, slot.afternoonParentId]).filter(
        (value): value is string => Boolean(value),
      ),
    ),
  ];
  const db = getDb();

  const [parentRows, childRows, activeRuleRows] = await db.batch([
    db
      .select({ id: participants.id })
      .from(participants)
      .where(
        and(
          eq(participants.calendarId, session.calendarId),
          eq(participants.active, true),
          inArray(participants.id, selectedParentIds),
        ),
      ),
    db
      .select({ id: children.id })
      .from(children)
      .where(and(eq(children.calendarId, session.calendarId), eq(children.active, true))),
    db
      .select({
        id: recurringRules.id,
        parentId: recurringRules.parentId,
        rrule: recurringRules.rrule,
        startDate: recurringRules.startDate,
        endDate: recurringRules.endDate,
        createdAt: recurringRules.createdAt,
      })
      .from(recurringRules)
      .where(and(eq(recurringRules.calendarId, session.calendarId), eq(recurringRules.active, true))),
  ]);

  if (parentRows.length !== selectedParentIds.length) {
    return NextResponse.json(
      { error: "One of the selected parents is no longer active on this calendar." },
      { status: 400 },
    );
  }

  if (childRows.length === 0) {
    return NextResponse.json(
      { error: "Add at least one child before creating a repeating schedule." },
      { status: 409 },
    );
  }

  const savedSchedules = groupSavedSchedules(activeRuleRows);
  const existingSchedule = savedSchedules.find((schedule) => schedule.scheduleId === scheduleId);
  if (parsed.data.scheduleId && !existingSchedule) {
    return NextResponse.json({ error: "That saved schedule could not be found." }, { status: 404 });
  }

  const conflict = savedSchedules.find(
    (schedule) =>
      schedule.scheduleId !== scheduleId &&
      scheduleRangesOverlap(anchorDate, endDate, schedule.anchorDate, schedule.endDate),
  );
  if (conflict) {
    return NextResponse.json(
      {
        error:
          "This schedule overlaps another saved schedule. End the earlier schedule before the new one starts, or move this schedule's start date.",
      },
      { status: 409 },
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
        action: existingSchedule ? "edit" : "create",
        previousState: {
          kind: "recurring_schedule_snapshot",
          schedule: existingSchedule ?? null,
        },
        proposedState: {
          kind: "recurring_schedule",
          mode: "upsert",
          scheduleId,
          anchorDate,
          endDate,
          pattern,
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
          scheduleId,
          anchorDate,
          endDate,
          pattern,
        },
        { status: 202 },
      );
    }
  } catch (error) {
    return approvalError(error, "The repeating schedule proposal could not be saved.");
  }

  const sql = getSql();
  const scheduleMarker = `%X-COPARENT-SCHEDULE=${scheduleId}%`;
  const statements = [];
  const calendarId = session.calendarId;
  const actorParticipantId = session.participantId;

  if (existingSchedule) {
    statements.push(sql`
      UPDATE recurring_rules
      SET active = false, updated_at = now()
      WHERE calendar_id = ${calendarId}
        AND active = true
        AND rrule LIKE ${scheduleMarker}
    `);
  }

  function addRule(slot: number, parentId: string, period: RecurrencePeriod) {
    const ruleId = randomUUID();
    const startDate = dateForSlot(anchorDate, slot);
    const rrule = buildFortnightRuleText({ scheduleId, anchorDate, slot, period });

    statements.push(sql`
      INSERT INTO recurring_rules (
        id,
        calendar_id,
        parent_id,
        rrule,
        start_date,
        end_date,
        active,
        created_by,
        created_at,
        updated_at
      )
      VALUES (
        ${ruleId},
        ${calendarId},
        ${parentId},
        ${rrule},
        ${startDate},
        ${endDate},
        true,
        ${actorParticipantId},
        now(),
        now()
      )
    `);

    for (const child of childRows) {
      statements.push(sql`
        INSERT INTO recurring_rule_children (
          recurring_rule_id,
          child_id
        )
        VALUES (${ruleId}, ${child.id})
      `);
    }
  }

  for (let slot = 0; slot < FORTNIGHT_SLOTS; slot += 1) {
    const { morningParentId, afternoonParentId } = pattern[slot];
    if (!morningParentId && !afternoonParentId) continue;

    if (morningParentId && morningParentId === afternoonParentId) {
      addRule(slot, morningParentId, "full_day");
      continue;
    }

    if (morningParentId) addRule(slot, morningParentId, "morning");
    if (afternoonParentId) addRule(slot, afternoonParentId, "afternoon");
  }

  const beforeState = JSON.stringify({ schedule: existingSchedule ?? null });
  const afterState = JSON.stringify({ scheduleId, anchorDate, endDate, pattern });
  statements.push(sql`
    INSERT INTO audit_log (
      calendar_id,
      actor_participant_id,
      action,
      entity_type,
      entity_id,
      before_state,
      after_state
    )
    VALUES (
      ${calendarId},
      ${actorParticipantId},
      ${existingSchedule ? "recurring_schedule.update" : "recurring_schedule.create"},
      'recurring_schedule',
      NULL,
      ${beforeState}::jsonb,
      ${afterState}::jsonb
    )
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
    return NextResponse.json(
      { error: "The repeating schedule could not be saved. Please refresh and try again." },
      { status: 409 },
    );
  }

  kickGoogleCalendarSync(session.calendarId);

  return NextResponse.json({
    ok: true,
    pending: false,
    scheduleId,
    anchorDate,
    endDate,
    pattern,
  });
}

export async function DELETE(request: NextRequest) {
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
    return NextResponse.json({ error: "Choose a saved schedule to delete." }, { status: 400 });
  }

  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Choose a valid saved schedule." }, { status: 400 });
  }

  const { scheduleId } = parsed.data;
  const db = getDb();
  const scheduleMarker = `%X-COPARENT-SCHEDULE=${scheduleId}%`;
  const ruleRows = await db
    .select({
      id: recurringRules.id,
      parentId: recurringRules.parentId,
      rrule: recurringRules.rrule,
      startDate: recurringRules.startDate,
      endDate: recurringRules.endDate,
      createdAt: recurringRules.createdAt,
    })
    .from(recurringRules)
    .where(
      and(
        eq(recurringRules.calendarId, session.calendarId),
        eq(recurringRules.active, true),
        like(recurringRules.rrule, scheduleMarker),
      ),
    );

  if (ruleRows.length === 0) {
    return NextResponse.json({ error: "That saved schedule could not be found." }, { status: 404 });
  }

  const savedSchedules = groupSavedSchedules(ruleRows);
  const beforeState = JSON.stringify({ schedules: savedSchedules });

  try {
    const approvalTarget = await sharedApprovalTargetForSession(session);

    if (approvalTarget.required && approvalTarget.approverMembershipId) {
      const result = await createApprovalProposal({
        calendarId: session.calendarId,
        actor: approvalActorFromSession(session),
        entityType: "parenting_schedule",
        entityId: session.calendarId,
        action: "delete",
        previousState: {
          kind: "recurring_schedule_snapshot",
          schedule: savedSchedules[0] ?? null,
        },
        proposedState: {
          kind: "recurring_schedule",
          mode: "delete",
          scheduleId,
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
          scheduleId,
        },
        { status: 202 },
      );
    }
  } catch (error) {
    return approvalError(error, "The repeating schedule proposal could not be saved.");
  }

  const sql = getSql();
  const ruleIds = ruleRows.map((rule) => rule.id);
  const ruleIdArray = `{${ruleIds.join(",")}}`;

  try {
    await sql.transaction([
      sql`
        DELETE FROM parenting_assignments
        WHERE calendar_id = ${session.calendarId}
          AND source = 'recurring'
          AND recurring_rule_id = ANY(${ruleIdArray}::uuid[])
      `,
      sql`
        UPDATE recurring_rules
        SET active = false, updated_at = now()
        WHERE calendar_id = ${session.calendarId}
          AND active = true
          AND rrule LIKE ${scheduleMarker}
      `,
      sql`
        INSERT INTO audit_log (
          calendar_id,
          actor_participant_id,
          action,
          entity_type,
          entity_id,
          before_state,
          after_state
        )
        VALUES (
          ${session.calendarId},
          ${session.participantId},
          'recurring_schedule.delete',
          'recurring_schedule',
          NULL,
          ${beforeState}::jsonb,
          ${JSON.stringify({ scheduleId, deleted: true })}::jsonb
        )
      `,
      buildCalendarSyncJobStatement(sql, {
        calendarId: session.calendarId,
        jobType: "full",
      }),
    ]);
  } catch {
    return NextResponse.json(
      { error: "That saved schedule could not be deleted." },
      { status: 409 },
    );
  }

  kickGoogleCalendarSync(session.calendarId);
  return NextResponse.json({ ok: true, pending: false, scheduleId });
}
