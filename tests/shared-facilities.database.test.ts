import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { neon } from "@neondatabase/serverless";
import { facilityDefaults } from "../lib/shared-facilities/contracts";
import { decideFacilityBooking, loadFacilities, saveFacilityBooking, saveFacilityResource, saveFacilityRules, type FacilitySession } from "../lib/shared-facilities/service";
import { createTemplateInvite, changeTemplateMember } from "../lib/calendar-sharing/service";
import { redeemMemberInvitation } from "../lib/calendar-sharing/invitations";
import { normalizeInviteCode } from "../lib/security/invites";
import { hashToken } from "../lib/security/tokens";
const connection=process.env.FACILITIES_TEST_DATABASE_URL;
const testHost="ep-weathered-sea-a763290t-pooler.ap-southeast-2.aws.neon.tech";
test("Facilities real database booking and invitation authority",{skip:!connection},async(t)=>{
 assert.equal(new URL(connection!).hostname,testHost,"Only the designated isolated qualification branch is allowed");
 process.env.APP_DATABASE_URL=connection;const sql=neon(connection!);
 const calendarId=randomUUID(), foreignCalendarId=randomUUID();
 const session=(permission:"owner"|"editor"|"viewer",calendar=calendarId):FacilitySession=>({calendarId:calendar,membershipId:randomUUID(),userId:randomUUID(),calendarName:"Qualification",calendarType:"shared_facilities",calendarTimezone:"Pacific/Auckland",permission,userName:"Qualification member",userEmail:"qualification@example.invalid",participantId:null,displayName:null,colorKey:null,profileSlot:null});
 const owner=session("owner"),member=session("editor"),other=session("editor"),viewer=session("viewer"),manager=session("editor"),foreign=session("owner",foreignCalendarId);
 await sql`INSERT INTO calendars(id,name,calendar_type,timezone) VALUES(${calendarId},'Facilities isolated qualification','shared_facilities','Pacific/Auckland'),(${foreignCalendarId},'Facilities foreign qualification','shared_facilities','Pacific/Auckland')`;
 for(const s of [owner,member,other,viewer,manager,foreign])await sql`INSERT INTO calendar_memberships(id,calendar_id,user_id,permission) VALUES(${s.membershipId},${s.calendarId},${s.userId},${s.permission}::calendar_permission)`;
 const resource=(await saveFacilityResource(owner,{name:"Court "+randomUUID(),description:"",location:"",capacity:4,active:true})).id as string;
 const resource2=(await saveFacilityResource(owner,{name:"Room "+randomUUID(),description:"",location:"",capacity:null,active:true})).id as string;
 const foreignResource=(await saveFacilityResource(foreign,{name:"Foreign room",description:"",location:"",capacity:null,active:true})).id as string;
 await sql`INSERT INTO template_member_roles(calendar_id,user_id,role,resource_ids) VALUES(${calendarId},${manager.userId},'manager',${[resource]}::uuid[])`;
 const date=new Date(Date.now()+7*86400000).toISOString().slice(0,10);
 const booking=(hour:number,resourceId=resource)=>({requestId:randomUUID(),resourceId,start:`${date}T${String(hour).padStart(2,"0")}:00`,end:`${date}T${String(hour+1).padStart(2,"0")}:00`,title:"Private title",notes:"Private note"});
 const winners=(results:PromiseSettledResult<unknown>[])=>results.filter(r=>r.status==="fulfilled").length;
 await t.test("concurrent conflicting bookings have exactly one winner, adjacent booking succeeds",async()=>{
   const results=await Promise.allSettled([saveFacilityBooking(member,booking(9)),saveFacilityBooking(other,booking(9))]);
   assert.equal(winners(results),1);
   await saveFacilityBooking(member,booking(10));
 });
 await t.test("tenant and viewer writes cannot book or administer resources",async()=>{
   await assert.rejects(saveFacilityBooking(viewer,booking(11)));
   await assert.rejects(saveFacilityBooking(member,booking(11,foreignResource)));
   await assert.rejects(saveFacilityRules(member,facilityDefaults));
   await assert.rejects(saveFacilityResource(manager,{id:resource2,name:"Not mine",description:"",location:"",capacity:null,active:true}));
   await assert.rejects(loadFacilities({...member,calendarType:"co_parenting"}));
 });
 await t.test("availability hides other members titles and notes; scoped managers see only their resources' private details",async()=>{
   await saveFacilityBooking(member,booking(11,resource2));
   const publicView=await loadFacilities(viewer,date);
   assert.ok(publicView.bookings.length>=3);assert.ok(publicView.bookings.every(b=>b.title===""&&b.notes===""&&!b.canManage));
   const managed=await loadFacilities(manager,date);
   assert.ok(managed.bookings.filter(b=>b.resourceId===resource).every(b=>b.notes==="Private note"&&b.canManage));
   assert.ok(managed.bookings.filter(b=>b.resourceId===resource2).every(b=>b.notes===""&&!b.canManage));
   await saveFacilityRules(owner,{...facilityDefaults,shareTitles:true});
   const shared=await loadFacilities(viewer,date);assert.ok(shared.bookings.every(b=>b.title==="Private title"&&b.notes===""));
 });
 await t.test("stale edits, cancellation and own-only access are enforced",async()=>{
   const created=await saveFacilityBooking(member,booking(12));const id=created.id as string;
   await assert.rejects(decideFacilityBooking(other,{id,version:1,action:"cancel"}));
   const result=await Promise.allSettled([decideFacilityBooking(member,{id,version:1,action:"cancel"}),decideFacilityBooking(member,{id,version:1,action:"cancel"})]);assert.equal(winners(result),1);
   await assert.rejects(saveFacilityBooking(member,{...booking(13),id,version:1}));
 });
 await t.test("approval respects manager scope, live conflicts and duplicate requests",async()=>{
   await saveFacilityRules(owner,{...facilityDefaults,requireApproval:true});
   const payload=booking(14);assert.equal(winners(await Promise.allSettled([saveFacilityBooking(member,payload),saveFacilityBooking(member,payload)])),1);
   const pending=(await loadFacilities(member,date)).bookings.find(b=>b.status==="pending")!;
   await assert.rejects(decideFacilityBooking(member,{id:pending.id,version:1,action:"confirm"}));
   await saveFacilityBooking(owner,booking(14));
   await assert.rejects(decideFacilityBooking(manager,{id:pending.id,version:1,action:"confirm"}));
   await decideFacilityBooking(manager,{id:pending.id,version:1,action:"decline"});
   const outside=await saveFacilityBooking(member,booking(15,resource2));
   await assert.rejects(decideFacilityBooking(manager,{id:outside.id as string,version:1,action:"confirm"}));
   await decideFacilityBooking(owner,{id:outside.id as string,version:1,action:"confirm"});
 });
 await t.test("operating rules and archived resource history are enforced",async()=>{
   await saveFacilityRules(owner,{...facilityDefaults,minDuration:120,maxDuration:180});
   await assert.rejects(saveFacilityBooking(member,booking(16)));
   await saveFacilityRules(owner,{...facilityDefaults,advanceDays:1});await assert.rejects(saveFacilityBooking(member,booking(16)));
   await saveFacilityRules(owner,{...facilityDefaults,maxActiveBookings:1});await assert.rejects(saveFacilityBooking(member,booking(16)));
   await saveFacilityRules(owner,facilityDefaults);await assert.rejects(saveFacilityBooking(member,booking(6)));
   await saveFacilityResource(manager,{id:resource,name:"Court archived",description:"",location:"",capacity:4,active:false});
   const archived=await loadFacilities(manager,date);assert.ok(archived.resources.some(r=>r.id===resource&&!r.active));assert.ok(archived.bookings.length>0);
   await assert.rejects(saveFacilityBooking(member,booking(16)));
   await saveFacilityResource(manager,{id:resource,name:"Court restored",description:"",location:"",capacity:4,active:true});
 });
 await t.test("custom manager invite preserves resource scope; one-use redemption and downgrade are atomic",async()=>{
   await assert.rejects(createTemplateInvite(manager,"manager",[resource]));await assert.rejects(createTemplateInvite(owner,"manager",[foreignResource]));
   const invite=await createTemplateInvite(owner,"manager",[resource2]);const userId=randomUUID();const codeHash=hashToken(normalizeInviteCode(invite.code));
   const outcomes=await Promise.allSettled([redeemMemberInvitation(codeHash,userId),redeemMemberInvitation(codeHash,randomUUID())]);
   assert.equal(outcomes.filter(r=>r.status==="fulfilled"&&r.value===calendarId).length,1);
   const joined=await sql`SELECT m.id,m.user_id,m.participant_id,r.role,r.resource_ids FROM calendar_memberships m JOIN template_member_roles r ON r.calendar_id=m.calendar_id AND r.user_id=m.user_id WHERE m.calendar_id=${calendarId} AND r.role='manager' AND r.resource_ids=${[resource2]}::uuid[]`;
   assert.equal(joined.length,1);assert.equal(joined[0].participant_id,null);assert.deepEqual(joined[0].resource_ids,[resource2]);
   await changeTemplateMember(owner,joined[0].id,"member");
   const downgraded=await sql`SELECT role,resource_ids FROM template_member_roles WHERE calendar_id=${calendarId} AND user_id=${joined[0].user_id}`;assert.equal(downgraded[0].role,"member");assert.deepEqual(downgraded[0].resource_ids,[]);
   const parents=await sql`SELECT count(*)::int AS total FROM participants WHERE calendar_id=${calendarId}`;assert.equal(parents[0].total,0);
 });
 // Retain synthetic fixtures on this disposable branch; never delete cloned records.
});
