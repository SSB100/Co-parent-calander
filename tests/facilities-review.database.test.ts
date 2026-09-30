import assert from "node:assert/strict";import {randomUUID} from "node:crypto";import test from "node:test";import {neon} from "@neondatabase/serverless";
import {loadFacilities,saveFacilityRules,saveFacilityBooking,decideFacilityBooking,type FacilitySession} from "../lib/shared-facilities/service";
import {facilityDefaults} from "../lib/shared-facilities/contracts";import {loadTemplateMembers,createTemplateInvite} from "../lib/calendar-sharing/service";
const connection=process.env.FACILITIES_TEST_DATABASE_URL;
test("Facilities independent-review regressions",{skip:!connection},async(t)=>{
 assert.equal(new URL(connection!).hostname,"ep-weathered-sea-a763290t-pooler.ap-southeast-2.aws.neon.tech");process.env.APP_DATABASE_URL=connection;const sql=neon(connection!);const calendarId=randomUUID(),ownerId=randomUUID(),managerId=randomUUID(),resourceId=randomUUID();
 const make=(userId:string,permission:"owner"|"editor"):FacilitySession=>({calendarId,membershipId:randomUUID(),userId,permission,calendarName:"Review qualification",calendarType:"shared_facilities",calendarTimezone:"UTC",userName:"Qualification",userEmail:"qa@example.invalid",participantId:null,displayName:null,colorKey:null,profileSlot:null});const owner=make(ownerId,"owner"),manager=make(managerId,"editor");
 await sql`INSERT INTO calendars(id,name,calendar_type,timezone) VALUES(${calendarId},'Review synthetic fixture','shared_facilities','UTC')`;
 await sql`INSERT INTO calendar_memberships(id,calendar_id,user_id,permission) VALUES(${owner.membershipId},${calendarId},${ownerId},'owner'),(${manager.membershipId},${calendarId},${managerId},'editor')`;
 await sql`INSERT INTO calendar_memberships(calendar_id,user_id,permission) SELECT ${calendarId},gen_random_uuid(),'editor' FROM generate_series(1,7)`;
 await sql`INSERT INTO facility_resources(id,calendar_id,name) VALUES(${resourceId},${calendarId},'Review resource')`;
 await sql`INSERT INTO template_member_roles(calendar_id,user_id,role,resource_ids) VALUES(${calendarId},${managerId},'manager',${[resourceId]}::uuid[])`;
 await saveFacilityRules(owner,{...facilityDefaults,minDuration:15,maxDuration:60,advanceDays:365});
 const day=new Date(Date.now()+2*86400000).toISOString().slice(0,10),far=new Date(Date.now()+25*86400000).toISOString().slice(0,10);
 await t.test("selected-day occupancy remains complete after more than501 earlier upcoming bookings",async()=>{
  await sql`WITH users AS(SELECT user_id,row_number() OVER(ORDER BY user_id)-1 AS position FROM calendar_memberships WHERE calendar_id=${calendarId} AND user_id NOT IN (${ownerId},${managerId})), slots AS(SELECT n,${day}::date+((n/48)::int)+interval '8 hours'+(n%48)*interval '15 minutes' AS start FROM generate_series(0,501)n)
  INSERT INTO facility_bookings(calendar_id,resource_id,user_id,updated_by_user_id,start_at,end_at)
  SELECT ${calendarId},${resourceId},u.user_id,u.user_id,s.start,s.start+interval '15 minutes' FROM slots s JOIN users u ON u.position=s.n%7`;
  const booked=await saveFacilityBooking(owner,{requestId:randomUUID(),resourceId,title:"Far-day reserved",notes:"",start:`${far}T09:00`,end:`${far}T10:00`});
  const data=await loadFacilities(owner,far);assert.equal(data.bookingsTruncated,true);assert.ok(data.bookings.some(b=>b.id===booked.id));
 });
 await t.test("scoped managers have no calendar-wide member administration",async()=>{const data=await loadTemplateMembers(manager);assert.equal(data.canInvite,false);assert.deepEqual(data.members,[]);await assert.rejects(createTemplateInvite(manager,"member",[]));});
 await t.test("approval revalidates rules changed since the request",async()=>{
  await saveFacilityRules(owner,{...facilityDefaults,requireApproval:true});
  const memberRows=await sql`SELECT id,user_id FROM calendar_memberships WHERE calendar_id=${calendarId} AND user_id NOT IN(${ownerId},${managerId}) LIMIT 1`;
  const member={...make(memberRows[0].user_id,"editor"),membershipId:memberRows[0].id};
  // Existing synthetic member bookings exceed the default10 limit; this request is new under a100 limit.
  await saveFacilityRules(owner,{...facilityDefaults,requireApproval:true,maxActiveBookings:100});
  const booking=await saveFacilityBooking(member,{requestId:randomUUID(),resourceId,title:"Needs current rules",notes:"",start:`${far}T12:00`,end:`${far}T13:00`});
  await saveFacilityRules(owner,{...facilityDefaults,requireApproval:true,maxActiveBookings:100,minDuration:120,maxDuration:240});
  await assert.rejects(decideFacilityBooking(owner,{id:booking.id,version:1,action:"confirm"}));
 });
});
