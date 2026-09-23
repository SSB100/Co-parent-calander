import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  monthShiftVisibility,
  rosterDaySummary,
} from "../lib/staff-rosters/roster-intelligence";

const root = process.cwd();

async function source(file: string) {
  return readFile(path.join(root, file), "utf8");
}

test("Month coverage summary counts unique staff and rostered hours", () => {
  const summary = rosterDaySummary([
    { memberId: "a", startTime: "09:00", endTime: "17:00" },
    { memberId: "a", startTime: "18:00", endTime: "20:00" },
    { memberId: "b", startTime: "10:00", endTime: "16:00" },
  ]);

  assert.deepEqual(summary, {
    staffCount: 2,
    shiftCount: 3,
    rosterMinutes: 16 * 60,
  });
});

test("Month never silently hides shifts when leave or availability consumes summary rows", () => {
  assert.deepEqual(
    monthShiftVisibility({
      shiftCount: 3,
      hasLeave: true,
      hasUnavailable: false,
    }),
    {
      visibleShiftCount: 2,
      hiddenShiftCount: 1,
    },
  );

  assert.deepEqual(
    monthShiftVisibility({
      shiftCount: 3,
      hasLeave: true,
      hasUnavailable: true,
    }),
    {
      visibleShiftCount: 1,
      hiddenShiftCount: 2,
    },
  );
});

test("roster week payload exposes calendar-scoped unavailability without a second model", async () => {
  const service = await source("lib/staff-rosters/service.ts");

  assert.match(service, /staffRosterAvailability\.status, "unavailable"/);
  assert.match(
    service,
    /staffRosterAvailability\.availabilityDate\} >= \$\{input\.weekStart\}/,
  );
  assert.match(
    service,
    /staffRosterAvailability\.availabilityDate\} <= \$\{weekEnd\}/,
  );
  assert.match(
    service,
    /capabilities\.createShifts[\s\S]*staffRosterAvailability\.memberId, current\.id/,
  );
  assert.match(service, /availability: availabilityRows\.map/);
});

test("Manager calendar integrates availability into Week Month and mobile views", async () => {
  const roster = await source(
    "components/staff-rosters/roster-calendar-page.tsx",
  );

  assert.match(roster, /filteredAvailability/);
  assert.match(roster, /filteredMemberIds/);
  assert.match(roster, /dayAvailability/);
  assert.match(roster, /selectedMobileAvailability/);
  assert.match(roster, /unavailable\.memberName \+ " unavailable"/);
  assert.match(roster, /bg-\[#FFF8D8\]/);
  assert.match(roster, /monthShiftVisibility/);
  assert.match(roster, /rosterDaySummary/);
  assert.match(roster, /visibility\.hiddenShiftCount/);
});

test("copy previous week feedback names the source week and explains skips", async () => {
  const roster = await source(
    "components/staff-rosters/roster-calendar-page.tsx",
  );
  const service = await source("lib/staff-rosters/service.ts");

  assert.match(roster, /sourceWeekStart\?: string/);
  assert.match(roster, /const sourceLabel = body\?\.sourceWeekStart/);
  assert.match(roster, /availabilitySkipped/);
  assert.match(roster, /overlapSkipped/);
  assert.match(roster, /leaveSkipped/);
  assert.match(roster, /inactiveStaffSkipped/);
  assert.match(roster, /staleReferenceAdjusted/);

  assert.match(service, /sourceWeekStart/);
  assert.match(service, /targetWeekStart: input\.targetWeekStart/);
  assert.match(service, /availabilitySkipped/);
  assert.match(service, /overlapSkipped/);
  assert.match(service, /leaveSkipped/);
});
