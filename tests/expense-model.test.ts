import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultSettlementStatus,
  equalShares,
  expenseDetailsSchema,
  financialSignature,
} from "@/lib/expenses/model";

const me = "11111111-1111-4111-8111-111111111111";
const them = "22222222-2222-4222-8222-222222222222";

test("equal shares keep every cent accounted for and give odd-cent remainder to payer", () => {
  assert.deepEqual(equalShares(1001, [me, them], me), [
    { participantId: me, shareCents: 501 },
    { participantId: them, shareCents: 500 },
  ]);
});

test("expense validation requires shares to equal the full amount", () => {
  const result = expenseDetailsSchema.safeParse({
    childId: null,
    expenseDate: "2026-09-18",
    title: "School shoes",
    category: "clothing",
    amountCents: 8000,
    paidByParticipantId: me,
    dueDate: null,
    note: null,
    shares: [
      { participantId: me, shareCents: 4000 },
      { participantId: them, shareCents: 3000 },
    ],
  });
  assert.equal(result.success, false);
});

test("expense validation requires the payer to be represented in the split", () => {
  const result = expenseDetailsSchema.safeParse({
    childId: null,
    expenseDate: "2026-09-18",
    title: "School shoes",
    category: "clothing",
    amountCents: 8000,
    paidByParticipantId: me,
    dueDate: null,
    note: null,
    shares: [{ participantId: them, shareCents: 8000 }],
  });
  assert.equal(result.success, false);
});

test("new shared costs stay outstanding until required shares are confirmed paid", () => {
  assert.equal(
    defaultSettlementStatus({
      amountCents: 5000,
      paidByParticipantId: me,
      shares: [
        { participantId: me, shareCents: 5000 },
        { participantId: them, shareCents: 0 },
      ],
    }),
    "outstanding",
  );
});

test("reimbursement can assign the full amount to the parent who did not pay", () => {
  const details = {
    childId: null,
    expenseDate: "2026-09-18",
    title: "School shoes reimbursement",
    category: "clothing" as const,
    amountCents: 5000,
    paidByParticipantId: me,
    dueDate: null,
    note: null,
    shares: [
      { participantId: me, shareCents: 0 },
      { participantId: them, shareCents: 5000 },
    ],
  };

  assert.equal(expenseDetailsSchema.safeParse(details).success, true);
  assert.equal(defaultSettlementStatus(details), "outstanding");
});

test("financial signature ignores share ordering", () => {
  const left = financialSignature({
    amountCents: 5000,
    paidByParticipantId: me,
    shares: [
      { participantId: me, shareCents: 2500 },
      { participantId: them, shareCents: 2500 },
    ],
  });
  const right = financialSignature({
    amountCents: 5000,
    paidByParticipantId: me,
    shares: [
      { participantId: them, shareCents: 2500 },
      { participantId: me, shareCents: 2500 },
    ],
  });
  assert.equal(left, right);
});
