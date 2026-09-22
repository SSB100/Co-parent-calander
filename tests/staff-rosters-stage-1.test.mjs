import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

async function source(file) {
  return readFile(path.join(root, file), "utf8");
}

test("Staff Rosters Stage 1 stays isolated from co-parenting domain tables", async () => {
  const [schema, migration, service] = await Promise.all([
    source("lib/db/schema/staff-rosters.ts"),
    source("drizzle/0023_staff_roster_foundation.sql"),
    source("lib/staff-rosters/service.ts"),
  ]);

  assert.match(schema, /staffRosterMembers/);
  assert.match(schema, /staffRosterRoles/);
  assert.match(schema, /staffRosterLocations/);
  assert.match(schema, /staffRosterAvailability/);

  assert.match(migration, /CREATE TABLE "staff_roster_members"/);
  assert.match(migration, /CREATE TABLE "staff_roster_roles"/);
  assert.match(migration, /CREATE TABLE "staff_roster_locations"/);
  assert.match(migration, /CREATE TABLE "staff_roster_availability"/);

  assert.doesNotMatch(migration, /ALTER TABLE "participants"/);
  assert.doesNotMatch(migration, /ALTER TABLE "parenting_/);
  assert.doesNotMatch(service, /participants|parentingAssignments|children/);
});

test("Staff Rosters access roles are separate from job roles", async () => {
  const [schema, teamPage, service] = await Promise.all([
    source("lib/db/schema/staff-rosters.ts"),
    source("components/staff-rosters/team-page.tsx"),
    source("lib/staff-rosters/service.ts"),
  ]);

  assert.match(schema, /staff_roster_access_role/);
  assert.match(schema, /"owner",[\s\S]*"manager",[\s\S]*"staff"/);
  assert.match(schema, /defaultRoleId/);
  assert.match(schema, /defaultLocationId/);

  assert.match(teamPage, /Roster access/);
  assert.match(teamPage, /Default role/);
  assert.match(teamPage, /Default location/);
  assert.match(service, /Only the calendar owner can add another manager/);
  assert.match(service, /Only the calendar owner can manage manager access/);
});

test("Staff Rosters managers can manage structure while staff availability is ownership bounded", async () => {
  const service = await source("lib/staff-rosters/service.ts");

  assert.match(service, /function canManageTeam/);
  assert.match(service, /role === "owner" || role === "manager"/);
  assert.match(service, /function canManageStructure/);
  assert.match(service, /function canManageAllAvailability/);
  assert.match(service, /You can only change your own availability/);
  assert.match(service, /session.calendarType !== "staff_rosters"/);
});

test("Staff Rosters APIs use current selected calendar session and same-origin mutation protection", async () => {
  const files = await Promise.all([
    source("app/api/staff-roster/team/route.ts"),
    source("app/api/staff-roster/roles-locations/route.ts"),
    source("app/api/staff-roster/availability/route.ts"),
  ]);

  for (const route of files) {
    assert.match(route, /getCalendarSession/);
    assert.match(route, /isSameOriginMutation/);
    assert.doesNotMatch(route, /getEditorSession/);
  }
});

test("Staff Rosters Stage 1 pages are real branded tools with no sample data", async () => {
  const [shell, team, availability, structure] = await Promise.all([
    source("components/templates/template-shell.tsx"),
    source("components/staff-rosters/team-page.tsx"),
    source("components/staff-rosters/availability-page.tsx"),
    source("components/staff-rosters/roles-locations-page.tsx"),
  ]);

  assert.match(shell, /StaffRosterTeamPage/);
  assert.match(shell, /StaffRosterAvailabilityPage/);
  assert.match(shell, /StaffRosterRolesLocationsPage/);

  for (const page of [team, availability, structure]) {
    assert.match(page, /Covie/);
    assert.doesNotMatch(page, /Alex|Jordan|Sam|Main site|Second site/);
    assert.doesNotMatch(page, /window.confirm/);
  }

  assert.match(team, /Add team member/);
  assert.match(availability, /Add availability/);
  assert.match(structure, /Add role/);
  assert.match(structure, /Add location/);
});

test("availability supports whole-day or bounded time records with server validation", async () => {
  const [contracts, schema] = await Promise.all([
    source("lib/staff-rosters/contracts.ts"),
    source("lib/db/schema/staff-rosters.ts"),
  ]);

  assert.match(contracts, /leave both blank for all day/i);
  assert.match(contracts, /End time must be after start time/);
  assert.match(schema, /staff_roster_availability_time_pair_valid/);
  assert.match(schema, /availabilityDate/);
  assert.match(schema, /startTime/);
  assert.match(schema, /endTime/);
});
