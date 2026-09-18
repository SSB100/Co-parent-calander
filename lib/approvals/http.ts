import { z } from "zod";
import { getSharedApprovalTarget } from "@/lib/approvals/shared";
import type { ApprovalActor, CalendarApprovalPermission } from "@/lib/approvals/types";

export const proposalReasonSchema = z
  .string()
  .trim()
  .max(500, "Keep the reason under 500 characters.")
  .nullable()
  .optional()
  .transform((value) => (value ? value : null));

export function approvalActorFromSession(session: {
  membershipId: string;
  participantId: string | null;
  permission: CalendarApprovalPermission;
}): ApprovalActor {
  return {
    membershipId: session.membershipId,
    participantId: session.participantId,
    permission: session.permission,
  };
}

export function sharedApprovalTargetForSession(session: {
  calendarId: string;
  membershipId: string;
  participantId: string;
}) {
  return getSharedApprovalTarget({
    calendarId: session.calendarId,
    actorMembershipId: session.membershipId,
    actorParticipantId: session.participantId,
  });
}
