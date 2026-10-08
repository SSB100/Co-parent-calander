import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { staffRosterAccountState } from "../lib/staff-rosters/invitation-status";
import { staffSetupAccountState, staffSetupReadiness, type StaffSetupMember } from "../lib/staff-rosters/setup-readiness";

const nowMs = Date.parse("2026-10-08T12:00:00Z");
const future = "2026-10-09T12:00:00Z";
function member(overrides: Partial<StaffSetupMember> = {}): StaffSetupMember {
  return { active: true, accessRole: "staff", hasAccount: false, accountState: "not_invited", inviteExpiresAt: null, ...overrides };
}
const linked = () => member({ hasAccount: true, accountState: "connected" });

test("owner login alone is not evidence of a ready staff team", () => {
  assert.deepEqual(staffSetupReadiness([member({ ...linked(), accessRole: "owner" })], nowMs), {
    profileCount: 0, linkedAccountCount: 0, awaitingAcceptanceCount: 0, profileOnlyCount: 0, canPlanShifts: false, allAccountsLinked: false,
  });
});

test("roster profiles can be planned before accounts are linked or invitations created", () => {
  const result = staffSetupReadiness([member(), member({ accessRole: "manager" })], nowMs);
  assert.equal(result.profileCount, 2);
  assert.equal(result.profileOnlyCount, 2);
  assert.equal(result.linkedAccountCount, 0);
  assert.equal(result.canPlanShifts, true);
  assert.equal(result.allAccountsLinked, false);
});

test("an active invitation is pending acceptance and never counts as account access", () => {
  const result = staffSetupReadiness([linked(), member({ accountState: "invite_active", inviteExpiresAt: future }), member()], nowMs);
  assert.deepEqual(result, { profileCount: 3, linkedAccountCount: 1, awaitingAcceptanceCount: 1, profileOnlyCount: 1, canPlanShifts: true, allAccountsLinked: false });
});

test("expired and invalid invitations are not pending or access-ready", () => {
  for (const inviteExpiresAt of [null, "invalid", "2026-10-08T12:00:00Z", "2026-10-07T12:00:00Z"]) {
    const profile = member({ accountState: "invite_active", inviteExpiresAt });
    assert.equal(staffSetupAccountState(profile, nowMs), "not_invited");
    assert.equal(staffSetupReadiness([profile], nowMs).profileOnlyCount, 1);
  }
});

test("revoked or redeemed invites without a linked membership never imply access", () => {
  for (const invite of [
    { expiresAt: future, revokedAt: "2026-10-07", redeemedAt: null },
    { expiresAt: future, revokedAt: null, redeemedAt: "2026-10-07" },
  ]) {
    const accountState = staffRosterAccountState({ hasAccount: false, latestInvite: invite, nowMs });
    const result = staffSetupReadiness([member({ accountState, inviteExpiresAt: future })], nowMs);
    assert.equal(result.linkedAccountCount, 0);
    assert.equal(result.awaitingAcceptanceCount, 0);
  }
});

test("inactive profiles do not block or inflate current team readiness", () => {
  const result = staffSetupReadiness([linked(), member({ active: false }), member({ ...linked(), active: false })], nowMs);
  assert.equal(result.profileCount, 1);
  assert.equal(result.linkedAccountCount, 1);
  assert.equal(result.allAccountsLinked, true);
});

test("inconsistent account facts fail closed rather than claiming linked access", () => {
  for (const profile of [member({ accountState: "connected" }), member({ hasAccount: true }), member({ hasAccount: true, accountState: "invite_active", inviteExpiresAt: future })]) {
    assert.equal(staffSetupReadiness([profile], nowMs).allAccountsLinked, false);
  }
});

test("legacy setup names optional leave honestly and does not treat persisted completion as account readiness", async () => {
  const setup = await readFile(new URL("../components/staff-rosters/setup-page.tsx", import.meta.url), "utf8");
  const leave = setup.slice(setup.indexOf('title: "Leave"'), setup.indexOf("icon: CalendarCheck2"));
  assert.match(leave, /status: "Optional"/);
  assert.doesNotMatch(leave, /done: true|Ready/);
  assert.match(setup, /Account access is managed separately in Team/);
  assert.match(setup, /Locations and leave are optional/);
});
