import assert from "node:assert/strict";
import test from "node:test";
import {
  aggregateParentingLabel,
  attentionCutoff,
  expenseReimbursementContext,
  proposalChangeDetails,
  proposalDisplay,
  urgencyForDate,
} from "@/lib/home/summary";

const me = "11111111-1111-4111-8111-111111111111";
const them = "22222222-2222-4222-8222-222222222222";

test("Home urgency separates overdue today due soon and upcoming", () => {
  const today = "2026-09-18";
  assert.equal(urgencyForDate("2026-09-17", today), "overdue");
  assert.equal(urgencyForDate(today, today), "due_today");
  assert.equal(urgencyForDate("2026-09-21", today), "due_soon");
  assert.equal(urgencyForDate("2026-09-22", today), "upcoming");
  assert.equal(attentionCutoff(today), "2026-09-21");
});

test("expense context says whether money is owed to or by the current parent", () => {
  const shares = [
    { participantId: me, shareCents: 3000 },
    { participantId: them, shareCents: 3000 },
  ];

  assert.deepEqual(
    expenseReimbursementContext({
      amountCents: 6000,
      paidByParticipantId: me,
      shares,
      currentParticipantId: me,
    }),
    { direction: "owed_to_you", amountCents: 3000 },
  );

  assert.deepEqual(
    expenseReimbursementContext({
      amountCents: 6000,
      paidByParticipantId: me,
      shares,
      currentParticipantId: them,
    }),
    { direction: "you_owe", amountCents: 3000 },
  );
});

test("partial shared-cost payments reduce only that parent's remaining balance", () => {
  const shares = [
    { participantId: me, shareCents: 10000, paidCents: 5000 },
    { participantId: them, shareCents: 10000, paidCents: 2500 },
  ];

  assert.deepEqual(
    expenseReimbursementContext({
      amountCents: 20000,
      paidByParticipantId: me,
      shares,
      currentParticipantId: them,
    }),
    { direction: "you_owe", amountCents: 7500 },
  );

  assert.deepEqual(
    expenseReimbursementContext({
      amountCents: 20000,
      paidByParticipantId: them,
      shares,
      currentParticipantId: me,
    }),
    { direction: "you_owe", amountCents: 5000 },
  );
});


test("proposal display provides calm Home summaries across shared features", () => {
  assert.deepEqual(
    proposalDisplay({
      entityType: "expense",
      action: "create",
      previousState: null,
      proposedState: {
        kind: "expense",
        expense: { title: "School shoes" },
      },
    }),
    { title: "New shared cost", summary: "School shoes" },
  );

  assert.deepEqual(
    proposalDisplay({
      entityType: "responsibility",
      action: "edit",
      previousState: null,
      proposedState: {
        kind: "responsibility",
        responsibility: {
          title: "Return school form",
          dueDate: "2026-09-21",
        },
      },
    }),
    {
      title: "Change task",
      summary: "Return school form · due 2026-09-21",
    },
  );
});


test("proposal change details explain specific Shared Costs edits", () => {
  const details = proposalChangeDetails({
    entityType: "expense",
    action: "edit",
    previousState: {
      kind: "expense",
      expense: {
        title: "School shoes",
        amountCents: 8000,
        paidByParticipantId: me,
        expenseDate: "2026-09-18",
        dueDate: "2026-09-25",
        category: "clothing",
        childId: null,
        note: null,
        shares: [
          { participantId: me, shareCents: 4000 },
          { participantId: them, shareCents: 4000 },
        ],
      },
    },
    proposedState: {
      kind: "expense",
      expense: {
        title: "School shoes",
        amountCents: 10000,
        paidByParticipantId: me,
        expenseDate: "2026-09-18",
        dueDate: "2026-09-25",
        category: "clothing",
        childId: null,
        note: null,
        shares: [
          { participantId: me, shareCents: 0 },
          { participantId: them, shareCents: 10000 },
        ],
      },
    },
    participants: [
      { id: me, displayName: "Steven" },
      { id: them, displayName: "Jess" },
    ],
    children: [],
  });

  assert.deepEqual(details, [
    { label: "Amount", before: "$80.00", after: "$100.00" },
    { label: "Steven's share", before: "$40.00", after: "$0.00" },
    { label: "Jess's share", before: "$40.00", after: "$100.00" },
  ]);
});

test("proposal change details resolve task and event fields into readable values", () => {
  const childId = "33333333-3333-4333-8333-333333333333";
  const taskDetails = proposalChangeDetails({
    entityType: "responsibility",
    action: "edit",
    previousState: {
      kind: "responsibility",
      responsibility: {
        title: "Return school form",
        responsibleParticipantId: me,
        dueDate: "2026-09-21",
        dueTime: "15:00",
        category: "school",
        childIds: [childId],
        recurrence: "none",
        recurrenceEndDate: null,
        note: null,
      },
    },
    proposedState: {
      kind: "responsibility",
      responsibility: {
        title: "Return school form",
        responsibleParticipantId: them,
        dueDate: "2026-09-22",
        dueTime: "16:30",
        category: "school",
        childIds: [childId],
        recurrence: "none",
        recurrenceEndDate: null,
        note: null,
      },
    },
    participants: [
      { id: me, displayName: "Steven" },
      { id: them, displayName: "Jess" },
    ],
    children: [{ id: childId, displayName: "Drake" }],
  });

  assert.deepEqual(taskDetails, [
    { label: "Assigned to", before: "Steven", after: "Jess" },
    { label: "Due date", before: "21 Sep 2026", after: "22 Sep 2026" },
    { label: "Due time", before: "15:00", after: "16:30" },
  ]);

  const eventDetails = proposalChangeDetails({
    entityType: "shared_event",
    action: "edit",
    previousState: {
      kind: "shared_event",
      event: {
        title: "School assembly",
        startDate: "2026-09-23",
        endDate: null,
        category: "school",
        recurrence: "none",
        recurrenceEndDate: null,
        description: null,
      },
    },
    proposedState: {
      kind: "shared_event",
      event: {
        title: "School assembly",
        startDate: "2026-09-24",
        endDate: null,
        category: "school",
        recurrence: "none",
        recurrenceEndDate: null,
        description: "Main hall",
      },
    },
    participants: [],
    children: [],
  });

  assert.deepEqual(eventDetails, [
    { label: "Start date", before: "23 Sep 2026", after: "24 Sep 2026" },
    { label: "Description", before: "None", after: "Main hall" },
  ]);
});

test("proposal change details explain parenting assignment changes by child and date", () => {
  const childId = "33333333-3333-4333-8333-333333333333";
  const details = proposalChangeDetails({
    entityType: "parenting_schedule",
    action: "edit",
    previousState: {
      kind: "parenting_assignments",
      dates: ["2026-09-22"],
      assignments: [
        {
          childId,
          date: "2026-09-22",
          morningParentId: me,
          afternoonParentId: me,
          handoverTime: null,
          handoverLocation: null,
          note: null,
        },
      ],
    },
    proposedState: {
      kind: "parenting_assignments",
      dates: ["2026-09-22"],
      assignments: [
        {
          childId,
          date: "2026-09-22",
          morningParentId: them,
          afternoonParentId: them,
          handoverTime: null,
          handoverLocation: null,
          note: null,
        },
      ],
    },
    participants: [
      { id: me, displayName: "Steven" },
      { id: them, displayName: "Jess" },
    ],
    children: [{ id: childId, displayName: "Drake" }],
  });

  assert.deepEqual(details, [
    {
      label: "Drake · 22 Sep 2026",
      before: "Steven all day",
      after: "Jess all day",
    },
  ]);
});

test("parenting label uses You and the other parent without exposing morning terminology", () => {
  const participants = [
    { id: me, displayName: "Steven" },
    { id: them, displayName: "Jess" },
  ];

  assert.equal(
    aggregateParentingLabel({
      rows: [
        { morningParentId: me, afternoonParentId: them },
        { morningParentId: me, afternoonParentId: them },
      ],
      childCount: 2,
      currentParticipantId: me,
      participants,
    }),
    "You → Jess",
  );

  assert.equal(
    aggregateParentingLabel({
      rows: [
        { morningParentId: them, afternoonParentId: them },
        { morningParentId: them, afternoonParentId: them },
      ],
      childCount: 2,
      currentParticipantId: me,
      participants,
    }),
    "Full day Jess",
  );
});

test("parenting label reports mixed state if child assignments differ", () => {
  assert.equal(
    aggregateParentingLabel({
      rows: [
        { morningParentId: me, afternoonParentId: me },
        { morningParentId: them, afternoonParentId: them },
      ],
      childCount: 2,
      currentParticipantId: me,
      participants: [
        { id: me, displayName: "Steven" },
        { id: them, displayName: "Jess" },
      ],
    }),
    "Mixed across children",
  );
});
