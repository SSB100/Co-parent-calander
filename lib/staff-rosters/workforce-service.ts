import { randomUUID } from "node:crypto";
import { addDays, format, parseISO } from "date-fns";
import { and, asc, desc, eq, sql as drizzleSql } from "drizzle-orm";
import { getDb, getSql } from "@/lib/db";
import {
  staffRosterClockSessions,
  staffRosterLeaveRequests,
  staffRosterMembers,
  staffRosterPublishedShifts,
  staffRosterTimesheetCorrections,
  staffRosterWeekPublications,
} from "@/lib/db/schema";
import { localDateInTimeZone } from "@/lib/calendar/time";
import { staffRosterCapabilities } from "@/lib/staff-rosters/capabilities";
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
  const today = localDateInTimeZone(now, session.calendarTimezone);
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

  if (existing[0]) {
    throw new StaffRosterServiceError(
      409,
      "You are already clocked in.",
      "active_clock_session",
    );
  }

  const now = new Date();
  const matchingShift = await findPublishedShiftForClockIn(
    input.session,
    current.id,
    now,
  );

  if (!matchingShift && !input.confirmUnrostered) {
    throw new StaffRosterServiceError(
      409,
      "No rostered shift was found near the current time.",
      "unrostered_confirmation_required",
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
          now(), ${!matchingShift}
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

  return { ok: true as const, id, unrostered: !matchingShift };
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

  const active = await getDb()
    .select({
      id: staffRosterClockSessions.id,
      clockInAt: staffRosterClockSessions.clockInAt,
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

  if (!active[0]) {
    throw new StaffRosterServiceError(
      409,
      "There is no active clock session to finish.",
      "no_active_clock_session",
    );
  }

  const sql = getSql();
  try {
    await sql.transaction([
      sql`
        UPDATE staff_roster_clock_sessions
        SET clock_out_at = now(), updated_at = now()
        WHERE id = ${active[0].id}
          AND calendar_id = ${session.calendarId}
          AND member_id = ${current.id}
          AND clock_out_at IS NULL
      `,
      sql`
        INSERT INTO audit_log (
          calendar_id, actor_participant_id, action,
          entity_type, entity_id, after_state
        )
        VALUES (
          ${session.calendarId}, NULL,
          'staff_roster.clock.out',
          'staff_roster_clock_session', ${active[0].id},
          ${JSON.stringify({ memberId: current.id })}::jsonb
        )
      `,
    ]);
  } catch {
    throw new StaffRosterServiceError(409, "Clock out could not be recorded.");
  }

  return { ok: true as const, id: active[0].id };
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
        createdAt: staffRosterTimesheetCorrections.createdAt,
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
    corrections,
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

  const sessionRows = await getDb()
    .select({
      id: staffRosterClockSessions.id,
      memberId: staffRosterClockSessions.memberId,
      clockInAt: staffRosterClockSessions.clockInAt,
      clockOutAt: staffRosterClockSessions.clockOutAt,
    })
    .from(staffRosterClockSessions)
    .where(
      and(
        eq(staffRosterClockSessions.id, input.clockSessionId),
        eq(staffRosterClockSessions.calendarId, input.session.calendarId),
        eq(staffRosterClockSessions.memberId, current.id),
      ),
    )
    .limit(1);
  const clockSession = sessionRows[0];
  if (!clockSession) {
    throw new StaffRosterServiceError(404, "Timesheet entry not found.");
  }

  const pending = await getDb()
    .select({ id: staffRosterTimesheetCorrections.id })
    .from(staffRosterTimesheetCorrections)
    .where(
      and(
        eq(staffRosterTimesheetCorrections.clockSessionId, input.clockSessionId),
        eq(staffRosterTimesheetCorrections.status, "pending"),
      ),
    )
    .limit(1);
  if (pending[0]) {
    throw new StaffRosterServiceError(
      409,
      "A correction is already waiting for review.",
    );
  }

  const requestedIn = input.requestedClockInAt
    ? new Date(input.requestedClockInAt)
    : null;
  const requestedOut = input.requestedClockOutAt
    ? new Date(input.requestedClockOutAt)
    : null;
  const effectiveIn = requestedIn ?? clockSession.clockInAt;
  const effectiveOut = requestedOut ?? clockSession.clockOutAt;

  if (effectiveOut && effectiveOut <= effectiveIn) {
    throw new StaffRosterServiceError(
      400,
      "The corrected finish time must be after the start time.",
    );
  }

  const id = randomUUID();
  const sql = getSql();
  await sql.transaction([
    sql`
      INSERT INTO staff_roster_timesheet_corrections (
        id, calendar_id, member_id, clock_session_id,
        requested_clock_in_at, requested_clock_out_at, reason
      )
      VALUES (
        ${id}, ${input.session.calendarId}, ${current.id},
        ${input.clockSessionId}, ${requestedIn}, ${requestedOut}, ${input.reason}
      )
    `,
    sql`
      INSERT INTO audit_log (
        calendar_id, actor_participant_id, action,
        entity_type, entity_id, after_state
      )
      VALUES (
        ${input.session.calendarId}, NULL,
        'staff_roster.timesheet_correction.request',
        'staff_roster_timesheet_correction', ${id},
        ${JSON.stringify({
          memberId: current.id,
          clockSessionId: input.clockSessionId,
        })}::jsonb
      )
    `,
  ]);

  return { ok: true as const, id };
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

  const rows = await getDb()
    .select({
      id: staffRosterTimesheetCorrections.id,
      status: staffRosterTimesheetCorrections.status,
      clockSessionId: staffRosterTimesheetCorrections.clockSessionId,
      requestedClockInAt: staffRosterTimesheetCorrections.requestedClockInAt,
      requestedClockOutAt: staffRosterTimesheetCorrections.requestedClockOutAt,
      currentClockInAt: staffRosterClockSessions.clockInAt,
      currentClockOutAt: staffRosterClockSessions.clockOutAt,
    })
    .from(staffRosterTimesheetCorrections)
    .innerJoin(
      staffRosterClockSessions,
      eq(
        staffRosterTimesheetCorrections.clockSessionId,
        staffRosterClockSessions.id,
      ),
    )
    .where(
      and(
        eq(staffRosterTimesheetCorrections.id, input.correctionId),
        eq(staffRosterTimesheetCorrections.calendarId, input.session.calendarId),
      ),
    )
    .limit(1);
  const correction = rows[0];
  if (!correction) {
    throw new StaffRosterServiceError(404, "Correction request not found.");
  }
  if (correction.status !== "pending") {
    throw new StaffRosterServiceError(409, "This correction has already been reviewed.");
  }

  const effectiveIn =
    correction.requestedClockInAt ?? correction.currentClockInAt;
  const effectiveOut =
    correction.requestedClockOutAt ?? correction.currentClockOutAt;
  if (
    input.decision === "approved" &&
    effectiveOut &&
    effectiveOut <= effectiveIn
  ) {
    throw new StaffRosterServiceError(
      400,
      "The corrected finish time must be after the start time.",
    );
  }

  const sql = getSql();
  const statements = [
    sql`
      UPDATE staff_roster_timesheet_corrections
      SET status = ${input.decision}::staff_roster_correction_status,
          reviewed_by_membership_id = ${input.session.membershipId},
          reviewed_at = now(),
          updated_at = now()
      WHERE id = ${input.correctionId}
        AND calendar_id = ${input.session.calendarId}
        AND status = 'pending'
    `,
  ];

  if (input.decision === "approved") {
    statements.push(sql`
      UPDATE staff_roster_clock_sessions
      SET clock_in_at = ${effectiveIn},
          clock_out_at = ${effectiveOut},
          corrected_at = now(),
          corrected_by_membership_id = ${input.session.membershipId},
          updated_at = now()
      WHERE id = ${correction.clockSessionId}
        AND calendar_id = ${input.session.calendarId}
    `);
  }

  statements.push(sql`
    INSERT INTO audit_log (
      calendar_id, actor_participant_id, action,
      entity_type, entity_id, after_state
    )
    VALUES (
      ${input.session.calendarId}, NULL,
      'staff_roster.timesheet_correction.review',
      'staff_roster_timesheet_correction', ${input.correctionId},
      ${JSON.stringify({
        decision: input.decision,
        actorStaffMemberId: actor.id,
      })}::jsonb
    )
  `);

  await sql.transaction(statements);
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

  await getSql().transaction([
    getSql()`
      UPDATE staff_roster_leave_requests
      SET status = 'cancelled', updated_at = now()
      WHERE id = ${input.leaveRequestId}
        AND calendar_id = ${input.session.calendarId}
        AND member_id = ${current.id}
        AND status IN ('pending', 'approved')
    `,
    getSql()`
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
