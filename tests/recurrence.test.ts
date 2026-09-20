import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  buildFortnightRuleText,
  normalizeAnchorDate,
  parseFortnightRuleText,
  resolveRecurringAssignments,
  scheduleRangesOverlap,
  type ManualAssignment,
  type RecurrenceRule,
  type RecurrenceRuleChild,
} from "../lib/recurrence/fortnight";
import { resolveParentingScheduleAssignments } from "../lib/parenting-schedules/resolver";

const root = process.cwd();
const childA = "11111111-1111-4111-8111-111111111111";
const childB = "22222222-2222-4222-8222-222222222222";
const parentA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const parentB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function rule(overrides: Partial<RecurrenceRule> = {}): RecurrenceRule {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    parentId: parentA,
    startDate: "2026-09-14",
    endDate: null,
    rrule: buildFortnightRuleText({
      scheduleId: "44444444-4444-4444-8444-444444444444",
      anchorDate: "2026-09-14",
      slot: 0,
    }),
    ...overrides,
  };
}

function links(ruleId: string, ...childIds: string[]): RecurrenceRuleChild[] {
  return childIds.map((childId) => ({ ruleId, childId }));
}

function manual(overrides: Partial<ManualAssignment> = {}): ManualAssignment {
  return {
    id: "55555555-5555-4555-8555-555555555555",
    childId: childA,
    date: "2026-09-28",
    morningParentId: parentB,
    afternoonParentId: parentB,
    handoverTime: null,
    handoverLocation: null,
    note: null,
    ...overrides,
  };
}

test("normalizes a schedule anchor to Monday without changing the calendar date semantics", () => {
  assert.equal(normalizeAnchorDate("2026-09-17"), "2026-09-14");
});

test("fortnight rule metadata survives a build and parse round trip", () => {
  const value = buildFortnightRuleText({
    scheduleId: "schedule-123",
    anchorDate: "2026-09-14",
    slot: 12,
  });

  assert.deepEqual(parseFortnightRuleText(value), {
    scheduleId: "schedule-123",
    anchorDate: "2026-09-14",
    slot: 12,
    period: "full_day",
  });
});

test("legacy fortnight rules without period metadata remain full-day rules", () => {
  const value = [
    "FREQ=WEEKLY",
    "INTERVAL=2",
    "BYDAY=MO",
    "X-COPARENT-SCHEDULE=schedule-legacy",
    "X-COPARENT-ANCHOR=2026-09-14",
    "X-COPARENT-SLOT=0",
  ].join(";");

  assert.equal(parseFortnightRuleText(value)?.period, "full_day");
});

test("schedule range overlap allows a future schedule after the current one ends", () => {
  assert.equal(scheduleRangesOverlap("2026-09-14", "2026-10-31", "2026-11-01", null), false);
  assert.equal(scheduleRangesOverlap("2026-09-14", "2026-10-31", "2026-10-31", "2026-12-31"), true);
  assert.equal(scheduleRangesOverlap("2026-09-14", null, "2026-11-01", "2026-12-31"), true);
});

test("recurring assignments fill both morning and afternoon every fourteen days", () => {
  const recurringRule = rule();
  const result = resolveRecurringAssignments({
    manualAssignments: [],
    rules: [recurringRule],
    ruleChildren: links(recurringRule.id, childA),
    from: "2026-09-14",
    to: "2026-10-12",
  });

  assert.deepEqual(
    result.map((assignment) => [assignment.date, assignment.morningParentId, assignment.afternoonParentId, assignment.source]),
    [
      ["2026-09-14", parentA, parentA, "recurring"],
      ["2026-09-28", parentA, parentA, "recurring"],
      ["2026-10-12", parentA, parentA, "recurring"],
    ],
  );
});

test("morning and afternoon recurring rules merge into a split handover day", () => {
  const morning = rule({
    id: "33333333-3333-4333-8333-333333333341",
    parentId: parentA,
    rrule: buildFortnightRuleText({
      scheduleId: "44444444-4444-4444-8444-444444444443",
      anchorDate: "2026-09-14",
      slot: 0,
      period: "morning",
    }),
  });
  const afternoon = rule({
    id: "33333333-3333-4333-8333-333333333342",
    parentId: parentB,
    rrule: buildFortnightRuleText({
      scheduleId: "44444444-4444-4444-8444-444444444443",
      anchorDate: "2026-09-14",
      slot: 0,
      period: "afternoon",
    }),
  });

  const result = resolveRecurringAssignments({
    manualAssignments: [],
    rules: [afternoon, morning],
    ruleChildren: [...links(morning.id, childA), ...links(afternoon.id, childA)],
    from: "2026-09-14",
    to: "2026-09-14",
  });

  assert.equal(result[0]?.morningParentId, parentA);
  assert.equal(result[0]?.afternoonParentId, parentB);
});

test("multiple non-overlapping recurring schedules resolve into one calendar range", () => {
  const first = rule({
    id: "33333333-3333-4333-8333-333333333331",
    startDate: "2026-09-14",
    endDate: "2026-09-27",
    rrule: buildFortnightRuleText({
      scheduleId: "44444444-4444-4444-8444-444444444441",
      anchorDate: "2026-09-14",
      slot: 0,
    }),
  });
  const second = rule({
    id: "33333333-3333-4333-8333-333333333332",
    parentId: parentB,
    startDate: "2026-09-28",
    endDate: null,
    rrule: buildFortnightRuleText({
      scheduleId: "44444444-4444-4444-8444-444444444442",
      anchorDate: "2026-09-28",
      slot: 0,
    }),
  });

  const result = resolveRecurringAssignments({
    manualAssignments: [],
    rules: [first, second],
    ruleChildren: [...links(first.id, childA), ...links(second.id, childA)],
    from: "2026-09-14",
    to: "2026-10-12",
  });

  assert.deepEqual(
    result.map((assignment) => [assignment.date, assignment.morningParentId]),
    [
      ["2026-09-14", parentA],
      ["2026-09-28", parentB],
      ["2026-10-12", parentB],
    ],
  );
});

test("manual split assignment replaces only the matching recurring occurrence", () => {
  const recurringRule = rule();
  const result = resolveRecurringAssignments({
    manualAssignments: [manual({ morningParentId: parentA, afternoonParentId: parentB })],
    rules: [recurringRule],
    ruleChildren: links(recurringRule.id, childA),
    from: "2026-09-14",
    to: "2026-10-12",
  });

  const overridden = result.find((assignment) => assignment.date === "2026-09-28");
  assert.equal(overridden?.morningParentId, parentA);
  assert.equal(overridden?.afternoonParentId, parentB);
  assert.equal(overridden?.source, "manual");
  assert.equal(overridden?.recurringRuleId, null);

  const later = result.find((assignment) => assignment.date === "2026-10-12");
  assert.equal(later?.morningParentId, parentA);
  assert.equal(later?.afternoonParentId, parentA);
});

test("manual half-day clear keeps the other half assigned", () => {
  const recurringRule = rule();
  const result = resolveRecurringAssignments({
    manualAssignments: [manual({ morningParentId: null, afternoonParentId: parentB })],
    rules: [recurringRule],
    ruleChildren: links(recurringRule.id, childA),
    from: "2026-09-28",
    to: "2026-09-28",
  });

  assert.equal(result[0]?.morningParentId, null);
  assert.equal(result[0]?.afternoonParentId, parentB);
  assert.equal(result[0]?.source, "manual");
});

test("manual fully unassigned override clears one occurrence but later recurrence remains", () => {
  const recurringRule = rule();
  const result = resolveRecurringAssignments({
    manualAssignments: [manual({ morningParentId: null, afternoonParentId: null })],
    rules: [recurringRule],
    ruleChildren: links(recurringRule.id, childA),
    from: "2026-09-14",
    to: "2026-10-12",
  });

  assert.equal(result.some((assignment) => assignment.date === "2026-09-28"), false);
  const later = result.find((assignment) => assignment.date === "2026-10-12");
  assert.equal(later?.morningParentId, parentA);
  assert.equal(later?.afternoonParentId, parentA);
});

test("recurrence end date prevents occurrences after the chosen day", () => {
  const recurringRule = rule({ endDate: "2026-09-20" });
  const result = resolveRecurringAssignments({
    manualAssignments: [],
    rules: [recurringRule],
    ruleChildren: links(recurringRule.id, childA),
    from: "2026-09-14",
    to: "2026-10-12",
  });

  assert.deepEqual(result.map((assignment) => assignment.date), ["2026-09-14"]);
});

test("one rule resolves independently for every linked child", () => {
  const recurringRule = rule();
  const result = resolveRecurringAssignments({
    manualAssignments: [],
    rules: [recurringRule],
    ruleChildren: links(recurringRule.id, childA, childB),
    from: "2026-09-14",
    to: "2026-09-14",
  });

  assert.deepEqual(result.map((assignment) => assignment.childId).sort(), [childA, childB].sort());
});

test("first-class parenting schedule service stores 14-day split ownership without RRULE metadata", async () => {
  const [route, service, migration] = await Promise.all([
    readFile(path.join(root, "app/api/recurring-schedule/route.ts"), "utf8"),
    readFile(path.join(root, "lib/parenting-schedules/service.ts"), "utf8"),
    readFile(path.join(root, "drizzle/0013_parenting_schedules.sql"), "utf8"),
  ]);

  assert.match(route, /upsertParentingSchedule/);
  assert.match(route, /deleteParentingSchedule/);
  assert.match(service, /parenting_schedule_slots/);
  assert.match(service, /morning_parent_id/);
  assert.match(service, /afternoon_parent_id/);
  assert.match(service, /scheduleRangesOverlap/);
  assert.match(service, /recurring_schedule\.create/);
  assert.match(service, /recurring_schedule\.update/);
  assert.match(service, /recurring_schedule\.delete/);
  assert.doesNotMatch(service, /X-COPARENT-|buildFortnightRuleText|parseFortnightRuleText/);
  assert.match(migration, /X-COPARENT-SCHEDULE/);
  assert.match(migration, /INSERT INTO "parenting_schedules"/);
  assert.match(migration, /INSERT INTO "parenting_schedule_slots"/);
  assert.match(migration, /INSERT INTO "parenting_schedule_children"/);
});

test("first-class schedule resolver applies split/full slots and manual overrides", () => {
  const scheduleId = "44444444-4444-4444-8444-444444444477";
  const result = resolveParentingScheduleAssignments({
    schedules: [{
      id: scheduleId,
      anchorDate: "2026-09-14",
      endDate: null,
    }],
    slots: [
      {
        scheduleId,
        slotIndex: 0,
        morningParentId: parentA,
        afternoonParentId: parentB,
      },
      {
        scheduleId,
        slotIndex: 1,
        morningParentId: parentA,
        afternoonParentId: parentA,
      },
    ],
    scheduleChildren: [
      { scheduleId, childId: childA },
      { scheduleId, childId: childB },
    ],
    manualAssignments: [
      manual({
        date: "2026-09-28",
        childId: childA,
        morningParentId: parentB,
        afternoonParentId: parentB,
      }),
    ],
    from: "2026-09-14",
    to: "2026-09-29",
  });

  const first = result.find(
    (assignment) =>
      assignment.childId === childA &&
      assignment.date === "2026-09-14",
  );
  assert.equal(first?.morningParentId, parentA);
  assert.equal(first?.afternoonParentId, parentB);
  assert.equal(first?.source, "recurring");

  const full = result.find(
    (assignment) =>
      assignment.childId === childB &&
      assignment.date === "2026-09-15",
  );
  assert.equal(full?.morningParentId, parentA);
  assert.equal(full?.afternoonParentId, parentA);

  const override = result.find(
    (assignment) =>
      assignment.childId === childA &&
      assignment.date === "2026-09-28",
  );
  assert.equal(override?.morningParentId, parentB);
  assert.equal(override?.afternoonParentId, parentB);
  assert.equal(override?.source, "manual");
});

test("schedule UI uses the five-state full and split day cycle without AM/PM controls", async () => {
  const text = await readFile(path.join(root, "components/calendar/recurring-schedule-panel.tsx"), "utf8");

  assert.match(text, /Saved schedules/);
  assert.match(text, /New schedule/);
  assert.match(text, /editSchedule\(schedule\)/);
  assert.match(text, /deleteSchedule\(schedule\)/);
  assert.match(text, /Full day You/);
  assert.match(text, /Full day Them/);
  assert.match(text, /You → Them/);
  assert.match(text, /Them → You/);
  assert.match(text, /Unassigned/);
  assert.doesNotMatch(text, /you AM \/ them PM/i);
  assert.match(text, /fullDaySlot\(me\.id\)/);
  assert.match(text, /morningParentId: me\.id, afternoonParentId: otherParent\.id/);
  assert.match(text, /morningParentId: otherParent\.id, afternoonParentId: me\.id/);
  assert.match(text, /slotColor\(participants, slot\.morningParentId\)/);
  assert.match(text, /slotColor\(participants, slot\.afternoonParentId\)/);
  assert.match(text, /It will take effect automatically on its start date/);
  assert.match(text, /Schedules cannot overlap/);
});
