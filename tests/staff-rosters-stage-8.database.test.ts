import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { neon } from "@neondatabase/serverless";
import { createAvailability, deleteAvailability, getAvailability, createShift, deleteShift } from "../lib/staff-rosters/service";
import { createLeaveRequest, cancelLeaveRequest, reviewLeaveRequest, getLeaveRequests } from "../lib/staff-rosters/workforce-service";

// Opt-in only: this known non-Production qualification endpoint has the same
// Availability/Leave schema as Production. Never fall back to DATABASE_URL.
const connection = process.env.STAGE8_TEST_DATABASE_URL;
test("Stage 8 real database authority, duplicate submission, concurrent review/cancel and roster integration", { skip: !connection }, async (t) => {
  assert.equal(new URL(connection!).hostname, "ep-lingering-lake-a7741eq5-pooler.ap-southeast-2.aws.neon.tech");
  process.env.APP_DATABASE_URL = connection;
  const sql = neon(connection!);
  const calendarId = randomUUID();
  const foreignCalendar = randomUUID();
  const managerId = randomUUID();
  const staffId = randomUUID();
  const otherId = randomUUID();
  const foreignId = randomUUID();
  const managerMembership = randomUUID();
  const staffMembership = randomUUID();
  const otherMembership = randomUUID();
  const foreignMembership = randomUUID();
  const base = { calendarId, calendarType: "staff_rosters", calendarTimezone: "Pacific/Auckland", userName: "Stage 8 test", userEmail: "stage8@example.invalid" };
  const manager = { ...base, membershipId: managerMembership, permission: "editor" as const };
  const staff = { ...base, membershipId: staffMembership, permission: "viewer" as const };
  const other = { ...base, membershipId: otherMembership, permission: "viewer" as const };
  const foreign = { ...base, calendarId: foreignCalendar, membershipId: foreignMembership, permission: "viewer" as const };
  const conflict = (error: unknown) => (error as { statusCode?: number }).statusCode === 409;
  const denied = (error: unknown) => [403,404,409].includes((error as { statusCode: number }).statusCode);
  const winners = (results: PromiseSettledResult<unknown>[]) => results.filter((r) => r.status === "fulfilled").length;
  const leave = (note: string) => ({ session: staff, startDate: "2030-01-07", endDate: "2030-01-07", allDay: true, startTime: null, endTime: null, note });
  const availability = { session: staff, memberId: staffId, date: "2030-01-07", status: "unavailable" as const, startTime: "09:00", endTime: "12:00", note: null };
  const range = { from: "2030-01-01", to: "2030-02-01" };
  const shift = { session: manager, memberId: staffId, date: "2030-01-07", startTime: "09:00", endTime: "10:00", roleId: null, locationId: null, note: null, overrideAvailabilityConflict: false };
  try {
    await sql`INSERT INTO calendars (id, name, calendar_type) VALUES (${calendarId}, 'Stage 8 isolated qualification', 'staff_rosters'), (${foreignCalendar}, 'Stage 8 foreign qualification', 'staff_rosters')`;
    for (const [id, memberId, calendar, permission, access] of [
      [managerMembership, managerId, calendarId, "editor", "manager"],
      [staffMembership, staffId, calendarId, "viewer", "staff"],
      [otherMembership, otherId, calendarId, "viewer", "staff"],
      [foreignMembership, foreignId, foreignCalendar, "viewer", "staff"],
    ]) {
      await sql`INSERT INTO calendar_memberships (id, calendar_id, user_id, permission) VALUES (${id}, ${calendar}, ${randomUUID()}, ${permission}::calendar_permission)`;
      await sql`INSERT INTO staff_roster_members (id, calendar_id, membership_id, display_name, access_role) VALUES (${memberId}, ${calendar}, ${id}, ${access + " qualification"}, ${access}::staff_roster_access_role)`;
    }
    await t.test("availability concurrent duplicates have one winner; own-only reads and deletion", async () => {
      assert.equal(winners(await Promise.allSettled([createAvailability(availability), createAvailability(availability)])), 1);
      const own = await getAvailability({session:staff,...range});
      assert.equal(own.availability.length,1);
      assert.equal((await getAvailability({session:other,...range})).availability.length,0);
      assert.equal((await getAvailability({session:manager,...range})).availability.length,1);
      assert.equal(own.members.length,1);
      await assert.rejects(createAvailability({...availability,memberId:otherId}),denied);
      await assert.rejects(createAvailability({...availability,session:manager,memberId:foreignId}),denied);
      await assert.rejects(deleteAvailability({session:other,availabilityId:own.availability[0].id}),denied);
      await assert.rejects(deleteAvailability({session:foreign,availabilityId:own.availability[0].id}),denied);
      await assert.rejects(createShift(shift), (e: unknown) => (e as {code:string}).code === "availability_conflict");
      const overridden = await createShift({...shift,overrideAvailabilityConflict:true});
      await deleteShift({session:manager,shiftId:overridden.id});
      assert.equal(winners(await Promise.allSettled([deleteAvailability({session:staff,availabilityId:own.availability[0].id}),deleteAvailability({session:staff,availabilityId:own.availability[0].id})])),1);
      const audits=await sql`SELECT action, count(*)::int AS count FROM audit_log WHERE calendar_id=${calendarId} AND action LIKE 'staff_roster.availability.%' GROUP BY action`;
      assert.deepEqual(audits.map(a=>a.count),[1,1]);
    });
    await t.test("availability whole-day overlaps reject, adjacent part-day entries remain valid",async()=>{
      const a=await createAvailability(availability);
      await assert.rejects(createAvailability({...availability,status:"available",startTime:null,endTime:null}),conflict);
      const b=await createAvailability({...availability,startTime:"12:00",endTime:"13:00"});
      await deleteAvailability({session:staff,availabilityId:a.id});
      await deleteAvailability({session:staff,availabilityId:b.id});
    });
    await t.test("leave duplicates have one winner, distinct overlapping requests are valid and private",async()=>{
      assert.equal(winners(await Promise.allSettled([createLeaveRequest(leave("duplicate")),createLeaveRequest(leave("duplicate"))])),1);
      const separate=await createLeaveRequest(leave("distinct"));
      const own=await getLeaveRequests({session:staff,...range});
      assert.equal(own.requests.length,2);
      assert.equal("reviewedAt" in own.requests[0],false);
      assert.equal("rosterConflicts" in own.requests[0],false);
      assert.equal((await getLeaveRequests({session:other,...range})).requests.length,0);
      await assert.rejects(cancelLeaveRequest({session:other,leaveRequestId:separate.id}),denied);
      await assert.rejects(cancelLeaveRequest({session:foreign,leaveRequestId:separate.id}),denied);
      await assert.rejects(reviewLeaveRequest({session:staff,leaveRequestId:separate.id,decision:"approved"}),denied);
      for(const request of own.requests)await cancelLeaveRequest({session:staff,leaveRequestId:request.id});
    });
    await t.test("competing and repeated Manager reviews have one transition and one audit",async()=>{
      for(const decisions of [["approved","approved"],["approved","declined"],["declined","approved"]] as const){
        const request=await createLeaveRequest(leave(decisions.join("-")));
        assert.equal(winners(await Promise.allSettled(decisions.map(decision=>reviewLeaveRequest({session:manager,leaveRequestId:request.id,decision})))),1);
        await assert.rejects(reviewLeaveRequest({session:manager,leaveRequestId:request.id,decision:"approved"}),conflict);
        const audit=await sql`SELECT count(*)::int AS count FROM audit_log WHERE entity_id=${request.id} AND action='staff_roster.leave.review'`;
        assert.equal(audit[0].count,1);
        const state=await sql`SELECT status FROM staff_roster_leave_requests WHERE id=${request.id}`;
        if(state[0].status==="approved")await cancelLeaveRequest({session:staff,leaveRequestId:request.id});
      }
    });
    await t.test("review/cancel races retain coherent lifecycle and actual before/after audit",async()=>{
      for(let n=0;n<4;n++){
        const request=await createLeaveRequest(leave("race-"+n));
        const decision=n%2?"declined":"approved";
        const results=await Promise.allSettled([reviewLeaveRequest({session:manager,leaveRequestId:request.id,decision}),cancelLeaveRequest({session:staff,leaveRequestId:request.id})]);
        assert.ok(winners(results)>=1);
        const audit=await sql`SELECT before_state->>'status' AS before, after_state->>'status' AS after FROM audit_log WHERE entity_id=${request.id} AND action IN ('staff_roster.leave.review','staff_roster.leave.cancel') ORDER BY occurred_at`;
        assert.equal(audit.length,winners(results));
        if(audit.length===2){assert.deepEqual(audit.map(a=>[a.before,a.after]),[["pending","approved"],["approved","cancelled"]]);}
        else assert.equal(audit[0].before,"pending");
        await assert.rejects(cancelLeaveRequest({session:staff,leaveRequestId:request.id}),conflict);
      }
    });
    await t.test("pending warns, approved blocks even override, cancelled/declined stop blocking; published history persists",async()=>{
      const request=await createLeaveRequest(leave("roster"));
      await assert.rejects(createShift(shift),(e:unknown)=>(e as {code:string}).code==="pending_leave_conflict");
      const live=await createShift({...shift,overrideAvailabilityConflict:true});
      const publication=randomUUID();
      await sql`INSERT INTO staff_roster_week_publications(id,calendar_id,week_start) VALUES(${publication},${calendarId},'2030-01-07')`;
      await sql`INSERT INTO staff_roster_published_shifts(publication_id,source_shift_id,member_id,shift_date,start_time,end_time) VALUES(${publication},${live.id},${staffId},'2030-01-07','09:00','10:00')`;
      const before=await sql`SELECT md5(to_jsonb(s)::text) AS hash FROM staff_roster_published_shifts s WHERE publication_id=${publication}`;
      await reviewLeaveRequest({session:manager,leaveRequestId:request.id,decision:"approved"});
      const managerView=await getLeaveRequests({session:manager,...range});
      assert.equal(managerView.requests.find(r=>r.id===request.id)?.rosterConflicts?.length,2);
      await deleteShift({session:manager,shiftId:live.id});
      await assert.rejects(createShift({...shift,overrideAvailabilityConflict:true}),(e:unknown)=>(e as {code:string}).code==="approved_leave_conflict");
      await cancelLeaveRequest({session:staff,leaveRequestId:request.id});
      const after=await sql`SELECT md5(to_jsonb(s)::text) AS hash FROM staff_roster_published_shifts s WHERE publication_id=${publication}`;
      assert.deepEqual(after,before);
      const next=await createShift(shift);await deleteShift({session:manager,shiftId:next.id});
      const declined=await createLeaveRequest(leave("declined"));
      await reviewLeaveRequest({session:manager,leaveRequestId:declined.id,decision:"declined"});
      const allowed=await createShift(shift);await deleteShift({session:manager,shiftId:allowed.id});
    });
  } finally {
    // Only fixture records created above; never clean up other calendars.
    await sql`DELETE FROM staff_roster_leave_requests WHERE calendar_id IN (${calendarId},${foreignCalendar})`;
    await sql`DELETE FROM staff_roster_availability WHERE calendar_id IN (${calendarId},${foreignCalendar})`;
    await sql`DELETE FROM staff_roster_week_publications WHERE calendar_id IN (${calendarId},${foreignCalendar})`;
    await sql`DELETE FROM staff_roster_shifts WHERE calendar_id IN (${calendarId},${foreignCalendar})`;
    await sql`DELETE FROM calendars WHERE id IN (${calendarId},${foreignCalendar})`;
  }
});
