import type {
  ApprovalActor,
  ProposalOperation,
  ProposalPolicyRecord,
  ProposalStatus,
} from "@/lib/approvals/types";

export function canCreateProposal(actor: ApprovalActor) {
  return actor.permission !== "viewer" && Boolean(actor.participantId);
}

export function canSubmitProposal(actor: ApprovalActor, proposal: ProposalPolicyRecord) {
  return (
    canCreateProposal(actor) &&
    proposal.status === "draft" &&
    proposal.proposedByMembershipId === actor.membershipId
  );
}

export function canRespondToProposal(actor: ApprovalActor, proposal: ProposalPolicyRecord) {
  return (
    canCreateProposal(actor) &&
    proposal.status === "waiting" &&
    proposal.approverMembershipId === actor.membershipId &&
    proposal.proposedByMembershipId !== actor.membershipId
  );
}

export function canWithdrawProposal(actor: ApprovalActor, proposal: ProposalPolicyRecord) {
  const ownsProposal =
    proposal.proposedByMembershipId === actor.membershipId ||
    Boolean(
      actor.participantId &&
        proposal.proposedByParticipantId &&
        proposal.proposedByParticipantId === actor.participantId,
    );

  return (
    (proposal.status === "draft" || proposal.status === "waiting") &&
    ownsProposal
  );
}

export function canUseApprover(
  proposer: ApprovalActor,
  approver: ApprovalActor,
) {
  return (
    canCreateProposal(proposer) &&
    canCreateProposal(approver) &&
    proposer.membershipId !== approver.membershipId &&
    proposer.participantId !== approver.participantId
  );
}

export function nextProposalStatus(
  current: ProposalStatus,
  operation: ProposalOperation,
): ProposalStatus | null {
  if (current === "draft" && operation === "submit") return "waiting";
  if (current === "draft" && operation === "withdraw") return "withdrawn";
  if (current === "waiting" && operation === "accept") return "approved";
  if (current === "waiting" && operation === "decline") return "declined";
  if (current === "waiting" && operation === "withdraw") return "withdrawn";
  return null;
}

export function blocksAnotherWaitingProposal(status: ProposalStatus) {
  return status === "waiting";
}

export function proposalStatusLabel(status: ProposalStatus) {
  switch (status) {
    case "approved":
      return "Agreed";
    case "waiting":
      return "Waiting";
    case "declined":
      return "Declined";
    case "withdrawn":
      return "Withdrawn";
    default:
      return "Draft";
  }
}
