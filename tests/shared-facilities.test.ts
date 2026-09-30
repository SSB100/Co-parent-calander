import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { facilityDefaults, facilityRulesSchema, facilityBookingSchema, facilityResourceSchema } from "../lib/shared-facilities/contracts";
import { canManageResource } from "../lib/calendar-sharing/access";
import { usesMemberInvitations } from "../lib/calendar-sharing/policy";

test("facility rules validate real operating limits",()=>{
  assert.ok(facilityRulesSchema.safeParse(facilityDefaults).success);
  for(const change of [{closeMinute:100},{openDays:[]},{maxDuration:15},{advanceDays:0},{minNoticeHours:-1},{maxActiveBookings:0},{shareTitles:"yes"}]) assert.equal(facilityRulesSchema.safeParse({...facilityDefaults,...change}).success,false);
  assert.deepEqual(facilityRulesSchema.parse({...facilityDefaults,openDays:[1,1,2]}).openDays,[1,2]);
});
test("booking forms require versioned edits and a duplicate-submit key",()=>{
 const booking={resourceId:"5b671db1-ac4e-4cf6-ad69-6d7922a55722",start:"2026-10-01T09:00",end:"2026-10-01T10:00"};
 assert.equal(facilityBookingSchema.safeParse(booking).success,false);
 assert.ok(facilityBookingSchema.safeParse({...booking,requestId:booking.resourceId}).success);
 assert.equal(facilityBookingSchema.safeParse({...booking,id:booking.resourceId}).success,false);
 assert.ok(facilityBookingSchema.safeParse({...booking,id:booking.resourceId,version:1}).success);
 assert.equal(facilityResourceSchema.safeParse({name:"   "}).success,false);
});
test("purpose-specific roles never flatten all calendars or manager scope",()=>{
 assert.equal(usesMemberInvitations("co_parenting"),false);assert.equal(usesMemberInvitations("staff_rosters"),false);
 assert.equal(usesMemberInvitations("shared_facilities"),true);assert.equal(usesMemberInvitations("social_groups"),true);
 assert.ok(canManageResource({role:"owner",resourceIds:[]},"one"));
 assert.ok(canManageResource({role:"manager",resourceIds:["one"]},"one"));
 assert.equal(canManageResource({role:"manager",resourceIds:["one"]},"two"),false);
 for(const role of ["member","viewer","admin"] as const)assert.equal(canManageResource({role,resourceIds:["one"]},"one"),false);
});
test("facilities persistence serializes conflicts, scopes tenants and keeps private reads minimal",async()=>{
 const sql=await readFile("drizzle/0033_shared_facilities.sql","utf8");
 const service=await readFile("lib/shared-facilities/service.ts","utf8");
 assert.match(sql,/FOREIGN KEY \(resource_id, calendar_id\)/);
 assert.match(sql,/FOR UPDATE/);assert.match(sql,/facility_booking_overlap/);assert.match(sql,/NEW\.version := OLD\.version \+ 1/);
 assert.match(service,/b\.calendar_id = \$\{session\.calendarId\}/);assert.match(service,/ELSE '' END AS notes/);
 assert.match(service,/version=\$\{booking\.version!/);assert.doesNotMatch(service,/SELECT b\.\*/);
});
