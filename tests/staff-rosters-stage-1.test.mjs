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
  assert.match(teamPage, /Usual role/);
  assert.match(teamPage, /Usual location/);
  assert.match(service, /Only the calendar owner can add another manager/);
  assert.match(service, /Only the calendar owner can manage manager access/);
});

test("Staff Rosters managers can manage structure while staff availability is ownership bounded", async () => {
  const [service, capabilities] = await Promise.all([
    source("lib/staff-rosters/service.ts"),
    source("lib/staff-rosters/capabilities.ts"),
  ]);

  assert.match(capabilities, /accessRole === "owner" \|\| input\.accessRole === "manager"/);
  assert.match(capabilities, /manageTeam: canWrite && isManager/);
  assert.match(capabilities, /manageManagers: canWrite && input\.accessRole === "owner"/);
  assert.match(capabilities, /manageStructure: canWrite && isManager/);
  assert.match(capabilities, /manageAllAvailability: canWrite && isManager/);
  assert.match(capabilities, /editOwnAvailability: true/);

  assert.match(service, /staffRosterCapabilities/);
  assert.match(service, /You can only change your own availability/);
  assert.match(service, /session\.calendarType !== "staff_rosters"/);
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

  assert.match(team, /Add staff member/);
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


test("staff viewer self-service stays available without granting manager authority", async () => {
  const { staffRosterCapabilities } = await import(
    "../lib/staff-rosters/capabilities.ts"
  );

  const staffViewer = staffRosterCapabilities({
    accessRole: "staff",
    permission: "viewer",
  });
  assert.equal(staffViewer.viewRoster, true);
  assert.equal(staffViewer.editOwnAvailability, true);
  assert.equal(staffViewer.clockOwnTime, true);
  assert.equal(staffViewer.requestOwnTimesheetCorrection, true);
  assert.equal(staffViewer.requestOwnLeave, true);
  assert.equal(staffViewer.manageAllAvailability, false);
  assert.equal(staffViewer.manageTeam, false);
  assert.equal(staffViewer.manageManagers, false);
  assert.equal(staffViewer.manageStructure, false);
  assert.equal(staffViewer.createShifts, false);
  assert.equal(staffViewer.publishRoster, false);
  assert.equal(staffViewer.reviewTimesheets, false);
  assert.equal(staffViewer.reviewLeave, false);

  const managerViewer = staffRosterCapabilities({
    accessRole: "manager",
    permission: "viewer",
  });
  assert.equal(managerViewer.manageTeam, false);
  assert.equal(managerViewer.createShifts, false);
  assert.equal(managerViewer.publishRoster, false);
  assert.equal(managerViewer.reviewTimesheets, false);
  assert.equal(managerViewer.reviewLeave, false);

  const managerEditor = staffRosterCapabilities({
    accessRole: "manager",
    permission: "editor",
  });
  assert.equal(managerEditor.manageTeam, true);
  assert.equal(managerEditor.createShifts, true);
  assert.equal(managerEditor.publishRoster, true);
  assert.equal(managerEditor.reviewTimesheets, true);
  assert.equal(managerEditor.reviewLeave, true);
  assert.equal(managerEditor.manageManagers, false);

  const owner = staffRosterCapabilities({
    accessRole: "owner",
    permission: "owner",
  });
  assert.equal(owner.manageManagers, true);
});

test("staff invitation permission matches the bounded self-service capability model", async () => {
  const invitationService = await source(
    "lib/staff-rosters/invitations-service.ts",
  );

  assert.match(
    invitationService,
    /access_role === "manager" \? "editor" : "viewer"/,
  );
  assert.match(
    invitationService,
    /participant_id, permission[\s\S]*NULL,[\s\S]*calendar_permission/,
  );
});

test("Staff roster contracts enforce time ordering and operational-hour snapping", async () => {
  const {
    staffShiftSchema,
    staffAvailabilitySchema,
    staffRosterOperationalHoursSchema,
  } = await import("../lib/staff-rosters/contracts.ts");
  const { staffLeaveRequestSchema } = await import(
    "../lib/staff-rosters/workforce-contracts.ts"
  );

  const memberId = "00000000-0000-4000-8000-000000000001";

  assert.equal(
    staffShiftSchema.safeParse({
      memberId,
      date: "2026-09-23",
      startTime: "09:00",
      endTime: "17:00",
    }).success,
    true,
  );
  assert.equal(
    staffShiftSchema.safeParse({
      memberId,
      date: "2026-09-23",
      startTime: "17:00",
      endTime: "09:00",
    }).success,
    false,
  );

  assert.equal(
    staffAvailabilitySchema.safeParse({
      memberId,
      date: "2026-09-23",
      status: "unavailable",
      startTime: "12:00",
      endTime: "15:00",
      note: "",
    }).success,
    true,
  );
  assert.equal(
    staffAvailabilitySchema.safeParse({
      memberId,
      date: "2026-09-23",
      status: "unavailable",
      startTime: "15:00",
      endTime: "12:00",
      note: "",
    }).success,
    false,
  );

  assert.equal(
    staffRosterOperationalHoursSchema.safeParse({
      startMinute: 8 * 60,
      endMinute: 18 * 60,
    }).success,
    true,
  );
  assert.equal(
    staffRosterOperationalHoursSchema.safeParse({
      startMinute: 8 * 60 + 5,
      endMinute: 18 * 60,
    }).success,
    false,
  );
  assert.equal(
    staffRosterOperationalHoursSchema.safeParse({
      startMinute: 18 * 60,
      endMinute: 8 * 60,
    }).success,
    false,
  );

  assert.equal(
    staffLeaveRequestSchema.safeParse({
      startDate: "2026-09-23",
      endDate: "2026-09-23",
      allDay: false,
      startTime: "12:00",
      endTime: "15:00",
      note: "",
    }).success,
    true,
  );
  assert.equal(
    staffLeaveRequestSchema.safeParse({
      startDate: "2026-09-24",
      endDate: "2026-09-23",
      allDay: true,
      startTime: null,
      endTime: null,
      note: "",
    }).success,
    false,
  );
});
