import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const source = (file) => readFile(path.join(process.cwd(), file), "utf8");

test("Staff Rosters has direct manager destinations and personal staff destinations", async () => {
  const nav = await source("components/templates/template-workspace-nav.tsx");

  for (const label of ["Team", "Leave", "Locations", "Time & attendance"]) {
    assert.match(nav, new RegExp(`label: "${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
  }
  assert.match(nav, /staffRosterMode && !staffMode/);
  assert.match(nav, /staffRosterMode && staffMode/);
  assert.match(nav, /Approvals" : "Updates"/);
  assert.match(nav, /!staffMode && organiserItems.length > 0/);
  assert.doesNotMatch(nav, /Start your roster|showStaffRosterGuide/);
});

test("Approvals points to review screens while preserving the updates feed", async () => {
  const updates = await source("components/staff-rosters/updates-page.tsx");
  assert.match(updates, /Review leave/);
  assert.match(updates, /Review time corrections/);
  assert.match(updates, /data\.updates\.map/);
  assert.match(updates, /\/api\/staff-roster\/updates/);
});

test("Leave and Locations screens retain existing endpoints without showing legacy controls", async () => {
  const [leave, locations, availabilityRoute, structureRoute] = await Promise.all([
    source("components/staff-rosters/availability-page.tsx"),
    source("components/staff-rosters/roles-locations-page.tsx"),
    source("app/api/staff-roster/availability/route.ts"),
    source("app/api/staff-roster/roles-locations/route.ts"),
  ]);
  assert.match(leave, /StaffRosterLeavePanel/);
  assert.doesNotMatch(leave, /Add availability/);
  assert.match(locations, /Add location/);
  assert.doesNotMatch(locations, /Add role/);
  assert.match(availabilityRoute, /getAvailability/);
  assert.match(structureRoute, /getRolesAndLocations/);
});

