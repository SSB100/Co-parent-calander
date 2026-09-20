import assert from "node:assert/strict";
import test from "node:test";
import {
  aggregateParentingLabel,
  attentionCutoff,
  expenseReimbursementContext,
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
