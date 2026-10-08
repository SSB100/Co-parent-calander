import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { createStaffMemberSchema } from "../lib/staff-rosters/contracts";
import { staffRosterCapabilities } from "../lib/staff-rosters/capabilities";
import { staffRosterAccountState } from "../lib/staff-rosters/invitation-status";

const root = process.cwd();

async function source(file: string) {
  return readFile(path.join(root, file), "utf8");
}

test("Stage 5 keeps Staff creation name-first with optional roster structure", () => {
  const parsed = createStaffMemberSchema.safeParse({
    displayName: "Jamie Smith",
  });

  assert.equal(parsed.success, true);
  if (!parsed.success) return;
  assert.equal(parsed.data.accessRole, "staff");
  assert.deepEqual(parsed.data.roleIds, []);
  assert.equal(parsed.data.defaultRoleId, null);
  assert.equal(parsed.data.defaultLocationId, null);
});

test("Stage 5 derives calm Staff account states without new schema", () => {
  const nowMs = Date.parse("2026-09-23T00:00:00Z");
  assert.equal(
    staffRosterAccountState({
      hasAccount: false,
      latestInvite: null,
      nowMs,
    }),
    "not_invited",
  );
  assert.equal(
    staffRosterAccountState({
      hasAccount: false,
      latestInvite: {
        expiresAt: "2026-09-30T00:00:00Z",
        revokedAt: null,
        redeemedAt: null,
      },
      nowMs,
    }),
    "invite_active",
  );
  assert.equal(
    staffRosterAccountState({
      hasAccount: false,
      latestInvite: {
        expiresAt: "2026-09-22T00:00:00Z",
        revokedAt: null,
        redeemedAt: null,
      },
      nowMs,
    }),
    "not_invited",
  );
  assert.equal(
    staffRosterAccountState({
      hasAccount: true,
      latestInvite: null,
      nowMs,
    }),
    "connected",
  );
});

test("Stage 5 preserves Owner Manager Staff authority boundaries", () => {
  const owner = staffRosterCapabilities({
    accessRole: "owner",
    permission: "owner",
  });
  const manager = staffRosterCapabilities({
    accessRole: "manager",
    permission: "editor",
  });
  const staff = staffRosterCapabilities({
    accessRole: "staff",
    permission: "viewer",
  });

  assert.equal(owner.manageTeam, true);
  assert.equal(owner.manageManagers, true);
  assert.equal(manager.manageTeam, true);
  assert.equal(manager.manageManagers, false);
  assert.equal(staff.manageTeam, false);
  assert.equal(staff.manageStructure, false);
  assert.equal(staff.clockOwnTime, true);
  assert.equal(staff.requestOwnLeave, true);
});

test("Stage 5 retires the setup wizard from first-run without deleting setup state", async () => {
  const [route, roster, service, schema] = await Promise.all([
    source("app/calendar-types/staff-rosters/setup/page.tsx"),
    source("components/staff-rosters/roster-calendar-page.tsx"),
    source("lib/staff-rosters/service.ts"),
    source("lib/db/schema/staff-rosters.ts"),
  ]);

  assert.match(
    route,
    /redirect\("\/calendar-types\/staff-rosters\/organiser\/team"\)/,
  );
  assert.match(roster, /Add your first staff member to start rostering/);
  assert.match(roster, /staff-rosters\/organiser\/team\?add=1/);
  assert.match(roster, /!hasRosterStaff/);
  assert.doesNotMatch(roster, /Finish setup/);
  assert.match(service, /setup_completed_at/);
  assert.match(schema, /setupCompletedAt/);
});

test("Stage 5 Team UI exposes account state, new invite and revoke actions", async () => {
  const [team, service, inviteRoute, inviteService] = await Promise.all([
    source("components/staff-rosters/team-page.tsx"),
    source("lib/staff-rosters/service.ts"),
    source("app/api/staff-roster/invitations/route.ts"),
    source("lib/staff-rosters/invitations-service.ts"),
  ]);

  assert.match(team, /Profile only/);
  assert.match(team, /Invite active/);
  assert.match(team, /Account linked/);
  assert.match(team, /New invite/);
  assert.match(team, /Revoke invite/);
  assert.match(team, /Optional roster details/);
  assert.match(team, /Only the calendar owner can grant Manager access/);
  assert.match(service, /staffRosterAccountState/);
  assert.match(service, /latestInviteByMember/);
  assert.match(inviteRoute, /export async function DELETE/);
  assert.match(inviteRoute, /isSameOriginMutation/);
  assert.match(inviteService, /revokeStaffRosterInvitation/);
  assert.match(inviteService, /staff_roster\.invite\.revoke/);
});

test("Stage 5 invitation acceptance links exactly the existing Staff profile", async () => {
  const inviteService = await source(
    "lib/staff-rosters/invitations-service.ts",
  );

  assert.match(inviteService, /UPDATE staff_roster_members member/);
  assert.match(inviteService, /membership_id = membership\.id/);
  assert.match(
    inviteService,
    /access_role === "manager" \? "editor" : "viewer"/,
  );
  assert.match(
    inviteService,
    /participant_id, permission[\s\S]*NULL,[\s\S]*calendar_permission/,
  );
  assert.match(inviteService, /already linked to another team member/);
  assert.doesNotMatch(inviteService, /INSERT INTO participants/);
});

test("Stage 5 keeps manager structure routes server-guarded from Staff", async () => {
  const route = await source("components/templates/template-route.tsx");

  assert.match(route, /staffAccessRole === "staff"/);
  assert.match(route, /activeToolKey !== "availability"/);
  assert.match(route, /activeToolKey !== "timesheets"/);
  assert.match(route, /redirect\("\/calendar-types\/staff-rosters"\)/);
});

test("Stage 5 preserves archive safety and historical attendance", async () => {
  const service = await source("lib/staff-rosters/service.ts");

  assert.match(service, /upcoming_shifts/);
  assert.match(service, /Remove or reassign this person’s upcoming shifts/);
  assert.match(service, /UPDATE staff_roster_invites/);
  assert.match(service, /DELETE FROM calendar_memberships/);
  assert.doesNotMatch(
    service,
    /DELETE FROM staff_roster_clock_sessions[\s\S]*accountAccessRevoked/,
  );
});

test("Stage 5 Organiser stays small and production UI contains no mock Staff", async () => {
  const [manifest, team, shell] = await Promise.all([
    source("lib/templates/calendar-templates.ts"),
    source("components/staff-rosters/team-page.tsx"),
    source("components/templates/template-shell.tsx"),
  ]);

  const staffSection = manifest.slice(
    manifest.indexOf("staff_rosters:"),
    manifest.indexOf("shared_facilities:"),
  );
  for (const label of [
    "Team",
    "Leave",
    "Locations",
    "Time & attendance",
  ]) {
    assert.match(staffSection, new RegExp(label));
  }
  assert.doesNotMatch(team, /Alex|Jordan|Sam|Main site|Second site/);
  assert.doesNotMatch(shell, /showStaffRosterGuide/);
});
