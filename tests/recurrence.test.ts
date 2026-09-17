import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFortnightRuleText,
  normalizeAnchorDate,
  parseFortnightRuleText,
  resolveRecurringAssignments,
  type ManualAssignment,
  type RecurrenceRule,
  type RecurrenceRuleChild,
} from "../lib/recurrence/fortnight";

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
  });
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
    result.map((assignment) => [
      assignment.date,
      assignment.morningParentId,
      assignment.afternoonParentId,
      assignment.source,
    ]),
    [
      ["2026-09-14", parentA, parentA, "recurring"],
      ["2026-09-28", parentA, parentA, "recurring"],
      ["2026-10-12", parentA, parentA, "recurring"],
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

  assert.deepEqual(
    result.map((assignment) => assignment.childId).sort(),
    [childA, childB].sort(),
  );
});
