import assert from "node:assert/strict";
import test from "node:test";
import {
  blocksAnotherWaitingProposal,
  canCreateProposal,
  canRespondToProposal,
  canSubmitProposal,
  canUseApprover,
  canWithdrawProposal,
  nextProposalStatus,
  proposalStatusLabel,
} from "../lib/approvals/rules";

const owner = {
  membershipId: "membership-owner",
  participantId: "participant-owner",
  permission: "owner" as const,
};
const editor = {
  membershipId: "membership-editor",
  participantId: "participant-editor",
  permission: "editor" as const,
};
const viewer = {
  membershipId: "membership-viewer",
  participantId: null,
  permission: "viewer" as const,
};

test("only linked owner/editor parents can create proposals", () => {
  assert.equal(canCreateProposal(owner), true);
  assert.equal(canCreateProposal(editor), true);
  assert.equal(canCreateProposal(viewer), false);
  assert.equal(
    canCreateProposal({ ...editor, participantId: null }),
    false,
  );
});

test("a proposal can only be answered by its designated other parent", () => {
  const proposal = {
    status: "waiting" as const,
    proposedByMembershipId: owner.membershipId,
    approverMembershipId: editor.membershipId,
  };

  assert.equal(canRespondToProposal(editor, proposal), true);
  assert.equal(canRespondToProposal(owner, proposal), false);
  assert.equal(canRespondToProposal(viewer, proposal), false);
  assert.equal(canUseApprover(owner, editor), true);
  assert.equal(canUseApprover(owner, owner), false);
});

test("only the proposer can send or withdraw their open proposal", () => {
  const draft = {
    status: "draft" as const,
    proposedByMembershipId: owner.membershipId,
    approverMembershipId: null,
  };
  const waiting = { ...draft, status: "waiting" as const, approverMembershipId: editor.membershipId };

  assert.equal(canSubmitProposal(owner, draft), true);
  assert.equal(canSubmitProposal(editor, draft), false);
  assert.equal(canWithdrawProposal(owner, waiting), true);
  assert.equal(canWithdrawProposal(editor, waiting), false);
  assert.equal(
    canWithdrawProposal(
      { membershipId: owner.membershipId, participantId: null, permission: "viewer" },
      waiting,
    ),
    true,
  );
  assert.equal(
    canWithdrawProposal(
      { membershipId: "replacement-membership", participantId: owner.participantId, permission: "viewer" },
      { ...waiting, proposedByParticipantId: owner.participantId },
    ),
    true,
  );
});

test("proposal lifecycle only allows the intended transitions", () => {
  assert.equal(nextProposalStatus("draft", "submit"), "waiting");
  assert.equal(nextProposalStatus("draft", "withdraw"), "withdrawn");
  assert.equal(nextProposalStatus("waiting", "accept"), "approved");
  assert.equal(nextProposalStatus("waiting", "decline"), "declined");
  assert.equal(nextProposalStatus("waiting", "withdraw"), "withdrawn");
  assert.equal(nextProposalStatus("approved", "withdraw"), null);
  assert.equal(nextProposalStatus("declined", "accept"), null);
});

test("only waiting proposals block another waiting proposal for the same item", () => {
  assert.equal(blocksAnotherWaitingProposal("waiting"), true);
  for (const status of ["draft", "approved", "declined", "withdrawn"] as const) {
    assert.equal(blocksAnotherWaitingProposal(status), false);
  }
});

test("friendly labels avoid legalistic status wording", () => {
  assert.equal(proposalStatusLabel("approved"), "Agreed");
  assert.equal(proposalStatusLabel("waiting"), "Waiting");
  assert.equal(proposalStatusLabel("declined"), "Declined");
  assert.equal(proposalStatusLabel("withdrawn"), "Withdrawn");
  assert.equal(proposalStatusLabel("draft"), "Draft");
});
