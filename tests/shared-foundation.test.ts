import assert from "node:assert/strict";
import test from "node:test";
import {
  approvalActorFromSession,
  proposalReasonSchema,
} from "@/lib/approvals/http";

test("proposal reason trims blank text to null and preserves useful text", () => {
  assert.equal(proposalReasonSchema.parse("   "), null);
  assert.equal(proposalReasonSchema.parse("  School camp changed  "), "School camp changed");
  assert.equal(proposalReasonSchema.parse(undefined), null);
});

test("approval actor preserves membership participant and permission", () => {
  assert.deepEqual(
    approvalActorFromSession({
      membershipId: "11111111-1111-4111-8111-111111111111",
      participantId: "22222222-2222-4222-8222-222222222222",
      permission: "editor",
    }),
    {
      membershipId: "11111111-1111-4111-8111-111111111111",
      participantId: "22222222-2222-4222-8222-222222222222",
      permission: "editor",
    },
  );
});
