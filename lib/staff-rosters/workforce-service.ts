import { randomUUID } from "node:crypto";
import { addDays, format, parseISO } from "date-fns";
import { and, asc, desc, eq, sql as drizzleSql } from "drizzle-orm";
import { getDb, getSql } from "@/lib/db";
import {
  auditLog,
  staffRosterClockSessions,
  staffRosterLeaveRequests,
  staffRosterMembers,
  staffRosterPublishedShifts,
  staffRosterTimesheetCorrections,
  staffRosterWeekPublications,
} from "@/lib/db/schema";
import { localDateInTimeZone } from "@/lib/calendar/time";
import { staffRosterCapabilities } from "@/lib/staff-rosters/capabilities";
import { qualifyStaffClockIn } from "@/lib/staff-rosters/clocking-policy";
import {
  ensureStaffRosterMember,
  StaffRosterServiceError,
} from "@/lib/staff-rosters/service";

type StaffSession = {
  calendarId: string;
  calendarType: string;
  calendarTimezone: string;
  membershipId: string;
  permission: "owner" | "editor" | "viewer";
  userName: string | null;
  userEmail: string;
};

function localTimeMinutes(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-NZ", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

function timeMinutes(value: string) {
  const [hour, minute] = value.slice(0, 5).split(":").map(Number);
  return hour * 60 + minute;
}

async function findPublishedShiftForClockIn(
  session: StaffSession,
  memberId: string,
  now: Date,
) {
  const today = localDateInTimeZone(session.calendarTimezone, now);
  const rows = await getDb()
    .select({
      id: staffRosterPublishedShifts.id,
      date: staffRosterPublishedShifts.shiftDate,
      startTime: staffRosterPublishedShifts.startTime,
      endTime: staffRosterPublishedShifts.endTime,
    })
    .from(staffRosterPublishedShifts)
    .innerJoin(
      staffRosterWeekPublications,
      eq(
        staffRosterPublishedShifts.publicationId,
        staffRosterWeekPublications.id,
      ),
    )
    .where(
      and(
        eq(staffRosterWeekPublications.calendarId, session.calendarId),
        eq(staffRosterPublishedShifts.memberId, memberId),
        eq(staffRosterPublishedShifts.shiftDate, today),
      ),
    )
    .orderBy(asc(staffRosterPublishedShifts.startTime));

  const currentMinutes = localTimeMinutes(now, session.calendarTimezone);
  const candidates = rows
    .map((shift) => ({
      ...shift,
      distance: Math.abs(timeMinutes(shift.startTime) - currentMinutes),
      inWindow:
        currentMinutes >= timeMinutes(shift.startTime) - 120 &&
        currentMinutes <= timeMinutes(shift.endTime) + 240,
    }))
    .filter((shift) => shift.inWindow)
    .sort((a, b) => a.distance - b.distance);

  return candidates[0] ?? null;
}

export async function getClockState(session: StaffSession) {
  const current = await ensureStaffRosterMember(session);
  const capabilities = staffRosterCapabilities({
    accessRole: current.accessRole,
    permission: session.permission,
  });
  if (!capabilities.clockOwnTime) {
    throw new StaffRosterServiceError(403, "Clock access is not available.");
  }

  const active = await getDb()
    .select({
      id: staffRosterClockSessions.id,
      clockInAt: staffRosterClockSessions.clockInAt,
      scheduledDate: staffRosterClockSessions.scheduledDate,
      scheduledStartTime: staffRosterClockSessions.scheduledStartTime,
      scheduledEndTime: staffRosterClockSessions.scheduledEndTime,
      unrostered: staffRosterClockSessions.unrostered,
    })
    .from(staffRosterClockSessions)
    .where(
      and(
        eq(staffRosterClockSessions.calendarId, session.calendarId),
        eq(staffRosterClockSessions.memberId, current.id),
        drizzleSql`${staffRosterClockSessions.clockOutAt} IS NULL`,
      ),
    )
    .limit(1);

  const now = new Date();
  const rosteredShift = await findPublishedShiftForClockIn(
    session,
    current.id,
    now,
  );

  return {
    currentMemberId: current.id,
    timezone: session.calendarTimezone,
    activeSession: active[0] ?? null,
    matchingShift: rosteredShift
      ? {
          id: rosteredShift.id,
          date: rosteredShift.date,
          startTime: rosteredShift.startTime.slice(0, 5),
          endTime: rosteredShift.endTime.slice(0, 5),
        }
      : null,
  };
}

export async function clockIn(input: {
  session: StaffSession;
  confirmUnrostered: boolean;
}) {
  const current = await ensureStaffRosterMember(input.session);
  const capabilities = staffRosterCapabilities({
    accessRole: current.accessRole,
    permission: input.session.permission,
  });
  if (!capabilities.clockOwnTime) {
    throw new StaffRosterServiceError(403, "Clock access is not available.");
  }

  const existing = await getDb()
    .select({ id: staffRosterClockSessions.id })
    .from(staffRosterClockSessions)
    .where(
      and(
        eq(staffRosterClockSessions.calendarId, input.session.calendarId),
        eq(staffRosterClockSessions.memberId, current.id),
        drizzleSql`${staffRosterClockSessions.clockOutAt} IS NULL`,
      ),
    )
    .limit(1);

  const now = new Date();
  const matchingShift = await findPublishedShiftForClockIn(
    input.session,
    current.id,
    now,
  );

  const qualification = qualifyStaffClockIn({
    hasActiveSession: Boolean(existing[0]),
    hasMatchingPublishedShift: Boolean(matchingShift),
    confirmUnrostered: input.confirmUnrostered,
  });

  if (!qualification.allowed) {
    throw qualification.code === "active_clock_session"
      ? new StaffRosterServiceError(
          409,
          "You are already clocked in.",
          qualification.code,
        )
      : new StaffRosterServiceError(
          409,
          "Covie cannot find a published rostered shift near the current time. Confirm if you still need to clock in.",
          qualification.code,
        );
  }

  const id = randomUUID();
  const sql = getSql();
  try {
    await sql.transaction([
      sql`
        INSERT INTO staff_roster_clock_sessions (
          id, calendar_id, member_id, published_shift_id,
          scheduled_date, scheduled_start_time, scheduled_end_time,
          clock_in_at, unrostered
        )
        VALUES (
          ${id}, ${input.session.calendarId}, ${current.id},
          ${matchingShift?.id ?? null},
          ${matchingShift?.date ?? null},
          ${matchingShift?.startTime ?? null},
          ${matchingShift?.endTime ?? null},
          now(), ${qualification.unrostered}
        )
      `,
      sql`
        INSERT INTO audit_log (
          calendar_id, actor_participant_id, action,
          entity_type, entity_id, after_state
        )
        VALUES (
          ${input.session.calendarId}, NULL,
          'staff_roster.clock.in',
          'staff_roster_clock_session', ${id},
          ${JSON.stringify({
            memberId: current.id,
            publishedShiftId: matchingShift?.id ?? null,
            unrostered: !matchingShift,
          })}::jsonb
        )
      `,
    ]);
  } catch {
    throw new StaffRosterServiceError(
      409,
      "You could not be clocked in. Refresh and try again.",
      "active_clock_session",
    );
  }

  return { ok: true as const, id, unrostered: qualification.unrostered };
}

export async function clockOut(session: StaffSession) {
  const current = await ensureStaffRosterMember(session);
  const capabilities = staffRosterCapabilities({
    accessRole: current.accessRole,
    permission: session.permission,
  });
  if (!capabilities.clockOwnTime) {
    throw new StaffRosterServiceError(403, "Clock access is not available.");
  }

  const sql = getSql();
  let ended: Array<{ id: string }>;

  try {
    ended = (await sql`
      WITH ended AS (
        UPDATE staff_roster_clock_sessions
        SET clock_out_at = now(), updated_at = now()
        WHERE calendar_id = ${session.calendarId}
          AND member_id = ${current.id}
          AND clock_out_at IS NULL
        RETURNING id
      )
      INSERT INTO audit_log (
        calendar_id, actor_participant_id, action,
        entity_type, entity_id, after_state
      )
      SELECT
        ${session.calendarId}, NULL,
        'staff_roster.clock.out',
        'staff_roster_clock_session', ended.id,
        ${JSON.stringify({ memberId: current.id })}::jsonb
      FROM ended
      RETURNING entity_id AS "id"
    `) as unknown as Array<{ id: string }>;
  } catch {
    throw new StaffRosterServiceError(
      409,
      "Clock out could not be recorded. Refresh your clock status and try again.",
    );
  }

  if (!ended[0]) {
    throw new StaffRosterServiceError(
      409,
      "There is no active clock session to finish.",
      "no_active_clock_session",
    );
  }

  return { ok: true as const, id: ended[0].id };
}

function readAuditTimestamp(value: unknown, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const timestamp = (value as Record<string, unknown>)[key];
  return typeof timestamp === "string" ? timestamp : null;
}

export async function getTimesheet(input: {
  session: StaffSession;
  weekStart: string;
}) {
  const current = await ensureStaffRosterMember(input.session);
  const capabilities = staffRosterCapabilities({
    accessRole: current.accessRole,
    permission: input.session.permission,
  });
  const weekEnd = format(addDays(parseISO(input.weekStart), 6), "yyyy-MM-dd");
  const db = getDb();
  const memberCondition = capabilities.reviewTimesheets
    ? drizzleSql`true`
    : eq(staffRosterClockSessions.memberId, current.id);
  const publishedMemberCondition = capabilities.reviewTimesheets
    ? drizzleSql`true`
    : eq(staffRosterPublishedShifts.memberId, current.id);

  const [sessions, scheduledShifts, corrections] = await Promise.all([
    db
      .select({
        id: staffRosterClockSessions.id,
        memberId: staffRosterClockSessions.memberId,
        memberName: staffRosterMembers.displayName,
        scheduledDate: staffRosterClockSessions.scheduledDate,
        scheduledStartTime: staffRosterClockSessions.scheduledStartTime,
        scheduledEndTime: staffRosterClockSessions.scheduledEndTime,
        clockInAt: staffRosterClockSessions.clockInAt,
        clockOutAt: staffRosterClockSessions.clockOutAt,
        unrostered: staffRosterClockSessions.unrostered,
        correctedAt: staffRosterClockSessions.correctedAt,
      })
      .from(staffRosterClockSessions)
      .innerJoin(
        staffRosterMembers,
        eq(staffRosterClockSessions.memberId, staffRosterMembers.id),
      )
      .where(
        and(
          eq(staffRosterClockSessions.calendarId, input.session.calendarId),
          drizzleSql`(${staffRosterClockSessions.clockInAt} AT TIME ZONE ${input.session.calendarTimezone})::date >= ${input.weekStart}::date`,
          drizzleSql`(${staffRosterClockSessions.clockInAt} AT TIME ZONE ${input.session.calendarTimezone})::date <= ${weekEnd}::date`,
          memberCondition,
        ),
      )
      .orderBy(asc(staffRosterClockSessions.clockInAt)),
    db
      .select({
        id: staffRosterPublishedShifts.id,
        memberId: staffRosterPublishedShifts.memberId,
        memberName: staffRosterMembers.displayName,
        date: staffRosterPublishedShifts.shiftDate,
        startTime: staffRosterPublishedShifts.startTime,
        endTime: staffRosterPublishedShifts.endTime,
      })
      .from(staffRosterPublishedShifts)
      .innerJoin(
        staffRosterWeekPublications,
        eq(
          staffRosterPublishedShifts.publicationId,
          staffRosterWeekPublications.id,
        ),
      )
      .innerJoin(
        staffRosterMembers,
        eq(staffRosterPublishedShifts.memberId, staffRosterMembers.id),
      )
      .where(
        and(
          eq(staffRosterWeekPublications.calendarId, input.session.calendarId),
          drizzleSql`${staffRosterPublishedShifts.shiftDate} >= ${input.weekStart}`,
          drizzleSql`${staffRosterPublishedShifts.shiftDate} <= ${weekEnd}`,
          publishedMemberCondition,
        ),
      )
      .orderBy(
        asc(staffRosterPublishedShifts.shiftDate),
        asc(staffRosterPublishedShifts.startTime),
      ),
    db
      .select({
        id: staffRosterTimesheetCorrections.id,
        memberId: staffRosterTimesheetCorrections.memberId,
        memberName: staffRosterMembers.displayName,
        clockSessionId: staffRosterTimesheetCorrections.clockSessionId,
        requestedClockInAt: staffRosterTimesheetCorrections.requestedClockInAt,
        requestedClockOutAt: staffRosterTimesheetCorrections.requestedClockOutAt,
        reason: staffRosterTimesheetCorrections.reason,
        status: staffRosterTimesheetCorrections.status,
        reviewedAt: staffRosterTimesheetCorrections.reviewedAt,
        createdAt: staffRosterTimesheetCorrections.createdAt,
        currentClockInAt: staffRosterClockSessions.clockInAt,
        currentClockOutAt: staffRosterClockSessions.clockOutAt,
        requestBeforeState: auditLog.beforeState,
      })
      .from(staffRosterTimesheetCorrections)
      .innerJoin(
        staffRosterMembers,
        eq(staffRosterTimesheetCorrections.memberId, staffRosterMembers.id),
      )
      .innerJoin(
        staffRosterClockSessions,
        eq(
          staffRosterTimesheetCorrections.clockSessionId,
          staffRosterClockSessions.id,
        ),
      )
      .leftJoin(
        auditLog,
        and(
          eq(auditLog.entityId, staffRosterTimesheetCorrections.id),
          eq(auditLog.entityType, "staff_roster_timesheet_correction"),
          eq(auditLog.action, "staff_roster.timesheet_correction.request"),
        ),
      )
      .where(
        and(
          eq(staffRosterTimesheetCorrections.calendarId, input.session.calendarId),
          capabilities.reviewTimesheets
            ? drizzleSql`true`
            : eq(staffRosterTimesheetCorrections.memberId, current.id),
          drizzleSql`(${staffRosterClockSessions.clockInAt} AT TIME ZONE ${input.session.calendarTimezone})::date >= ${input.weekStart}::date`,
          drizzleSql`(${staffRosterClockSessions.clockInAt} AT TIME ZONE ${input.session.calendarTimezone})::date <= ${weekEnd}::date`,
        ),
      )
      .orderBy(desc(staffRosterTimesheetCorrections.createdAt)),
  ]);

  return {
    weekStart: input.weekStart,
    weekEnd,
    currentMemberId: current.id,
    currentAccessRole: current.accessRole,
    canReview: capabilities.reviewTimesheets,
    timezone: input.session.calendarTimezone,
    scheduledShifts: scheduledShifts.map((shift) => ({
      ...shift,
      startTime: shift.startTime.slice(0, 5),
      endTime: shift.endTime.slice(0, 5),
    })),
    sessions,
    corrections: corrections.map((correction) => {
      const {
        requestBeforeState,
        currentClockInAt,
        currentClockOutAt,
        ...visible
      } = correction;

      return {
        ...visible,
        originalClockInAt:
          readAuditTimestamp(requestBeforeState, "clockInAt") ??
          currentClockInAt,
        originalClockOutAt:
          readAuditTimestamp(requestBeforeState, "clockOutAt") ??
          currentClockOutAt,
        currentClockInAt,
        currentClockOutAt,
      };
    }),
  };
}

export async function requestTimesheetCorrection(input: {
  session: StaffSession;
  clockSessionId: string;
  requestedClockInAt: string | null;
  requestedClockOutAt: string | null;
  reason: string;
}) {
  const current = await ensureStaffRosterMember(input.session);
  const capabilities = staffRosterCapabilities({
    accessRole: current.accessRole,
    permission: input.session.permission,
  });
  if (!capabilities.requestOwnTimesheetCorrection) {
    throw new StaffRosterServiceError(403, "Correction requests are not available.");
  }

  const requestedIn = input.requestedClockInAt
    ? new Date(input.requestedClockInAt)
    : null;
  const requestedOut = input.requestedClockOutAt
    ? new Date(input.requestedClockOutAt)
    : null;
  const id = randomUUID();
  const sql = getSql();

  const outcome = (await sql`
    WITH locked AS (
      SELECT pg_advisory_xact_lock(
        hashtextextended(${input.clockSessionId}::text, 0)
      ) AS acquired
    ),
    target AS (
      SELECT
        clock_session.id,
        clock_session.clock_in_at,
        clock_session.clock_out_at
      FROM locked
      JOIN staff_roster_clock_sessions clock_session ON true
      WHERE clock_session.id = ${input.clockSessionId}
        AND clock_session.calendar_id = ${input.session.calendarId}
        AND clock_session.member_id = ${current.id}
    ),
    qualified AS (
      SELECT
        target.*,
        COALESCE(${requestedIn}::timestamptz, target.clock_in_at)
          AS effective_clock_in_at,
        COALESCE(${requestedOut}::timestamptz, target.clock_out_at)
          AS effective_clock_out_at,
        (
          (
            ${requestedIn}::timestamptz IS NOT NULL
            AND ${requestedIn}::timestamptz IS DISTINCT FROM target.clock_in_at
          )
          OR
          (
            ${requestedOut}::timestamptz IS NOT NULL
            AND ${requestedOut}::timestamptz IS DISTINCT FROM target.clock_out_at
          )
        ) AS has_change
      FROM target
    ),
    existing_pending AS (
      SELECT correction.id
      FROM staff_roster_timesheet_corrections correction
      JOIN target ON target.id = correction.clock_session_id
      WHERE correction.calendar_id = ${input.session.calendarId}
        AND correction.status = 'pending'
      LIMIT 1
    ),
    created AS (
      INSERT INTO staff_roster_timesheet_corrections (
        id, calendar_id, member_id, clock_session_id,
        requested_clock_in_at, requested_clock_out_at, reason
      )
      SELECT
        ${id},
        ${input.session.calendarId},
        ${current.id},
        qualified.id,
        ${requestedIn},
        ${requestedOut},
        ${input.reason}
      FROM qualified
      WHERE qualified.has_change
        AND (
          qualified.effective_clock_out_at IS NULL
          OR qualified.effective_clock_out_at > qualified.effective_clock_in_at
        )
        AND NOT EXISTS (SELECT 1 FROM existing_pending)
      RETURNING id, clock_session_id
    ),
    audited AS (
      INSERT INTO audit_log (
        calendar_id, actor_participant_id, action,
        entity_type, entity_id, before_state, after_state
      )
      SELECT
        ${input.session.calendarId},
        NULL,
        'staff_roster.timesheet_correction.request',
        'staff_roster_timesheet_correction',
        created.id,
        jsonb_build_object(
          'memberId', ${current.id},
          'clockSessionId', created.clock_session_id,
          'clockInAt', target.clock_in_at,
          'clockOutAt', target.clock_out_at
        ),
        jsonb_build_object(
          'memberId', ${current.id},
          'clockSessionId', created.clock_session_id,
          'requestedClockInAt', ${requestedIn}::timestamptz,
          'requestedClockOutAt', ${requestedOut}::timestamptz,
          'reason', ${input.reason}
        )
      FROM created
      JOIN target ON target.id = created.clock_session_id
      RETURNING entity_id
    )
    SELECT created.id, 'created'::text AS result
    FROM created
    UNION ALL
    SELECT
      NULL::uuid AS id,
      CASE
        WHEN NOT EXISTS (SELECT 1 FROM target) THEN 'not_found'
        WHEN EXISTS (SELECT 1 FROM existing_pending) THEN 'pending'
        WHEN EXISTS (
          SELECT 1 FROM qualified WHERE qualified.has_change = false
        ) THEN 'no_change'
        WHEN EXISTS (
          SELECT 1
          FROM qualified
          WHERE qualified.effective_clock_out_at IS NOT NULL
            AND qualified.effective_clock_out_at <= qualified.effective_clock_in_at
        ) THEN 'invalid_order'
        ELSE 'conflict'
      END AS result
    WHERE NOT EXISTS (SELECT 1 FROM created)
    LIMIT 1
  `) as unknown as Array<{ id: string | null; result: string }>;

  switch (outcome[0]?.result) {
    case "created":
      return { ok: true as const, id: outcome[0].id ?? id };
    case "not_found":
      throw new StaffRosterServiceError(404, "Timesheet entry not found.");
    case "pending":
      throw new StaffRosterServiceError(
        409,
        "A correction is already waiting for review.",
      );
    case "no_change":
      throw new StaffRosterServiceError(
        400,
        "Those times already match the recorded entry. Change a time before sending a correction.",
      );
    case "invalid_order":
      throw new StaffRosterServiceError(
        400,
        "The corrected finish time must be after the start time.",
      );
    default:
      throw new StaffRosterServiceError(
        409,
        "The correction could not be saved. Refresh the timesheet and try again.",
      );
  }
}

export async function reviewTimesheetCorrection(input: {
  session: StaffSession;
  correctionId: string;
  decision: "approved" | "declined";
}) {
  const actor = await ensureStaffRosterMember(input.session);
  const capabilities = staffRosterCapabilities({
    accessRole: actor.accessRole,
    permission: input.session.permission,
  });
  if (!capabilities.reviewTimesheets) {
    throw new StaffRosterServiceError(403, "Manager access is required.");
  }

  const sql = getSql();
  const outcome = (await sql`
    WITH identified AS (
      SELECT correction.id, correction.clock_session_id
      FROM staff_roster_timesheet_corrections correction
      WHERE correction.id = ${input.correctionId}
        AND correction.calendar_id = ${input.session.calendarId}
    ),
    locked AS (
      SELECT
        identified.id,
        identified.clock_session_id,
        pg_advisory_xact_lock(
          hashtextextended(identified.clock_session_id::text, 0)
        ) AS acquired
      FROM identified
    ),
    candidate AS (
      SELECT
        correction.id,
        correction.status,
        correction.member_id,
        correction.clock_session_id,
        correction.requested_clock_in_at,
        correction.requested_clock_out_at,
        clock_session.clock_in_at AS current_clock_in_at,
        clock_session.clock_out_at AS current_clock_out_at,
        COALESCE(
          correction.requested_clock_in_at,
          clock_session.clock_in_at
        ) AS effective_clock_in_at,
        COALESCE(
          correction.requested_clock_out_at,
          clock_session.clock_out_at
        ) AS effective_clock_out_at
      FROM locked
      JOIN staff_roster_timesheet_corrections correction
        ON correction.id = locked.id
       AND correction.calendar_id = ${input.session.calendarId}
      JOIN staff_roster_clock_sessions clock_session
        ON clock_session.id = correction.clock_session_id
       AND clock_session.calendar_id = ${input.session.calendarId}
    ),
    transitioned AS (
      UPDATE staff_roster_timesheet_corrections correction
      SET status = ${input.decision}::staff_roster_correction_status,
          reviewed_by_membership_id = ${input.session.membershipId},
          reviewed_at = now(),
          updated_at = now()
      FROM candidate
      WHERE correction.id = candidate.id
        AND correction.calendar_id = ${input.session.calendarId}
        AND correction.status = 'pending'
        AND (
          ${input.decision}::text = 'declined'
          OR candidate.effective_clock_out_at IS NULL
          OR candidate.effective_clock_out_at > candidate.effective_clock_in_at
        )
      RETURNING
        correction.id,
        candidate.member_id,
        candidate.clock_session_id,
        candidate.current_clock_in_at,
        candidate.current_clock_out_at,
        candidate.effective_clock_in_at,
        candidate.effective_clock_out_at
    ),
    applied AS (
      UPDATE staff_roster_clock_sessions clock_session
      SET clock_in_at = transitioned.effective_clock_in_at,
          clock_out_at = transitioned.effective_clock_out_at,
          corrected_at = now(),
          corrected_by_membership_id = ${input.session.membershipId},
          updated_at = now()
      FROM transitioned
      WHERE ${input.decision}::text = 'approved'
        AND clock_session.id = transitioned.clock_session_id
        AND clock_session.calendar_id = ${input.session.calendarId}
      RETURNING clock_session.id
    ),
    audited AS (
      INSERT INTO audit_log (
        calendar_id, actor_participant_id, action,
        entity_type, entity_id, before_state, after_state
      )
      SELECT
        ${input.session.calendarId},
        NULL,
        'staff_roster.timesheet_correction.review',
        'staff_roster_timesheet_correction',
        transitioned.id,
        jsonb_build_object(
          'status', 'pending',
          'memberId', transitioned.member_id,
          'clockSessionId', transitioned.clock_session_id,
          'clockInAt', transitioned.current_clock_in_at,
          'clockOutAt', transitioned.current_clock_out_at
        ),
        jsonb_build_object(
          'status', ${input.decision}::text,
          'memberId', transitioned.member_id,
          'clockSessionId', transitioned.clock_session_id,
          'clockInAt',
            CASE
              WHEN ${input.decision}::text = 'approved'
                THEN transitioned.effective_clock_in_at
              ELSE transitioned.current_clock_in_at
            END,
          'clockOutAt',
            CASE
              WHEN ${input.decision}::text = 'approved'
                THEN transitioned.effective_clock_out_at
              ELSE transitioned.current_clock_out_at
            END,
          'actorStaffMemberId', ${actor.id}
        )
      FROM transitioned
      RETURNING entity_id
    )
    SELECT transitioned.id, 'reviewed'::text AS result
    FROM transitioned
    UNION ALL
    SELECT
      NULL::uuid AS id,
      CASE
        WHEN NOT EXISTS (SELECT 1 FROM candidate) THEN 'not_found'
        WHEN EXISTS (
          SELECT 1 FROM candidate WHERE candidate.status <> 'pending'
        ) THEN 'already_reviewed'
        WHEN ${input.decision}::text = 'approved'
          AND EXISTS (
            SELECT 1
            FROM candidate
            WHERE candidate.effective_clock_out_at IS NOT NULL
              AND candidate.effective_clock_out_at <= candidate.effective_clock_in_at
          ) THEN 'invalid_order'
        ELSE 'conflict'
      END AS result
    WHERE NOT EXISTS (SELECT 1 FROM transitioned)
    LIMIT 1
  `) as unknown as Array<{ id: string | null; result: string }>;

  switch (outcome[0]?.result) {
    case "reviewed":
      return { ok: true as const };
    case "not_found":
      throw new StaffRosterServiceError(404, "Correction request not found.");
    case "already_reviewed":
      throw new StaffRosterServiceError(
        409,
        "This correction has already been reviewed.",
      );
    case "invalid_order":
      throw new StaffRosterServiceError(
        400,
        "The corrected finish time must be after the start time.",
      );
    default:
      throw new StaffRosterServiceError(
        409,
        "This correction changed while you were reviewing it. Refresh the timesheet and try again.",
      );
  }
}

export async function correctTimesheetSession(input: {
  session: StaffSession;
  clockSessionId: string;
  clockInAt: string;
  clockOutAt: string;
  reason: string | null;
}) {
  const actor = await ensureStaffRosterMember(input.session);
  const capabilities = staffRosterCapabilities({
    accessRole: actor.accessRole,
    permission: input.session.permission,
  });
  if (!capabilities.reviewTimesheets) {
    throw new StaffRosterServiceError(403, "Manager access is required.");
  }

  const correctedIn = new Date(input.clockInAt);
  const correctedOut = new Date(input.clockOutAt);
  if (correctedOut <= correctedIn) {
    throw new StaffRosterServiceError(
      400,
      "The corrected finish time must be after the start time.",
    );
  }

  const sql = getSql();
  const corrected = (await sql`
    WITH locked AS (
      SELECT pg_advisory_xact_lock(
        hashtextextended(${input.clockSessionId}::text, 0)
      ) AS acquired
    ),
    target AS (
      SELECT
        clock_session.id,
        clock_session.member_id,
        clock_session.clock_in_at,
        clock_session.clock_out_at
      FROM locked
      JOIN staff_roster_clock_sessions clock_session ON true
      WHERE clock_session.id = ${input.clockSessionId}
        AND clock_session.calendar_id = ${input.session.calendarId}
    ),
    updated AS (
      UPDATE staff_roster_clock_sessions clock_session
      SET clock_in_at = ${correctedIn},
          clock_out_at = ${correctedOut},
          corrected_at = now(),
          corrected_by_membership_id = ${input.session.membershipId},
          updated_at = now()
      FROM target
      WHERE clock_session.id = target.id
        AND clock_session.calendar_id = ${input.session.calendarId}
      RETURNING
        clock_session.id,
        clock_session.member_id,
        target.clock_in_at AS previous_clock_in_at,
        target.clock_out_at AS previous_clock_out_at
    ),
    cancelled AS (
      UPDATE staff_roster_timesheet_corrections correction
      SET status = 'cancelled',
          reviewed_by_membership_id = ${input.session.membershipId},
          reviewed_at = now(),
          updated_at = now()
      FROM updated
      WHERE correction.calendar_id = ${input.session.calendarId}
        AND correction.clock_session_id = updated.id
        AND correction.status = 'pending'
      RETURNING
        correction.id,
        correction.clock_session_id,
        correction.member_id
    ),
    audited_correction AS (
      INSERT INTO audit_log (
        calendar_id, actor_participant_id, action,
        entity_type, entity_id, before_state, after_state
      )
      SELECT
        ${input.session.calendarId},
        NULL,
        'staff_roster.timesheet.manager_correct',
        'staff_roster_clock_session',
        updated.id,
        jsonb_build_object(
          'memberId', updated.member_id,
          'clockInAt', updated.previous_clock_in_at,
          'clockOutAt', updated.previous_clock_out_at
        ),
        jsonb_build_object(
          'memberId', updated.member_id,
          'clockInAt', ${correctedIn}::timestamptz,
          'clockOutAt', ${correctedOut}::timestamptz,
          'reason', ${input.reason},
          'actorStaffMemberId', ${actor.id}
        )
      FROM updated
      RETURNING entity_id
    ),
    audited_superseded AS (
      INSERT INTO audit_log (
        calendar_id, actor_participant_id, action,
        entity_type, entity_id, before_state, after_state
      )
      SELECT
        ${input.session.calendarId},
        NULL,
        'staff_roster.timesheet_correction.supersede',
        'staff_roster_timesheet_correction',
        cancelled.id,
        jsonb_build_object(
          'status', 'pending',
          'memberId', cancelled.member_id,
          'clockSessionId', cancelled.clock_session_id
        ),
        jsonb_build_object(
          'status', 'cancelled',
          'reason', 'superseded_by_manager_correction',
          'actorStaffMemberId', ${actor.id}
        )
      FROM cancelled
      RETURNING entity_id
    )
    SELECT id FROM updated
  `) as unknown as Array<{ id: string }>;

  if (!corrected[0]) {
    throw new StaffRosterServiceError(404, "Timesheet entry not found.");
  }

  return { ok: true as const };
}

export async function getLeaveRequests(input: {
  session: StaffSession;
  from: string;
  to: string;
}) {
  const current = await ensureStaffRosterMember(input.session);
  const capabilities = staffRosterCapabilities({
    accessRole: current.accessRole,
    permission: input.session.permission,
  });

  const rows = await getDb()
    .select({
      id: staffRosterLeaveRequests.id,
      memberId: staffRosterLeaveRequests.memberId,
      memberName: staffRosterMembers.displayName,
      startDate: staffRosterLeaveRequests.startDate,
      endDate: staffRosterLeaveRequests.endDate,
      allDay: staffRosterLeaveRequests.allDay,
      startTime: staffRosterLeaveRequests.startTime,
      endTime: staffRosterLeaveRequests.endTime,
      note: staffRosterLeaveRequests.note,
      status: staffRosterLeaveRequests.status,
      createdAt: staffRosterLeaveRequests.createdAt,
      reviewedAt: staffRosterLeaveRequests.reviewedAt,
    })
    .from(staffRosterLeaveRequests)
    .innerJoin(
      staffRosterMembers,
      eq(staffRosterLeaveRequests.memberId, staffRosterMembers.id),
    )
    .where(
      and(
        eq(staffRosterLeaveRequests.calendarId, input.session.calendarId),
        drizzleSql`${staffRosterLeaveRequests.startDate} <= ${input.to}`,
        drizzleSql`${staffRosterLeaveRequests.endDate} >= ${input.from}`,
        capabilities.reviewLeave
          ? drizzleSql`true`
          : eq(staffRosterLeaveRequests.memberId, current.id),
      ),
    )
    .orderBy(asc(staffRosterLeaveRequests.startDate), asc(staffRosterMembers.displayName));

  return {
    currentMemberId: current.id,
    currentAccessRole: current.accessRole,
    canReview: capabilities.reviewLeave,
    requests: rows.map((request) => ({
      ...request,
      startTime: request.startTime?.slice(0, 5) ?? null,
      endTime: request.endTime?.slice(0, 5) ?? null,
    })),
  };
}

export async function createLeaveRequest(input: {
  session: StaffSession;
  startDate: string;
  endDate: string;
  allDay: boolean;
  startTime: string | null;
  endTime: string | null;
  note: string | null;
}) {
  const current = await ensureStaffRosterMember(input.session);
  const capabilities = staffRosterCapabilities({
    accessRole: current.accessRole,
    permission: input.session.permission,
  });
  if (!capabilities.requestOwnLeave) {
    throw new StaffRosterServiceError(403, "Leave requests are not available.");
  }

  const id = randomUUID();
  const sql = getSql();
  await sql.transaction([
    sql`
      INSERT INTO staff_roster_leave_requests (
        id, calendar_id, member_id, start_date, end_date,
        all_day, start_time, end_time, note, status
      )
      VALUES (
        ${id}, ${input.session.calendarId}, ${current.id},
        ${input.startDate}, ${input.endDate}, ${input.allDay},
        ${input.allDay ? null : input.startTime},
        ${input.allDay ? null : input.endTime},
        ${input.note}, 'pending'
      )
    `,
    sql`
      INSERT INTO audit_log (
        calendar_id, actor_participant_id, action,
        entity_type, entity_id, after_state
      )
      VALUES (
        ${input.session.calendarId}, NULL,
        'staff_roster.leave.request',
        'staff_roster_leave_request', ${id},
        ${JSON.stringify({
          memberId: current.id,
          startDate: input.startDate,
          endDate: input.endDate,
          allDay: input.allDay,
        })}::jsonb
      )
    `,
  ]);

  return { ok: true as const, id };
}

export async function cancelLeaveRequest(input: {
  session: StaffSession;
  leaveRequestId: string;
}) {
  const current = await ensureStaffRosterMember(input.session);
  const rows = await getDb()
    .select({
      id: staffRosterLeaveRequests.id,
      memberId: staffRosterLeaveRequests.memberId,
      status: staffRosterLeaveRequests.status,
    })
    .from(staffRosterLeaveRequests)
    .where(
      and(
        eq(staffRosterLeaveRequests.id, input.leaveRequestId),
        eq(staffRosterLeaveRequests.calendarId, input.session.calendarId),
      ),
    )
    .limit(1);
  const request = rows[0];

  if (!request || request.memberId !== current.id) {
    throw new StaffRosterServiceError(404, "Leave request not found.");
  }
  if (request.status !== "pending" && request.status !== "approved") {
    throw new StaffRosterServiceError(409, "This leave request cannot be cancelled.");
  }

  const sql = getSql();
  await sql.transaction([
    sql`
      UPDATE staff_roster_leave_requests
      SET status = 'cancelled', updated_at = now()
      WHERE id = ${input.leaveRequestId}
        AND calendar_id = ${input.session.calendarId}
        AND member_id = ${current.id}
        AND status IN ('pending', 'approved')
    `,
    sql`
      INSERT INTO audit_log (
        calendar_id, actor_participant_id, action,
        entity_type, entity_id, after_state
      )
      VALUES (
        ${input.session.calendarId}, NULL,
        'staff_roster.leave.cancel',
        'staff_roster_leave_request', ${input.leaveRequestId},
        ${JSON.stringify({ memberId: current.id })}::jsonb
      )
    `,
  ]);

  return { ok: true as const };
}

export async function reviewLeaveRequest(input: {
  session: StaffSession;
  leaveRequestId: string;
  decision: "approved" | "declined";
}) {
  const actor = await ensureStaffRosterMember(input.session);
  const capabilities = staffRosterCapabilities({
    accessRole: actor.accessRole,
    permission: input.session.permission,
  });
  if (!capabilities.reviewLeave) {
    throw new StaffRosterServiceError(403, "Manager access is required.");
  }

  const rows = await getDb()
    .select({
      id: staffRosterLeaveRequests.id,
      status: staffRosterLeaveRequests.status,
      memberId: staffRosterLeaveRequests.memberId,
    })
    .from(staffRosterLeaveRequests)
    .where(
      and(
        eq(staffRosterLeaveRequests.id, input.leaveRequestId),
        eq(staffRosterLeaveRequests.calendarId, input.session.calendarId),
      ),
    )
    .limit(1);
  const request = rows[0];

  if (!request) {
    throw new StaffRosterServiceError(404, "Leave request not found.");
  }
  if (request.status !== "pending") {
    throw new StaffRosterServiceError(409, "This leave request has already been reviewed.");
  }

  const sql = getSql();
  await sql.transaction([
    sql`
      UPDATE staff_roster_leave_requests
      SET status = ${input.decision}::staff_roster_leave_status,
          reviewed_by_membership_id = ${input.session.membershipId},
          reviewed_at = now(),
          updated_at = now()
      WHERE id = ${input.leaveRequestId}
        AND calendar_id = ${input.session.calendarId}
        AND status = 'pending'
    `,
    sql`
      INSERT INTO audit_log (
        calendar_id, actor_participant_id, action,
        entity_type, entity_id, after_state
      )
      VALUES (
        ${input.session.calendarId}, NULL,
        'staff_roster.leave.review',
        'staff_roster_leave_request', ${input.leaveRequestId},
        ${JSON.stringify({
          memberId: request.memberId,
          decision: input.decision,
          actorStaffMemberId: actor.id,
        })}::jsonb
      )
    `,
  ]);

  return { ok: true as const };
}
