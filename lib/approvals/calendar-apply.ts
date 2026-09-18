import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { getDb, getSql } from "@/lib/db";
import {
  children,
  events,
  participants,
  recurringRules,
} from "@/lib/db/schema";
import {
  ApprovalEngineError,
  getApprovalProposal,
  getApprovalProposalDetails,
} from "@/lib/approvals/engine";
import { canRespondToProposal } from "@/lib/approvals/rules";
import type { ApprovalActor } from "@/lib/approvals/types";
import {
  parentingAssignmentsProposalStateSchema,
  recurringScheduleProposalStateSchema,
  sharedEventProposalStateSchema,
} from "@/lib/approvals/calendar-state";
import {
  buildFortnightRuleText,
  dateForSlot,
  FORTNIGHT_SLOTS,
  scheduleRangesOverlap,
  type RecurrencePeriod,
} from "@/lib/recurrence/fortnight";
import { groupSavedSchedules } from "@/lib/recurrence/saved-schedules";
import {
  buildCalendarSyncJobStatement,
  expandGoogleSyncRange,
} from "@/lib/google-calendar/outbox";

export const CALENDAR_APPROVAL_ENTITY_TYPES = [
  "parenting_schedule",
  "shared_event",
] as const;

function isCalendarApprovalEntityType(value: string) {
  return CALENDAR_APPROVAL_ENTITY_TYPES.includes(
    value as (typeof CALENDAR_APPROVAL_ENTITY_TYPES)[number],
  );
}

function acceptanceTransitionStatement(
  sql: ReturnType<typeof getSql>,
  input: {
    proposalId: string;
    calendarId: string;
    actorMembershipId: string;
    respondedAt: Date;
  },
) {
  return sql`
    UPDATE approval_proposals
    SET status = 'approved', responded_at = ${input.respondedAt}, updated_at = now()
    WHERE id = ${input.proposalId}
      AND calendar_id = ${input.calendarId}
      AND status = 'waiting'
      AND approver_membership_id = ${input.actorMembershipId}
  `;
}

function acceptanceHistoryStatement(
  sql: ReturnType<typeof getSql>,
  input: {
    proposalId: string;
    calendarId: string;
    actor: ApprovalActor;
    respondedAt: Date;
  },
) {
  return sql`
    INSERT INTO approval_proposal_history (
      proposal_id,
      calendar_id,
      actor_membership_id,
      actor_participant_id,
      event_type,
      from_status,
      to_status,
      details
    )
    SELECT
      proposal.id,
      proposal.calendar_id,
      ${input.actor.membershipId},
      ${input.actor.participantId},
      'proposal.approved',
      'waiting',
      'approved',
      jsonb_build_object('applied', true)
    FROM approval_proposals proposal
    WHERE proposal.id = ${input.proposalId}
      AND proposal.calendar_id = ${input.calendarId}
      AND proposal.status = 'approved'
      AND proposal.approver_membership_id = ${input.actor.membershipId}
      AND proposal.responded_at = ${input.respondedAt}
  `;
}

function acceptanceAuditStatement(
  sql: ReturnType<typeof getSql>,
  input: {
    proposalId: string;
    calendarId: string;
    actor: ApprovalActor;
    respondedAt: Date;
  },
) {
  return sql`
    INSERT INTO audit_log (
      calendar_id,
      actor_participant_id,
      action,
      entity_type,
      entity_id,
      before_state,
      after_state
    )
    SELECT
      proposal.calendar_id,
      ${input.actor.participantId},
      'proposal.accept',
      'proposal',
      proposal.id,
      jsonb_build_object('status', 'waiting'),
      jsonb_build_object(
        'status', 'approved',
        'targetEntityType', proposal.entity_type,
        'targetEntityId', proposal.entity_id,
        'applied', true
      )
    FROM approval_proposals proposal
    WHERE proposal.id = ${input.proposalId}
      AND proposal.calendar_id = ${input.calendarId}
      AND proposal.status = 'approved'
      AND proposal.approver_membership_id = ${input.actor.membershipId}
      AND proposal.responded_at = ${input.respondedAt}
  `;
}

async function verifyAccepted(
  calendarId: string,
  proposalId: string,
) {
  const details = await getApprovalProposalDetails(calendarId, proposalId);
  if (!details || details.proposal.status !== "approved") {
    throw new ApprovalEngineError(
      409,
      "This proposal is no longer waiting for your approval.",
    );
  }
  return details;
}

async function applySharedEventProposal(input: {
  calendarId: string;
  actor: ApprovalActor;
  proposal: NonNullable<Awaited<ReturnType<typeof getApprovalProposal>>>;
}) {
  const proposed = sharedEventProposalStateSchema.safeParse(input.proposal.proposedState);
  const previous = sharedEventProposalStateSchema.safeParse(input.proposal.previousState);
  if (!proposed.success) {
    throw new ApprovalEngineError(409, "This event proposal is missing its proposed details.");
  }

  const action = input.proposal.action;
  const event = proposed.data.event;
  const previousEvent = previous.success ? previous.data.event : null;

  if ((action === "create" || action === "edit") && !event) {
    throw new ApprovalEngineError(409, "This event proposal is missing its proposed event.");
  }
  if ((action === "edit" || action === "delete") && !previousEvent) {
    throw new ApprovalEngineError(409, "This event proposal is missing the agreed event.");
  }

  if (action === "edit" || action === "delete") {
    const targetRows = await getDb()
      .select({ id: events.id })
      .from(events)
      .where(
        and(
          eq(events.id, input.proposal.entityId),
          eq(events.calendarId, input.calendarId),
        ),
      )
      .limit(1);
    if (!targetRows[0]) {
      throw new ApprovalEngineError(
        409,
        "The agreed event changed before this proposal could be approved.",
      );
    }
  }

  const responseAt = new Date();
  const sql = getSql();
  const markerInput = {
    proposalId: input.proposal.id,
    calendarId: input.calendarId,
    actorMembershipId: input.actor.membershipId,
    respondedAt: responseAt,
  };
  const statements = [
    acceptanceTransitionStatement(sql, markerInput),
  ];

  if (action === "create" && event) {
    statements.push(sql`
      INSERT INTO events (
        id,
        calendar_id,
        start_date,
        end_date,
        title,
        description,
        category,
        created_by,
        created_at,
        updated_at
      )
      SELECT
        ${event.id},
        ${input.calendarId},
        ${event.startDate},
        ${event.endDate},
        ${event.title},
        ${event.description},
        ${event.category},
        ${input.actor.participantId},
        now(),
        now()
      WHERE EXISTS (
        SELECT 1
        FROM approval_proposals approval_marker
        WHERE approval_marker.id = ${markerInput.proposalId}
          AND approval_marker.calendar_id = ${markerInput.calendarId}
          AND approval_marker.status = 'approved'
          AND approval_marker.approver_membership_id = ${markerInput.actorMembershipId}
          AND approval_marker.responded_at = ${markerInput.respondedAt}
      )
      ON CONFLICT (id) DO NOTHING
    `);
  } else if (action === "edit" && event) {
    statements.push(sql`
      UPDATE events
      SET
        start_date = ${event.startDate},
        end_date = ${event.endDate},
        title = ${event.title},
        description = ${event.description},
        category = ${event.category},
        updated_at = now()
      WHERE id = ${input.proposal.entityId}
        AND calendar_id = ${input.calendarId}
        AND EXISTS (
        SELECT 1
        FROM approval_proposals approval_marker
        WHERE approval_marker.id = ${markerInput.proposalId}
          AND approval_marker.calendar_id = ${markerInput.calendarId}
          AND approval_marker.status = 'approved'
          AND approval_marker.approver_membership_id = ${markerInput.actorMembershipId}
          AND approval_marker.responded_at = ${markerInput.respondedAt}
      )
    `);
  } else {
    statements.push(sql`
      DELETE FROM events
      WHERE id = ${input.proposal.entityId}
        AND calendar_id = ${input.calendarId}
        AND EXISTS (
        SELECT 1
        FROM approval_proposals approval_marker
        WHERE approval_marker.id = ${markerInput.proposalId}
          AND approval_marker.calendar_id = ${markerInput.calendarId}
          AND approval_marker.status = 'approved'
          AND approval_marker.approver_membership_id = ${markerInput.actorMembershipId}
          AND approval_marker.responded_at = ${markerInput.respondedAt}
      )
    `);
  }

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
    SELECT
      ${input.calendarId},
      ${input.actor.participantId},
      ${action === "create"
        ? "event.create"
        : action === "edit"
          ? "event.update"
          : "event.delete"},
      'event',
      ${input.proposal.entityId},
      ${JSON.stringify(input.proposal.previousState)}::jsonb,
      ${JSON.stringify(input.proposal.proposedState)}::jsonb
    WHERE EXISTS (
        SELECT 1
        FROM approval_proposals approval_marker
        WHERE approval_marker.id = ${markerInput.proposalId}
          AND approval_marker.calendar_id = ${markerInput.calendarId}
          AND approval_marker.status = 'approved'
          AND approval_marker.approver_membership_id = ${markerInput.actorMembershipId}
          AND approval_marker.responded_at = ${markerInput.respondedAt}
      )
  `);

  const dateValues = [
    previousEvent?.startDate,
    previousEvent?.endDate ?? previousEvent?.startDate,
    event?.startDate,
    event?.endDate ?? event?.startDate,
  ].filter((value): value is string => Boolean(value));
  const from = [...dateValues].sort()[0];
  const to = [...dateValues].sort().at(-1);
  if (from && to) {
    const syncRange = expandGoogleSyncRange(from, to);
    statements.push(
      buildCalendarSyncJobStatement(sql, {
        calendarId: input.calendarId,
        rangeStart: syncRange.from,
        rangeEnd: syncRange.to,
      }),
    );
  }

  statements.push(
    acceptanceHistoryStatement(sql, {
      proposalId: input.proposal.id,
      calendarId: input.calendarId,
      actor: input.actor,
      respondedAt: responseAt,
    }),
    acceptanceAuditStatement(sql, {
      proposalId: input.proposal.id,
      calendarId: input.calendarId,
      actor: input.actor,
      respondedAt: responseAt,
    }),
  );

  await sql.transaction(statements);
  return {
    details: await verifyAccepted(input.calendarId, input.proposal.id),
    googleSyncQueued: Boolean(from && to),
  };
}

async function validateAssignmentProposalState(input: {
  calendarId: string;
  assignments: Array<{
    childId: string;
    morningParentId: string | null;
    afternoonParentId: string | null;
  }>;
}) {
  const childIds = [...new Set(input.assignments.map((row) => row.childId))];
  const parentIds = [
    ...new Set(
      input.assignments
        .flatMap((row) => [row.morningParentId, row.afternoonParentId])
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  const db = getDb();
  const [childRows, parentRows] = await db.batch([
    db
      .select({ id: children.id })
      .from(children)
      .where(
        and(
          eq(children.calendarId, input.calendarId),
          eq(children.active, true),
          inArray(children.id, childIds),
        ),
      ),
    parentIds.length === 0
      ? db
          .select({ id: participants.id })
          .from(participants)
          .where(eq(participants.id, "00000000-0000-0000-0000-000000000000"))
      : db
          .select({ id: participants.id })
          .from(participants)
          .where(
            and(
              eq(participants.calendarId, input.calendarId),
              eq(participants.active, true),
              inArray(participants.id, parentIds),
            ),
          ),
  ]);

  if (childRows.length !== childIds.length || parentRows.length !== parentIds.length) {
    throw new ApprovalEngineError(
      409,
      "The family setup changed before this proposal could be approved.",
    );
  }
}

async function applyParentingAssignmentsProposal(input: {
  calendarId: string;
  actor: ApprovalActor;
  proposal: NonNullable<Awaited<ReturnType<typeof getApprovalProposal>>>;
}) {
  const parsed = parentingAssignmentsProposalStateSchema.safeParse(
    input.proposal.proposedState,
  );
  if (!parsed.success) {
    throw new ApprovalEngineError(
      409,
      "This parenting proposal is missing its proposed schedule.",
    );
  }

  await validateAssignmentProposalState({
    calendarId: input.calendarId,
    assignments: parsed.data.assignments,
  });

  const responseAt = new Date();
  const sql = getSql();
  const markerInput = {
    proposalId: input.proposal.id,
    calendarId: input.calendarId,
    actorMembershipId: input.actor.membershipId,
    respondedAt: responseAt,
  };
  const statements = [acceptanceTransitionStatement(sql, markerInput)];

  for (const assignment of parsed.data.assignments) {
    statements.push(sql`
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
      SELECT
        ${input.calendarId},
        ${assignment.childId},
        ${assignment.date},
        ${assignment.morningParentId},
        ${assignment.afternoonParentId},
        'manual',
        NULL,
        ${assignment.handoverTime},
        ${assignment.handoverLocation},
        ${assignment.note},
        ${input.actor.participantId},
        now()
      WHERE EXISTS (
        SELECT 1
        FROM approval_proposals approval_marker
        WHERE approval_marker.id = ${markerInput.proposalId}
          AND approval_marker.calendar_id = ${markerInput.calendarId}
          AND approval_marker.status = 'approved'
          AND approval_marker.approver_membership_id = ${markerInput.actorMembershipId}
          AND approval_marker.responded_at = ${markerInput.respondedAt}
      )
      ON CONFLICT (calendar_id, child_id, assignment_date)
      DO UPDATE SET
        parent_id = EXCLUDED.parent_id,
        afternoon_parent_id = EXCLUDED.afternoon_parent_id,
        source = 'manual',
        recurring_rule_id = NULL,
        handover_time = EXCLUDED.handover_time,
        handover_location = EXCLUDED.handover_location,
        note = EXCLUDED.note,
        created_by = EXCLUDED.created_by,
        updated_at = now()
    `);
  }

  statements.push(sql`
    INSERT INTO audit_log (
      calendar_id,
      actor_participant_id,
      action,
      entity_type,
      before_state,
      after_state
    )
    SELECT
      ${input.calendarId},
      ${input.actor.participantId},
      'assignment.approved_update',
      'parenting_assignment_batch',
      ${JSON.stringify(input.proposal.previousState)}::jsonb,
      ${JSON.stringify(input.proposal.proposedState)}::jsonb
    WHERE EXISTS (
        SELECT 1
        FROM approval_proposals approval_marker
        WHERE approval_marker.id = ${markerInput.proposalId}
          AND approval_marker.calendar_id = ${markerInput.calendarId}
          AND approval_marker.status = 'approved'
          AND approval_marker.approver_membership_id = ${markerInput.actorMembershipId}
          AND approval_marker.responded_at = ${markerInput.respondedAt}
      )
  `);

  const dates = [...parsed.data.dates].sort();
  const syncRange = expandGoogleSyncRange(dates[0], dates.at(-1)!);
  statements.push(
    buildCalendarSyncJobStatement(sql, {
      calendarId: input.calendarId,
      rangeStart: syncRange.from,
      rangeEnd: syncRange.to,
    }),
    acceptanceHistoryStatement(sql, {
      proposalId: input.proposal.id,
      calendarId: input.calendarId,
      actor: input.actor,
      respondedAt: responseAt,
    }),
    acceptanceAuditStatement(sql, {
      proposalId: input.proposal.id,
      calendarId: input.calendarId,
      actor: input.actor,
      respondedAt: responseAt,
    }),
  );

  await sql.transaction(statements);
  return {
    details: await verifyAccepted(input.calendarId, input.proposal.id),
    googleSyncQueued: true,
  };
}

async function loadActiveRecurringRuleRows(calendarId: string) {
  return getDb()
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
        eq(recurringRules.calendarId, calendarId),
        eq(recurringRules.active, true),
      ),
    );
}

async function applyRecurringScheduleProposal(input: {
  calendarId: string;
  actor: ApprovalActor;
  proposal: NonNullable<Awaited<ReturnType<typeof getApprovalProposal>>>;
}) {
  const parsed = recurringScheduleProposalStateSchema.safeParse(
    input.proposal.proposedState,
  );
  if (!parsed.success) {
    throw new ApprovalEngineError(
      409,
      "This repeating schedule proposal is missing its proposed details.",
    );
  }

  const activeRuleRows = await loadActiveRecurringRuleRows(input.calendarId);
  const schedules = groupSavedSchedules(activeRuleRows);
  const responseAt = new Date();
  const sql = getSql();
  const markerInput = {
    proposalId: input.proposal.id,
    calendarId: input.calendarId,
    actorMembershipId: input.actor.membershipId,
    respondedAt: responseAt,
  };
  const statements = [acceptanceTransitionStatement(sql, markerInput)];

  if (parsed.data.mode === "delete") {
    const deleteState = parsed.data;
    const existing = schedules.find(
      (schedule) => schedule.scheduleId === deleteState.scheduleId,
    );
    if (!existing) {
      throw new ApprovalEngineError(
        409,
        "The agreed repeating schedule changed before this proposal could be approved.",
      );
    }

    const scheduleMarker = `%X-COPARENT-SCHEDULE=${deleteState.scheduleId}%`;
    const ruleIds = activeRuleRows
      .filter((row) => row.rrule.includes(`X-COPARENT-SCHEDULE=${deleteState.scheduleId}`))
      .map((row) => row.id);
    const ruleIdArray = `{${ruleIds.join(",")}}`;

    statements.push(
      sql`
        DELETE FROM parenting_assignments
        WHERE calendar_id = ${input.calendarId}
          AND source = 'recurring'
          AND recurring_rule_id = ANY(${ruleIdArray}::uuid[])
          AND EXISTS (
        SELECT 1
        FROM approval_proposals approval_marker
        WHERE approval_marker.id = ${markerInput.proposalId}
          AND approval_marker.calendar_id = ${markerInput.calendarId}
          AND approval_marker.status = 'approved'
          AND approval_marker.approver_membership_id = ${markerInput.actorMembershipId}
          AND approval_marker.responded_at = ${markerInput.respondedAt}
      )
      `,
      sql`
        UPDATE recurring_rules
        SET active = false, updated_at = now()
        WHERE calendar_id = ${input.calendarId}
          AND active = true
          AND rrule LIKE ${scheduleMarker}
          AND EXISTS (
        SELECT 1
        FROM approval_proposals approval_marker
        WHERE approval_marker.id = ${markerInput.proposalId}
          AND approval_marker.calendar_id = ${markerInput.calendarId}
          AND approval_marker.status = 'approved'
          AND approval_marker.approver_membership_id = ${markerInput.actorMembershipId}
          AND approval_marker.responded_at = ${markerInput.respondedAt}
      )
      `,
    );
  } else {
    const schedule = parsed.data;
    const selectedParentIds = [
      ...new Set(
        schedule.pattern
          .flatMap((slot) => [slot.morningParentId, slot.afternoonParentId])
          .filter((value): value is string => Boolean(value)),
      ),
    ];
    const db = getDb();
    const [parentRows, childRows] = await db.batch([
      db
        .select({ id: participants.id })
        .from(participants)
        .where(
          and(
            eq(participants.calendarId, input.calendarId),
            eq(participants.active, true),
            inArray(participants.id, selectedParentIds),
          ),
        ),
      db
        .select({ id: children.id })
        .from(children)
        .where(
          and(
            eq(children.calendarId, input.calendarId),
            eq(children.active, true),
          ),
        ),
    ]);

    if (
      parentRows.length !== selectedParentIds.length ||
      childRows.length === 0
    ) {
      throw new ApprovalEngineError(
        409,
        "The family setup changed before this repeating schedule could be approved.",
      );
    }

    const existing = schedules.find(
      (schedule) => schedule.scheduleId === schedule.scheduleId,
    );
    if (input.proposal.action === "edit" && !existing) {
      throw new ApprovalEngineError(
        409,
        "The agreed repeating schedule changed before this proposal could be approved.",
      );
    }

    const conflict = schedules.find(
      (schedule) =>
        schedule.scheduleId !== schedule.scheduleId &&
        scheduleRangesOverlap(
          schedule.anchorDate,
          schedule.endDate,
          schedule.anchorDate,
          schedule.endDate,
        ),
    );
    if (conflict) {
      throw new ApprovalEngineError(
        409,
        "Another repeating schedule now overlaps this proposal.",
      );
    }

    const scheduleMarker = `%X-COPARENT-SCHEDULE=${schedule.scheduleId}%`;
    if (existing) {
      statements.push(sql`
        UPDATE recurring_rules
        SET active = false, updated_at = now()
        WHERE calendar_id = ${input.calendarId}
          AND active = true
          AND rrule LIKE ${scheduleMarker}
          AND EXISTS (
        SELECT 1
        FROM approval_proposals approval_marker
        WHERE approval_marker.id = ${markerInput.proposalId}
          AND approval_marker.calendar_id = ${markerInput.calendarId}
          AND approval_marker.status = 'approved'
          AND approval_marker.approver_membership_id = ${markerInput.actorMembershipId}
          AND approval_marker.responded_at = ${markerInput.respondedAt}
      )
      `);
    }

    const addRule = (
      slot: number,
      parentId: string,
      period: RecurrencePeriod,
    ) => {
      const ruleId = randomUUID();
      const startDate = dateForSlot(schedule.anchorDate, slot);
      const rrule = buildFortnightRuleText({
        scheduleId: schedule.scheduleId,
        anchorDate: schedule.anchorDate,
        slot,
        period,
      });

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
        SELECT
          ${ruleId},
          ${input.calendarId},
          ${parentId},
          ${rrule},
          ${startDate},
          ${schedule.endDate},
          true,
          ${input.actor.participantId},
          now(),
          now()
        WHERE EXISTS (
        SELECT 1
        FROM approval_proposals approval_marker
        WHERE approval_marker.id = ${markerInput.proposalId}
          AND approval_marker.calendar_id = ${markerInput.calendarId}
          AND approval_marker.status = 'approved'
          AND approval_marker.approver_membership_id = ${markerInput.actorMembershipId}
          AND approval_marker.responded_at = ${markerInput.respondedAt}
      )
      `);

      for (const child of childRows) {
        statements.push(sql`
          INSERT INTO recurring_rule_children (
            recurring_rule_id,
            child_id
          )
          SELECT
            ${ruleId},
            ${child.id}
          WHERE EXISTS (
        SELECT 1
        FROM approval_proposals approval_marker
        WHERE approval_marker.id = ${markerInput.proposalId}
          AND approval_marker.calendar_id = ${markerInput.calendarId}
          AND approval_marker.status = 'approved'
          AND approval_marker.approver_membership_id = ${markerInput.actorMembershipId}
          AND approval_marker.responded_at = ${markerInput.respondedAt}
      )
        `);
      }
    };

    for (let slot = 0; slot < FORTNIGHT_SLOTS; slot += 1) {
      const ownership = schedule.pattern[slot];
      if (!ownership.morningParentId && !ownership.afternoonParentId) continue;

      if (
        ownership.morningParentId &&
        ownership.morningParentId === ownership.afternoonParentId
      ) {
        addRule(slot, ownership.morningParentId, "full_day");
      } else {
        if (ownership.morningParentId) {
          addRule(slot, ownership.morningParentId, "morning");
        }
        if (ownership.afternoonParentId) {
          addRule(slot, ownership.afternoonParentId, "afternoon");
        }
      }
    }
  }

  statements.push(
    sql`
      INSERT INTO audit_log (
        calendar_id,
        actor_participant_id,
        action,
        entity_type,
        before_state,
        after_state
      )
      SELECT
        ${input.calendarId},
        ${input.actor.participantId},
        ${parsed.data.mode === "delete"
          ? "recurring_schedule.delete"
          : input.proposal.action === "create"
            ? "recurring_schedule.create"
            : "recurring_schedule.update"},
        'recurring_schedule',
        ${JSON.stringify(input.proposal.previousState)}::jsonb,
        ${JSON.stringify(input.proposal.proposedState)}::jsonb
      WHERE EXISTS (
        SELECT 1
        FROM approval_proposals approval_marker
        WHERE approval_marker.id = ${markerInput.proposalId}
          AND approval_marker.calendar_id = ${markerInput.calendarId}
          AND approval_marker.status = 'approved'
          AND approval_marker.approver_membership_id = ${markerInput.actorMembershipId}
          AND approval_marker.responded_at = ${markerInput.respondedAt}
      )
    `,
    buildCalendarSyncJobStatement(sql, {
      calendarId: input.calendarId,
      jobType: "full",
    }),
    acceptanceHistoryStatement(sql, {
      proposalId: input.proposal.id,
      calendarId: input.calendarId,
      actor: input.actor,
      respondedAt: responseAt,
    }),
    acceptanceAuditStatement(sql, {
      proposalId: input.proposal.id,
      calendarId: input.calendarId,
      actor: input.actor,
      respondedAt: responseAt,
    }),
  );

  await sql.transaction(statements);
  return {
    details: await verifyAccepted(input.calendarId, input.proposal.id),
    googleSyncQueued: true,
  };
}

export async function acceptCalendarApprovalProposal(input: {
  calendarId: string;
  actor: ApprovalActor;
  proposalId: string;
}) {
  const proposal = await getApprovalProposal(input.calendarId, input.proposalId);
  if (!proposal || !isCalendarApprovalEntityType(proposal.entityType)) {
    return null;
  }

  if (
    !canRespondToProposal(input.actor, {
      status: proposal.status,
      proposedByMembershipId: proposal.proposedByMembershipId,
      approverMembershipId: proposal.approverMembershipId,
    })
  ) {
    throw new ApprovalEngineError(
      403,
      "Only the parent this was sent to can approve it.",
    );
  }

  if (proposal.entityType === "shared_event") {
    return applySharedEventProposal({
      calendarId: input.calendarId,
      actor: input.actor,
      proposal,
    });
  }

  const assignmentState = parentingAssignmentsProposalStateSchema.safeParse(
    proposal.proposedState,
  );
  if (assignmentState.success) {
    return applyParentingAssignmentsProposal({
      calendarId: input.calendarId,
      actor: input.actor,
      proposal,
    });
  }

  const recurringState = recurringScheduleProposalStateSchema.safeParse(
    proposal.proposedState,
  );
  if (recurringState.success) {
    return applyRecurringScheduleProposal({
      calendarId: input.calendarId,
      actor: input.actor,
      proposal,
    });
  }

  throw new ApprovalEngineError(
    409,
    "This calendar proposal is missing its proposed details.",
  );
}
