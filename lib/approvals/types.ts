export type CalendarApprovalPermission = "owner" | "editor" | "viewer";
export type ProposalAction = "create" | "edit" | "delete";
export type ProposalStatus = "draft" | "waiting" | "approved" | "declined" | "withdrawn";
export type ProposalOperation = "submit" | "accept" | "decline" | "withdraw";

export type ApprovalActor = {
  membershipId: string;
  participantId: string | null;
  permission: CalendarApprovalPermission;
};

export type ProposalPolicyRecord = {
  status: ProposalStatus;
  proposedByMembershipId: string;
  proposedByParticipantId?: string | null;
  approverMembershipId: string | null;
};
