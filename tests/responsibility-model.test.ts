import assert from "node:assert/strict";
import test from "node:test";
import {
  needsResponsibilityApproval,
  nextResponsibilityDueDate,
  responsibilityDetailsSchema,
  responsibilityStatus,
} from "@/lib/responsibilities/model";

const me = "11111111-1111-4111-8111-111111111111";
const them = "22222222-2222-4222-8222-222222222222";

test("responsibility status distinguishes upcoming due soon today overdue and completed", () => {
  const today = "2026-09-18";
  assert.equal(responsibilityStatus({ dueDate: "2026-09-30" }, today), "upcoming");
  assert.equal(responsibilityStatus({ dueDate: "2026-09-20" }, today), "due_soon");
  assert.equal(responsibilityStatus({ dueDate: today }, today), "due_today");
  assert.equal(responsibilityStatus({ dueDate: "2026-09-17" }, today), "overdue");
  assert.equal(
    responsibilityStatus({ dueDate: "2026-09-17", completedAt: "2026-09-17T10:00:00Z" }, today),
    "completed",
  );
});

test("recurrence advances one occurrence at a time", () => {
  assert.equal(nextResponsibilityDueDate("2026-09-18", "weekly"), "2026-09-25");
  assert.equal(nextResponsibilityDueDate("2026-09-18", "fortnightly"), "2026-10-02");
  assert.equal(nextResponsibilityDueDate("2026-09-18", "monthly"), "2026-10-18");
  assert.equal(nextResponsibilityDueDate("2026-09-18", "yearly"), "2027-09-18");
  assert.equal(nextResponsibilityDueDate("2026-09-18", "none"), null);
});

test("assigning work to the other linked parent requires approval", () => {
  assert.equal(
    needsResponsibilityApproval({
      sharedApprovalAvailable: true,
      actorParticipantId: me,
      proposedResponsibleParticipantId: them,
    }),
    true,
  );
  assert.equal(
    needsResponsibilityApproval({
      sharedApprovalAvailable: true,
      actorParticipantId: me,
      proposedResponsibleParticipantId: me,
    }),
    false,
  );
});

test("editing or deleting work already assigned to the other parent requires approval", () => {
  assert.equal(
    needsResponsibilityApproval({
      sharedApprovalAvailable: true,
      actorParticipantId: me,
      previousResponsibleParticipantId: them,
      proposedResponsibleParticipantId: me,
    }),
    true,
  );
  assert.equal(
    needsResponsibilityApproval({
      sharedApprovalAvailable: false,
      actorParticipantId: me,
      previousResponsibleParticipantId: them,
    }),
    false,
  );
});

test("responsibility validation rejects duplicate children and invalid recurrence end date", () => {
  const base = {
    title: "Return school form",
    childIds: [me, me],
    responsibleParticipantId: me,
    dueDate: "2026-09-20",
    dueTime: null,
    category: "forms_permissions" as const,
    note: null,
    recurrence: "weekly" as const,
    recurrenceEndDate: "2026-09-19",
    linkedEventId: null,
    linkedExpenseId: null,
  };

  const result = responsibilityDetailsSchema.safeParse(base);
  assert.equal(result.success, false);
});
