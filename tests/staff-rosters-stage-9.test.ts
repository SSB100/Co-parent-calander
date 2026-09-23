import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { attendanceDurations } from "../lib/staff-rosters/break-duration";
import { staffClockActionSchema } from "../lib/staff-rosters/workforce-contracts";

test("break actions strip browser identity and reject unsupported edits", () => {
  assert.deepEqual(staffClockActionSchema.parse({action:"start_break",memberId:"foreign",clockSessionId:"foreign"}), {action:"start_break",confirmUnrostered:false});
  assert.equal(staffClockActionSchema.safeParse({action:"edit_break"}).success,false);
  assert.equal(staffClockActionSchema.safeParse({action:"end_break"}).success,true);
});
test("attendance duration subtracts multiple completed breaks without payroll assumptions", () => {
  assert.deepEqual(attendanceDurations({clockInAt:"2026-09-23T00:00:00Z",clockOutAt:"2026-09-23T08:00:00Z",breaks:[
    {startedAt:"2026-09-23T02:00:00Z",endedAt:"2026-09-23T02:15:00Z"},
    {startedAt:"2026-09-23T04:00:00Z",endedAt:"2026-09-23T04:30:00Z"},
  ]}),{elapsedMinutes:480,breakMinutes:45,workedMinutes:435});
});
test("active break uses one explicit now and handles zero-duration sessions", () => {
  assert.deepEqual(attendanceDurations({clockInAt:"2026-09-23T00:00:00Z",clockOutAt:null,now:new Date("2026-09-23T01:00:00Z"),breaks:[{startedAt:"2026-09-23T00:45:00Z",endedAt:null}]}),{elapsedMinutes:60,breakMinutes:15,workedMinutes:45});
  assert.deepEqual(attendanceDurations({clockInAt:"2026-09-23T00:00:00Z",clockOutAt:null,now:new Date("2026-09-23T00:00:00Z"),breaks:[]}),{elapsedMinutes:0,breakMinutes:0,workedMinutes:0});
});
test("DST and midnight durations use elapsed instants rather than wall-clock subtraction", () => {
  assert.deepEqual(attendanceDurations({clockInAt:"2026-09-27T01:00:00+12:00",clockOutAt:"2026-09-27T04:00:00+13:00",breaks:[{startedAt:"2026-09-27T01:45:00+12:00",endedAt:"2026-09-27T03:15:00+13:00"}]}),{elapsedMinutes:120,breakMinutes:30,workedMinutes:90});
});
test("subminute breaks aggregate before rounding and cannot yield negative worked time", () => {
  const result=attendanceDurations({clockInAt:"2026-09-23T00:00:00Z",clockOutAt:"2026-09-23T00:02:00Z",breaks:[{startedAt:"2026-09-23T00:00:00Z",endedAt:"2026-09-23T00:00:40Z"},{startedAt:"2026-09-23T00:01:00Z",endedAt:"2026-09-23T00:01:40Z"}]});
  assert.deepEqual(result,{elapsedMinutes:2,breakMinutes:1,workedMinutes:1});
});
test("database guards serialize breaks with clock changes and constrain active intervals", () => {
  const migration=readFileSync("drizzle/0031_staff_roster_simple_breaks.sql","utf8");
  assert.match(migration,/REFERENCES staff_roster_clock_sessions\(id\)/);
  assert.match(migration,/UNIQUE INDEX staff_roster_break_active_unique/);
  assert.match(migration,/FOR UPDATE/);
  assert.match(migration,/BEFORE UPDATE OF clock_in_at, clock_out_at/);
  assert.match(migration,/b\.ended_at IS NULL OR b\.ended_at > NEW\.clock_out_at/);
});
test("break transport retains same-origin and authenticated session authority", () => {
  const route=readFileSync("app/api/staff-roster/clock/route.ts","utf8");
  assert.match(route,/isSameOriginMutation\(request\)/);
  assert.match(route,/getCalendarSession\(\)/);
  assert.match(route,/changeBreak\(\{ session, action: parsed.data.action, breakId: parsed.data.breakId \}\)/);
});
