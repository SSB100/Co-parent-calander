import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { staffRosterCapabilities, type CalendarPermission, type StaffRosterAccessRole } from "../lib/staff-rosters/capabilities";

test("final authority matrix requires both writable membership and Staff management role", () => {
  for (const accessRole of ["owner", "manager", "staff"] as StaffRosterAccessRole[]) {
    for (const permission of ["owner", "editor", "viewer"] as CalendarPermission[]) {
      const capabilities = staffRosterCapabilities({ accessRole, permission });
      const management = permission !== "viewer" && accessRole !== "staff";
      for (const key of ["manageAllAvailability", "manageTeam", "manageStructure", "createShifts", "publishRoster", "reviewTimesheets", "reviewLeave"] as const) {
        assert.equal(capabilities[key], management, `${accessRole}/${permission}/${key}`);
      }
      assert.equal(capabilities.manageManagers, permission !== "viewer" && accessRole === "owner");
      for (const key of ["viewRoster", "editOwnAvailability", "clockOwnTime", "requestOwnTimesheetCorrection", "requestOwnLeave"] as const) assert.equal(capabilities[key], true);
    }
  }
});

test("operational hours drafts initialize on opening without an effect overwriting edits", () => {
  const source = readFileSync("components/staff-rosters/roster-calendar-page.tsx", "utf8");
  assert.match(source, /onClick=\{\(\) => \{\s*setOperationalStartDraft\(data\.setup\.operationalStartMinute\);\s*setOperationalEndDraft\(data\.setup\.operationalEndMinute\);\s*setOperationalHoursOpen\(true\)/);
  assert.doesNotMatch(source, /useEffect\(\(\) => \{[^}]*setOperationalStartDraft/);
});

test("shared dialogs supply focus containment without duplicating custom focus owners", () => {
  const dialog = readFileSync("components/ui/covie.tsx", "utf8");
  const scope = readFileSync("components/ui/dialog-focus-scope.tsx", "utf8");
  assert.match(dialog, /DialogFocusScope enabled=\{!dialogRef\}/);
  assert.match(dialog, /aria-describedby=\{describedBy \?\? \(description \? `\$\{id\}-description`/);
  assert.match(dialog, /id=\{`\$\{id\}-description`\}/);
  assert.match(scope, /event\.key !== 'Tab' \|\| !topmost\(\)/);
  assert.match(scope, /event\.shiftKey/);
  assert.match(scope, /element\.getClientRects\(\)\.length > 0/);
  assert.match(scope, /document\.removeEventListener\('focusin', keepFocus\)/);
  assert.match(scope, /previous\?\.isConnected\) previous\.focus\(\)/);
});

test("default regression command includes the final UX and expense recurrence gates", () => {
  const scripts = JSON.parse(readFileSync("package.json", "utf8")).scripts;
  for (const file of ["final-ux-regressions.test.mjs", "expense-recurrence.test.ts", "staff-rosters-stage-10.test.ts"]) assert.ok(scripts.test.includes(file));
  for (let stage = 1; stage <= 9; stage++) assert.ok(scripts.test.includes(`staff-rosters-stage-${stage}.test.`));
});
