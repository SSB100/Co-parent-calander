import type { StaffRosterAccessRole } from "./capabilities";
import type { StaffRosterAccountState } from "./invitation-status";

export type StaffSetupMember = {
  active: boolean;
  accessRole: StaffRosterAccessRole;
  hasAccount: boolean;
  accountState: StaffRosterAccountState;
  inviteExpiresAt: string | null;
};

export function staffSetupAccountState(member: StaffSetupMember, nowMs = Date.now()): StaffRosterAccountState {
  if (member.hasAccount && member.accountState === "connected") return "connected";
  if (
    !member.hasAccount &&
    member.accountState === "invite_active" &&
    member.inviteExpiresAt &&
    new Date(member.inviteExpiresAt).getTime() > nowMs
  ) return "invite_active";
  return "not_invited";
}

// A roster profile is enough to plan a shift. A linked account is a separate
// requirement for opening that person's published roster in Covie.
export function staffSetupReadiness(
  members: readonly StaffSetupMember[],
  nowMs = Date.now(),
) {
  const team = members.filter(member => member.active && member.accessRole !== "owner");
  let linkedAccountCount = 0;
  let awaitingAcceptanceCount = 0;

  for (const member of team) {
    const accountState = staffSetupAccountState(member, nowMs);
    if (accountState === "connected") {
      linkedAccountCount++;
    } else if (accountState === "invite_active") {
      awaitingAcceptanceCount++;
    }
  }

  return {
    profileCount: team.length,
    linkedAccountCount,
    awaitingAcceptanceCount,
    profileOnlyCount: team.length - linkedAccountCount - awaitingAcceptanceCount,
    canPlanShifts: team.length > 0,
    allAccountsLinked: team.length > 0 && linkedAccountCount === team.length,
  };
}

export type StaffSetupReadiness = ReturnType<typeof staffSetupReadiness>;
