import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, ne } from "drizzle-orm";
import {
  ApprovalEngineError,
  createApprovalProposal,
} from "@/lib/approvals/engine";
import {
  approvalActorFromSession,
  sharedApprovalTargetForSession,
} from "@/lib/approvals/http";
import type { CalendarApprovalPermission } from "@/lib/approvals/types";
import { ownershipChangeRequiresApproval } from "@/lib/assignments/ownership";
import { getDb, getSql } from "@/lib/db";
import {
  children,
  parentingScheduleChildren,
  parentingSchedules,
  parentingScheduleSlots,
  participants,
} from "@/lib/db/schema";
import { kickGoogleCalendarSync } from "@/lib/google-calendar/dispatch";
import { buildCalendarSyncJobStatement } from "@/lib/google-calendar/outbox";
import {
  emptyParentingSchedulePattern,
  type ParentingScheduleSlot,
  type SavedParentingSchedule,
} from "@/lib/parenting-schedules/model";
import {
  normalizeAnchorDate,
  scheduleRangesOverlap,
} from "@/lib/recurrence/fortnight";

export type ParentingScheduleSession = {
  calendarId: string;
  membershipId: string;
  participantId: string;
  permission: CalendarApprovalPermission;
};

export class ParentingScheduleServiceError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "ParentingScheduleServiceError";
  }
}

function repeatingScheduleChangeRequiresApproval(input: {
  existing: SavedParentingSchedule | null;
  anchorDate: string;
  endDate: string | null;
  pattern: ParentingScheduleSlot[];
}) {
  const { existing, anchorDate, endDate, pattern } = input;
  if (!existing) return false;

  if (existing.anchorDate !== anchorDate) return true;

  if (existing.endDate === null && endDate !== null) {
    return true;
  }

  if (
    existing.endDate !== null &&
    endDate !== null &&
    endDate < existing.endDate
  ) {
    return true;
  }

  return existing.pattern.some((slot, index) =>
    ownershipChangeRequiresApproval(
      slot,
      pattern[index] ?? {
        morningParentId: null,
        afternoonParentId: null,
      },
    ),
  );
}

function repeatingScheduleDeleteRequiresApproval(
  schedule: SavedParentingSchedule,
) {
  return schedule.pattern.some(
    (slot) => slot.morningParentId !== null || slot.afternoonParentId !== null,
  );
}

function serviceFailure(error: unknown, fallback: string): never {
  if (error instanceof ParentingScheduleServiceError) throw error;
  if (error instanceof ApprovalEngineError) {
    throw new ParentingScheduleServiceError(
      error.statusCode,
      error.message,
    );
  }

  throw new ParentingScheduleServiceError(
    409,
    error instanceof Error && error.message
      ? error.message
      : fallback,
  );
}

export async function loadSavedParentingSchedules(
  calendarId: string,
): Promise<SavedParentingSchedule[]> {
  const db = getDb();
  const [scheduleRows, slotRows] = await db.batch([
    db
      .select({
        id: parentingSchedules.id,
        anchorDate: parentingSchedules.anchorDate,
        endDate: parentingSchedules.endDate,
        createdAt: parentingSchedules.createdAt,
      })
      .from(parentingSchedules)
      .where(
        and(
          eq(parentingSchedules.calendarId, calendarId),
          eq(parentingSchedules.active, true),
        ),
      )
      .orderBy(
        asc(parentingSchedules.anchorDate),
        asc(parentingSchedules.createdAt),
      ),
    db
      .select({
        scheduleId: parentingScheduleSlots.scheduleId,
        slotIndex: parentingScheduleSlots.slotIndex,
        morningParentId:
          parentingScheduleSlots.morningParentId,
        afternoonParentId:
          parentingScheduleSlots.afternoonParentId,
      })
      .from(parentingScheduleSlots)
      .innerJoin(
        parentingSchedules,
        eq(
          parentingScheduleSlots.scheduleId,
          parentingSchedules.id,
        ),
      )
      .where(
        and(
          eq(parentingSchedules.calendarId, calendarId),
          eq(parentingSchedules.active, true),
        ),
      )
      .orderBy(
        asc(parentingScheduleSlots.scheduleId),
        asc(parentingScheduleSlots.slotIndex),
      ),
  ]);

  const slotsBySchedule = new Map<
    string,
    ParentingScheduleSlot[]
  >();

  for (const schedule of scheduleRows) {
    slotsBySchedule.set(
      schedule.id,
      emptyParentingSchedulePattern(),
    );
  }

  for (const slot of slotRows) {
    const pattern = slotsBySchedule.get(slot.scheduleId);
    if (!pattern) continue;
    pattern[slot.slotIndex] = {
      morningParentId: slot.morningParentId,
      afternoonParentId: slot.afternoonParentId,
    };
  }

  return scheduleRows.map((schedule) => ({
    scheduleId: schedule.id,
    anchorDate: schedule.anchorDate,
    endDate: schedule.endDate,
    pattern:
      slotsBySchedule.get(schedule.id) ??
      emptyParentingSchedulePattern(),
    createdAt: schedule.createdAt.toISOString(),
  }));
}

export async function listParentingSchedules(
  session: ParentingScheduleSession,
) {
  const db = getDb();
  const [schedules, parentRows] = await Promise.all([
    loadSavedParentingSchedules(session.calendarId),
    db
      .select({
        id: participants.id,
        displayName: participants.displayName,
        colorKey: participants.colorKey,
        profileSlot: participants.profileSlot,
      })
      .from(participants)
      .where(
        and(
          eq(participants.calendarId, session.calendarId),
          eq(participants.active, true),
        ),
      )
      .orderBy(asc(participants.createdAt)),
  ]);

  return {
    schedules,
    participants: parentRows,
    currentParticipantId: session.participantId,
  };
}

export async function upsertParentingSchedule(input: {
  session: ParentingScheduleSession;
  scheduleId?: string | null;
  anchorDate: string;
  endDate: string | null;
  pattern: ParentingScheduleSlot[];
  reason: string | null;
}) {
  const { session, pattern, reason } = input;
  const scheduleId = input.scheduleId ?? randomUUID();
  const anchorDate = normalizeAnchorDate(input.anchorDate);
  const endDate = input.endDate;

  const selectedParentIds = [
    ...new Set(
      pattern
        .flatMap((slot) => [
          slot.morningParentId,
          slot.afternoonParentId,
        ])
        .filter((value): value is string => Boolean(value)),
    ),
  ];

  const db = getDb();
  const [parentRows, childRows, savedSchedules] =
    await Promise.all([
      selectedParentIds.length
        ? db
            .select({ id: participants.id })
            .from(participants)
            .where(
              and(
                eq(participants.calendarId, session.calendarId),
                eq(participants.active, true),
                inArray(participants.id, selectedParentIds),
              ),
            )
        : Promise.resolve([] as Array<{ id: string }>),
      db
        .select({ id: children.id })
        .from(children)
        .where(
          and(
            eq(children.calendarId, session.calendarId),
            eq(children.active, true),
          ),
        ),
      loadSavedParentingSchedules(session.calendarId),
    ]);

  if (parentRows.length !== selectedParentIds.length) {
    throw new ParentingScheduleServiceError(
      400,
      "One of the selected parents is no longer active on this calendar.",
    );
  }

  if (childRows.length === 0) {
    throw new ParentingScheduleServiceError(
      409,
      "Add at least one child before creating a repeating schedule.",
    );
  }

  const existingSchedule = savedSchedules.find(
    (schedule) => schedule.scheduleId === scheduleId,
  );

  if (input.scheduleId && !existingSchedule) {
    throw new ParentingScheduleServiceError(
      404,
      "That saved schedule could not be found.",
    );
  }

  const conflict = savedSchedules.find(
    (schedule) =>
      schedule.scheduleId !== scheduleId &&
      scheduleRangesOverlap(
        anchorDate,
        endDate,
        schedule.anchorDate,
        schedule.endDate,
      ),
  );

  if (conflict) {
    throw new ParentingScheduleServiceError(
      409,
      "This schedule overlaps another saved schedule. End the earlier schedule before the new one starts, or move this schedule's start date.",
    );
  }

  const custodyApprovalRequired =
    repeatingScheduleChangeRequiresApproval({
      existing: existingSchedule ?? null,
      anchorDate,
      endDate,
      pattern,
    });

  if (custodyApprovalRequired) {
    try {
      const approvalTarget =
        await sharedApprovalTargetForSession(session);

      if (
        approvalTarget.required &&
        approvalTarget.approverMembershipId
      ) {
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
        reason,
        approverMembershipId:
          approvalTarget.approverMembershipId,
      });

      return {
        ok: true as const,
        pending: true as const,
        proposalId: result?.proposal.id ?? null,
        approverName:
          result?.proposal.approverName ??
          approvalTarget.approverName,
        scheduleId,
        anchorDate,
        endDate,
        pattern,
        };
      }
    } catch (error) {
      serviceFailure(
        error,
        "The repeating schedule proposal could not be saved.",
      );
    }
  }

  const sql = getSql();
  const statements = [];

  if (existingSchedule) {
    statements.push(
      sql`
        UPDATE parenting_schedules
        SET
          anchor_date = ${anchorDate},
          end_date = ${endDate},
          active = true,
          updated_at = now()
        WHERE id = ${scheduleId}
          AND calendar_id = ${session.calendarId}
      `,
      sql`
        DELETE FROM parenting_schedule_slots
        WHERE schedule_id = ${scheduleId}
      `,
      sql`
        DELETE FROM parenting_schedule_children
        WHERE schedule_id = ${scheduleId}
      `,
    );
  } else {
    statements.push(sql`
      INSERT INTO parenting_schedules (
        id, calendar_id, anchor_date, end_date, active,
        created_by, created_at, updated_at
      )
      VALUES (
        ${scheduleId}, ${session.calendarId}, ${anchorDate},
        ${endDate}, true, ${session.participantId}, now(), now()
      )
    `);
  }

  for (let slotIndex = 0; slotIndex < pattern.length; slotIndex += 1) {
    const slot = pattern[slotIndex];
    if (!slot.morningParentId && !slot.afternoonParentId) continue;

    statements.push(sql`
      INSERT INTO parenting_schedule_slots (
        schedule_id, slot_index, morning_parent_id, afternoon_parent_id
      )
      VALUES (
        ${scheduleId}, ${slotIndex},
        ${slot.morningParentId}, ${slot.afternoonParentId}
      )
    `);
  }

  for (const child of childRows) {
    statements.push(sql`
      INSERT INTO parenting_schedule_children (
        schedule_id, child_id
      )
      VALUES (${scheduleId}, ${child.id})
    `);
  }

  statements.push(
    sql`
      INSERT INTO audit_log (
        calendar_id, actor_participant_id, action, entity_type,
        entity_id, before_state, after_state
      )
      VALUES (
        ${session.calendarId},
        ${session.participantId},
        ${existingSchedule
          ? "recurring_schedule.update"
          : "recurring_schedule.create"},
        'recurring_schedule',
        ${scheduleId},
        ${JSON.stringify({
          schedule: existingSchedule ?? null,
        })}::jsonb,
        ${JSON.stringify({
          scheduleId,
          anchorDate,
          endDate,
          pattern,
        })}::jsonb
      )
    `,
    buildCalendarSyncJobStatement(sql, {
      calendarId: session.calendarId,
      jobType: "full",
    }),
  );

  try {
    await sql.transaction(statements);
  } catch {
    throw new ParentingScheduleServiceError(
      409,
      "The repeating schedule could not be saved. Please refresh and try again.",
    );
  }

  kickGoogleCalendarSync(session.calendarId);

  return {
    ok: true as const,
    pending: false as const,
    scheduleId,
    anchorDate,
    endDate,
    pattern,
  };
}

export async function deleteParentingSchedule(input: {
  session: ParentingScheduleSession;
  scheduleId: string;
  reason: string | null;
}) {
  const { session, scheduleId, reason } = input;
  const savedSchedules =
    await loadSavedParentingSchedules(session.calendarId);
  const existing = savedSchedules.find(
    (schedule) => schedule.scheduleId === scheduleId,
  );

  if (!existing) {
    throw new ParentingScheduleServiceError(
      404,
      "That saved schedule could not be found.",
    );
  }

  const custodyApprovalRequired =
    repeatingScheduleDeleteRequiresApproval(existing);

  if (custodyApprovalRequired) {
    try {
      const approvalTarget =
        await sharedApprovalTargetForSession(session);

      if (
        approvalTarget.required &&
        approvalTarget.approverMembershipId
      ) {
      const result = await createApprovalProposal({
        calendarId: session.calendarId,
        actor: approvalActorFromSession(session),
        entityType: "parenting_schedule",
        entityId: session.calendarId,
        action: "delete",
        previousState: {
          kind: "recurring_schedule_snapshot",
          schedule: existing,
        },
        proposedState: {
          kind: "recurring_schedule",
          mode: "delete",
          scheduleId,
        },
        reason,
        approverMembershipId:
          approvalTarget.approverMembershipId,
      });

      return {
        ok: true as const,
        pending: true as const,
        proposalId: result?.proposal.id ?? null,
        approverName:
          result?.proposal.approverName ??
          approvalTarget.approverName,
        scheduleId,
        };
      }
    } catch (error) {
      serviceFailure(
        error,
        "The repeating schedule proposal could not be saved.",
      );
    }
  }

  const sql = getSql();

  try {
    await sql.transaction([
      sql`
        UPDATE parenting_schedules
        SET active = false, updated_at = now()
        WHERE id = ${scheduleId}
          AND calendar_id = ${session.calendarId}
          AND active = true
      `,
      sql`
        INSERT INTO audit_log (
          calendar_id, actor_participant_id, action, entity_type,
          entity_id, before_state, after_state
        )
        VALUES (
          ${session.calendarId},
          ${session.participantId},
          'recurring_schedule.delete',
          'recurring_schedule',
          ${scheduleId},
          ${JSON.stringify({ schedule: existing })}::jsonb,
          ${JSON.stringify({
            scheduleId,
            deleted: true,
          })}::jsonb
        )
      `,
      buildCalendarSyncJobStatement(sql, {
        calendarId: session.calendarId,
        jobType: "full",
      }),
    ]);
  } catch {
    throw new ParentingScheduleServiceError(
      409,
      "That saved schedule could not be deleted.",
    );
  }

  kickGoogleCalendarSync(session.calendarId);
  return {
    ok: true as const,
    pending: false as const,
    scheduleId,
  };
}
