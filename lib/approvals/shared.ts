import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { calendarMemberships, participants } from "@/lib/db/schema";

export type SharedApprovalTarget = {
  required: boolean;
  approverMembershipId: string | null;
  approverParticipantId: string | null;
  approverName: string | null;
};

export async function getSharedApprovalTarget(input: {
  calendarId: string;
  actorMembershipId: string;
  actorParticipantId: string;
}): Promise<SharedApprovalTarget> {
  const rows = await getDb()
    .select({
      membershipId: calendarMemberships.id,
      participantId: calendarMemberships.participantId,
      permission: calendarMemberships.permission,
      displayName: participants.displayName,
      participantActive: participants.active,
    })
    .from(calendarMemberships)
    .leftJoin(participants, eq(calendarMemberships.participantId, participants.id))
    .where(eq(calendarMemberships.calendarId, input.calendarId));

  const candidates = rows.filter(
    (row) =>
      row.membershipId !== input.actorMembershipId &&
      row.permission !== "viewer" &&
      row.participantId !== null &&
      row.participantId !== input.actorParticipantId &&
      row.participantActive === true,
  );

  if (candidates.length === 0) {
    return {
      required: false,
      approverMembershipId: null,
      approverParticipantId: null,
      approverName: null,
    };
  }

  if (candidates.length > 1) {
    throw new Error("This calendar has more than one eligible approval parent.");
  }

  const approver = candidates[0];
  return {
    required: true,
    approverMembershipId: approver.membershipId,
    approverParticipantId: approver.participantId,
    approverName: approver.displayName ?? "the other parent",
  };
}
