export type StaffRosterAccountState =
  | "not_invited"
  | "invite_active"
  | "connected";

export type StaffRosterInvitationSnapshot = {
  expiresAt: Date | string;
  revokedAt: Date | string | null;
  redeemedAt: Date | string | null;
};

export function staffRosterAccountState(input: {
  hasAccount: boolean;
  latestInvite: StaffRosterInvitationSnapshot | null;
  nowMs?: number;
}): StaffRosterAccountState {
  if (input.hasAccount) return "connected";

  const invite = input.latestInvite;
  if (!invite || invite.revokedAt || invite.redeemedAt) {
    return "not_invited";
  }

  const nowMs = input.nowMs ?? Date.now();
  return new Date(invite.expiresAt).getTime() > nowMs
    ? "invite_active"
    : "not_invited";
}
