import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("member invitations are atomic, typed, bounded and create no parent profiles",async()=>{
 const source=await readFile("lib/calendar-sharing/invitations.ts","utf8");
 assert.match(source,/FOR UPDATE OF invite/);assert.match(source,/invite\.use_count < invite\.max_uses/);
 assert.match(source,/c\.archived_at IS NULL/);assert.match(source,/c\.calendar_type IN \('shared_facilities','social_groups'\)/);
 assert.match(source,/template_member_roles/);assert.doesNotMatch(source,/INSERT INTO participants|parent_profile_slot/);
});
test("invitations keep role promotion owner-only and resource managers scoped",async()=>{
 const source=await readFile("lib/calendar-sharing/service.ts","utf8");
 assert.match(source,/role === "manager" \|\| role === "admin"\) && access\.role !== "owner"/);
 assert.match(source,/calendar_id=\$\{session\.calendarId\} AND active AND id=ANY/);
 assert.match(source,/session\.calendarType !== "shared_facilities"/);assert.match(source,/session\.calendarType !== "social_groups"/);
 assert.match(source,/permission<>'owner'/);assert.match(source,/expiresAt=new Date\(Date\.now\(\)\+7\*86400000\)/);
});
test("all mutations require same-origin and authenticated selected calendar",async()=>{
 for(const file of ["app/api/shared-facilities/route.ts","app/api/template-members/route.ts"]){const source=await readFile(file,"utf8");assert.match(source,/isSameOriginMutation\(request\)/);assert.match(source,/getCalendarSession\(\)/);assert.doesNotMatch(source,/calendarId:z\.|calendarId: z\./);}
});

test("cross-tab selection changes cannot redirect new-template mutations",async()=>{
 const {matchesExpectedCalendar}=await import("../lib/calendar-sharing/policy");
 assert.equal(matchesExpectedCalendar("calendar-a","calendar-a"),true);
 assert.equal(matchesExpectedCalendar("calendar-a","calendar-b"),false);
 assert.equal(matchesExpectedCalendar(null,"calendar-a"),false);
 for(const file of ["app/api/shared-facilities/route.ts","app/api/template-members/route.ts"]){const source=await readFile(file,"utf8");assert.match(source,/matchesExpectedCalendar\(request\.headers\.get\("x-covie-calendar-id"\), session\.calendarId\)/);}
});
