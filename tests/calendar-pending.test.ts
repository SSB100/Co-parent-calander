import assert from "node:assert/strict";
import test from "node:test";
import { projectCalendarPendingProposals } from "../lib/approvals/calendar-pending";

const base = {
  status: "waiting" as const,
  proposedByMembershipId: "11111111-1111-4111-8111-111111111111",
  proposedByParticipantId: "22222222-2222-4222-8222-222222222222",
  proposedByName: "Steven",
  approverMembershipId: "33333333-3333-4333-8333-333333333333",
  approverParticipantId: "44444444-4444-4444-8444-444444444444",
  approverName: "Jess",
  reason: null,
  submittedAt: new Date("2026-09-18T00:00:00Z"),
};

test("parenting proposal projects only its affected dates", () => {
  const proposals = projectCalendarPendingProposals({
    from: "2026-09-18",
    to: "2026-09-25",
    proposals: [
      {
        ...base,
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        entityType: "parenting_schedule",
        entityId: "calendar",
        action: "edit" as const,
        previousState: null,
        proposedState: {
          kind: "parenting_assignments",
          dates: ["2026-09-20", "2026-09-22"],
          assignments: [
            {
              childId: "55555555-5555-4555-8555-555555555555",
              date: "2026-09-20",
              morningParentId: null,
              afternoonParentId: null,
              handoverTime: null,
              handoverLocation: null,
              note: null,
            },
          ],
        },
      },
    ],
  });

  assert.deepEqual(proposals[0]?.affectedDates, ["2026-09-20", "2026-09-22"]);
  assert.equal(proposals[0]?.kind, "parenting");
});

test("moved events mark both the agreed and proposed dates", () => {
  const proposals = projectCalendarPendingProposals({
    from: "2026-09-18",
    to: "2026-09-25",
    proposals: [
      {
        ...base,
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        entityType: "shared_event",
        entityId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        action: "edit" as const,
        previousState: {
          kind: "shared_event",
          event: {
            id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
            title: "School show",
            description: null,
            category: "school",
            startDate: "2026-09-20",
            endDate: null,
          },
        },
        proposedState: {
          kind: "shared_event",
          event: {
            id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
            title: "School show",
            description: null,
            category: "school",
            startDate: "2026-09-22",
            endDate: null,
          },
        },
      },
    ],
  });

  assert.deepEqual(proposals[0]?.affectedDates, ["2026-09-20", "2026-09-22"]);
  assert.equal(proposals[0]?.title, "School show");
});

test("recurring schedule proposals project fortnight occurrences in the visible range", () => {
  const pattern = Array.from({ length: 14 }, () => ({
    morningParentId: null as string | null,
    afternoonParentId: null as string | null,
  }));
  pattern[0] = {
    morningParentId: "22222222-2222-4222-8222-222222222222",
    afternoonParentId: "22222222-2222-4222-8222-222222222222",
  };

  const proposals = projectCalendarPendingProposals({
    from: "2026-09-14",
    to: "2026-09-28",
    proposals: [
      {
        ...base,
        id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        entityType: "parenting_schedule",
        entityId: "calendar",
        action: "create" as const,
        previousState: null,
        proposedState: {
          kind: "recurring_schedule",
          mode: "upsert",
          scheduleId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
          anchorDate: "2026-09-14",
          endDate: null,
          pattern,
        },
      },
    ],
  });

  assert.deepEqual(proposals[0]?.affectedDates, ["2026-09-14", "2026-09-28"]);
  assert.equal(proposals[0]?.kind, "recurring_schedule");
});


test("recurring event proposals mark each visible occurrence as pending", () => {
  const proposals = projectCalendarPendingProposals({
    from: "2026-09-14",
    to: "2026-10-05",
    proposals: [
      {
        ...base,
        id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
        entityType: "shared_event",
        entityId: "abababab-abab-4bab-8bab-abababababab",
        action: "create" as const,
        previousState: null,
        proposedState: {
          kind: "shared_event",
          event: {
            id: "abababab-abab-4bab-8bab-abababababab",
            title: "Football training",
            description: null,
            category: "sport",
            startDate: "2026-09-14",
            endDate: null,
            recurrence: "weekly",
            recurrenceEndDate: "2026-10-05",
          },
        },
      },
    ],
  });

  assert.deepEqual(proposals[0]?.affectedDates, [
    "2026-09-14",
    "2026-09-21",
    "2026-09-28",
    "2026-10-05",
  ]);
});
