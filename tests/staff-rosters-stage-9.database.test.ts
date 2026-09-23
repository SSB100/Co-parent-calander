import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { neon } from "@neondatabase/serverless";
import {
  changeBreak,
  clockIn,
  clockOut,
  correctTimesheetSession,
  getClockState,
  getTimesheet,
  requestTimesheetCorrection,
  reviewTimesheetCorrection,
} from "../lib/staff-rosters/workforce-service";
import { attendanceDurations } from "../lib/staff-rosters/break-duration";

// Opt-in qualification on this known Stage 9 clone only. Never use DATABASE_URL.
const connection = process.env.STAGE9_TEST_DATABASE_URL;
const cloneHost = "ep-quiet-hill-a7fim9kp-pooler.ap-southeast-2.aws.neon.tech";

test("Stage 9 real database break authority, races, durations and correction bounds", { skip: !connection }, async (t) => {
  assert.equal(new URL(connection!).hostname, cloneHost);
  process.env.APP_DATABASE_URL = connection;
  const sql = neon(connection!);
  const calendarId = randomUUID();
  const foreignCalendar = randomUUID();
  const staffId = randomUUID();
  const otherId = randomUUID();
  const managerId = randomUUID();
  const foreignId = randomUUID();
  const staffMembership = randomUUID();
  const otherMembership = randomUUID();
  const managerMembership = randomUUID();
  const foreignMembership = randomUUID();
  const base = { calendarId, calendarType: "staff_rosters", calendarTimezone: "Pacific/Auckland", userName: "Stage 9 test", userEmail: "stage9@example.invalid" };
  const staff = { ...base, membershipId: staffMembership, permission: "viewer" as const };
  const other = { ...base, membershipId: otherMembership, permission: "viewer" as const };
  const manager = { ...base, membershipId: managerMembership, permission: "editor" as const };
  const foreign = { ...base, calendarId: foreignCalendar, membershipId: foreignMembership, permission: "viewer" as const };
  const coParent = { ...staff, calendarType: "coparenting" };
  const conflict = (error: unknown) => (error as { statusCode?: number }).statusCode === 409;
  const denied = (error: unknown) => [403, 404, 409].includes((error as { statusCode?: number }).statusCode ?? 0);
  const boundsError = (error: unknown) => (error as { constraint?: string }).constraint === "staff_roster_break_bounds";
  const winners = (results: PromiseSettledResult<unknown>[]) => results.filter((result) => result.status === "fulfilled").length;
  const started = () => changeBreak({ session: staff, action: "start_break" });
  const ended = async () => changeBreak({ session: staff, action: "end_break", breakId: (await getClockState(staff)).activeSession?.activeBreak?.id });
  const clockedIn = () => clockIn({ session: staff, confirmUnrostered: true });
  const auditCount = async (action: string, entityId?: string) => {
    const rows = entityId
      ? await sql`SELECT count(*)::int AS count FROM audit_log WHERE calendar_id=${calendarId} AND action=${action} AND entity_id=${entityId}`
      : await sql`SELECT count(*)::int AS count FROM audit_log WHERE calendar_id=${calendarId} AND action=${action}`;
    return rows[0].count as number;
  };

  try {
    await sql`INSERT INTO calendars (id, name, calendar_type) VALUES (${calendarId}, 'Stage 9 isolated qualification', 'staff_rosters'), (${foreignCalendar}, 'Stage 9 foreign qualification', 'staff_rosters')`;
    for (const [id, memberId, calendar, permission, access] of [
      [staffMembership, staffId, calendarId, "viewer", "staff"],
      [otherMembership, otherId, calendarId, "viewer", "staff"],
      [managerMembership, managerId, calendarId, "editor", "manager"],
      [foreignMembership, foreignId, foreignCalendar, "viewer", "staff"],
    ]) {
      await sql`INSERT INTO calendar_memberships (id, calendar_id, user_id, permission) VALUES (${id}, ${calendar}, ${randomUUID()}, ${permission}::calendar_permission)`;
      await sql`INSERT INTO staff_roster_members (id, calendar_id, membership_id, display_name, access_role) VALUES (${memberId}, ${calendar}, ${id}, ${access + " qualification"}, ${access}::staff_roster_access_role)`;
    }

    await t.test("no session and wrong identity cannot change a break", async () => {
      await assert.rejects(started(), conflict);
      await assert.rejects(ended(), conflict);
      await assert.rejects(changeBreak({ session: coParent, action: "start_break" }), denied);
      await assert.rejects(changeBreak({ session: coParent, action: "end_break" }), denied);
      await clockedIn();
      await assert.rejects(changeBreak({ session: other, action: "start_break" }), conflict);
      await assert.rejects(changeBreak({ session: foreign, action: "start_break" }), conflict);
      assert.equal(await auditCount("staff_roster.break.start"), 0);
    });

    await t.test("duplicate start/end has one winner, one audit and clock-out waits for break end", async () => {
      const activeId = (await getClockState(staff)).activeSession?.id;
      assert.ok(activeId);
      assert.equal(winners(await Promise.allSettled([started(), started()])), 1);
      const active = (await getClockState(staff)).activeSession;
      assert.equal(active?.id, activeId);
      assert.ok(active?.activeBreak?.id);
      assert.equal(await auditCount("staff_roster.break.start"), 1);
      await assert.rejects(changeBreak({ session: other, action: "end_break", breakId: active.activeBreak.id }), conflict);
      await assert.rejects(changeBreak({ session: foreign, action: "end_break", breakId: active.activeBreak.id }), conflict);
      await assert.rejects(clockOut(staff), conflict);
      assert.equal(await auditCount("staff_roster.clock.out"), 0);
      assert.equal(winners(await Promise.allSettled([ended(), ended()])), 1);
      assert.equal((await getClockState(staff)).activeSession?.activeBreak, null);
      assert.equal(await auditCount("staff_roster.break.end"), 1);
      await started();
      await assert.rejects(changeBreak({ session: staff, action: "end_break", breakId: active.activeBreak.id }), conflict);
      await ended();
      await clockOut(staff);
      const rows = await sql`SELECT count(*)::int AS count, count(*) FILTER (WHERE ended_at IS NULL)::int AS active FROM staff_roster_break_sessions WHERE clock_session_id=${activeId}`;
      assert.deepEqual([rows[0].count, rows[0].active], [2, 0]);
    });

    await t.test("start/clock-out and end/clock-out races preserve closed-session invariants", async () => {
      for (let index = 0; index < 4; index++) {
        const sessionId = (await clockedIn()).id;
        const pair = await Promise.allSettled([started(), clockOut(staff)]);
        assert.equal(winners(pair), 1);
        const clock = await getClockState(staff);
        if (clock.activeSession) {
          assert.equal(clock.activeSession.id, sessionId);
          assert.ok(clock.activeSession.activeBreak);
          await assert.rejects(clockOut(staff), conflict);
          const race = await Promise.allSettled([ended(), clockOut(staff)]);
          assert.equal(race[0].status, "fulfilled");
          assert.ok(winners(race) >= 1);
          if ((await getClockState(staff)).activeSession) await clockOut(staff);
        }
        const rows = await sql`SELECT c.clock_out_at, count(b.id)::int AS breaks, count(b.id) FILTER (WHERE b.ended_at IS NULL)::int AS active, bool_and(b.started_at >= c.clock_in_at AND b.ended_at <= c.clock_out_at) AS bounded FROM staff_roster_clock_sessions c LEFT JOIN staff_roster_break_sessions b ON b.clock_session_id=c.id WHERE c.id=${sessionId} GROUP BY c.id`;
        assert.ok(rows[0].clock_out_at);
        assert.equal(rows[0].active, 0);
        if (rows[0].breaks > 0) assert.equal(rows[0].bounded, true);
        const audit = await sql`SELECT action, count(*)::int AS count FROM audit_log WHERE calendar_id=${calendarId} AND entity_id=${sessionId} AND action='staff_roster.clock.out' GROUP BY action`;
        assert.equal(audit[0]?.count, 1);
      }
    });

    await t.test("timesheet is private to staff and manager sees exact break/worked durations", async () => {
      const sessionId = (await clockedIn()).id;
      const breakId = (await started()).id;
      await ended();
      await clockOut(staff);
      // Widen the parent, reposition the closed break, then narrow the parent.
      await sql`UPDATE staff_roster_clock_sessions SET clock_out_at='2030-01-07T11:00:00Z' WHERE id=${sessionId}`;
      await sql`UPDATE staff_roster_break_sessions SET started_at='2030-01-07T09:30:00Z', ended_at='2030-01-07T10:00:00Z' WHERE id=${breakId}`;
      await sql`UPDATE staff_roster_clock_sessions SET clock_in_at='2030-01-07T09:00:00Z' WHERE id=${sessionId}`;
      const staffView = await getTimesheet({ session: staff, weekStart: "2030-01-07" });
      const entry = staffView.sessions.find((session) => session.id === sessionId);
      assert.ok(entry);
      assert.equal(entry.breaks.length, 1);
      assert.equal(entry.breaks[0].id, breakId);
      assert.deepEqual(attendanceDurations(entry), { elapsedMinutes: 120, breakMinutes: 30, workedMinutes: 90 });
      assert.equal((await getTimesheet({ session: other, weekStart: "2030-01-07" })).sessions.length, 0);
      const managerView = await getTimesheet({ session: manager, weekStart: "2030-01-07" });
      assert.deepEqual(managerView.sessions.find((session) => session.id === sessionId)?.breaks, entry.breaks);
      assert.equal(managerView.canReview, true);
      await assert.rejects(getTimesheet({ session: coParent, weekStart: "2030-01-07" }), denied);

      const directAuditBefore = await auditCount("staff_roster.timesheet.manager_correct", sessionId);
      await assert.rejects(correctTimesheetSession({ session: manager, clockSessionId: sessionId, clockInAt: "2030-01-07T09:40:00Z", clockOutAt: "2030-01-07T11:00:00Z", reason: "Outside break" }), boundsError);
      assert.equal(await auditCount("staff_roster.timesheet.manager_correct", sessionId), directAuditBefore);
      const unchanged = await sql`SELECT clock_in_at, clock_out_at FROM staff_roster_clock_sessions WHERE id=${sessionId}`;
      assert.equal(new Date(unchanged[0].clock_in_at).toISOString(), "2030-01-07T09:00:00.000Z");
      assert.equal(new Date(unchanged[0].clock_out_at).toISOString(), "2030-01-07T11:00:00.000Z");

      await assert.rejects(requestTimesheetCorrection({ session: other, clockSessionId: sessionId, requestedClockInAt: null, requestedClockOutAt: "2030-01-07T11:15:00Z", reason: "Wrong member" }), denied);
      const correction = await requestTimesheetCorrection({ session: staff, clockSessionId: sessionId, requestedClockInAt: null, requestedClockOutAt: "2030-01-07T09:45:00Z", reason: "Boundary qualification" });
      await assert.rejects(reviewTimesheetCorrection({ session: other, correctionId: correction.id, decision: "approved" }), denied);
      await assert.rejects(reviewTimesheetCorrection({ session: foreign, correctionId: correction.id, decision: "approved" }), denied);
      const reviewAuditBefore = await auditCount("staff_roster.timesheet_correction.review", correction.id);
      await assert.rejects(reviewTimesheetCorrection({ session: manager, correctionId: correction.id, decision: "approved" }), boundsError);
      assert.equal(await auditCount("staff_roster.timesheet_correction.review", correction.id), reviewAuditBefore);
      const pending = await sql`SELECT status FROM staff_roster_timesheet_corrections WHERE id=${correction.id}`;
      assert.equal(pending[0].status, "pending");
      await correctTimesheetSession({ session: manager, clockSessionId: sessionId, clockInAt: "2030-01-07T08:45:00Z", clockOutAt: "2030-01-07T11:15:00Z", reason: "Valid bounds" });
      assert.equal(await auditCount("staff_roster.timesheet.manager_correct", sessionId), directAuditBefore + 1);
      const corrected = (await getTimesheet({ session: staff, weekStart: "2030-01-07" })).sessions.find((session) => session.id === sessionId);
      assert.ok(corrected);
      assert.deepEqual(attendanceDurations(corrected), { elapsedMinutes: 150, breakMinutes: 30, workedMinutes: 120 });
      const superseded = await sql`SELECT status FROM staff_roster_timesheet_corrections WHERE id=${correction.id}`;
      assert.equal(superseded[0].status, "cancelled");
      const valid = await requestTimesheetCorrection({ session: staff, clockSessionId: sessionId, requestedClockInAt: null, requestedClockOutAt: "2030-01-07T11:30:00Z", reason: "Valid request around break" });
      assert.equal(winners(await Promise.allSettled([
        reviewTimesheetCorrection({ session: manager, correctionId: valid.id, decision: "approved" }),
        reviewTimesheetCorrection({ session: manager, correctionId: valid.id, decision: "declined" }),
      ])), 1);
      assert.equal(await auditCount("staff_roster.timesheet_correction.review", valid.id), 1);
    });
  } finally {
    // Fixture calendars only; no broad cleanup and no Production connection.
    await sql`DELETE FROM calendars WHERE id IN (${calendarId}, ${foreignCalendar})`;
  }
});
