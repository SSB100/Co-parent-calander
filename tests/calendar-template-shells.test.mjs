import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

async function source(file) {
  return readFile(path.join(root, file), "utf8");
}

test("additional calendar templates keep explicit Brand Bible manifests", async () => {
  const manifests = await source("lib/templates/calendar-templates.ts");

  assert.match(manifests, /staff_rosters:[\s\S]*accentPair: \["teal", "sunshine"\]/);
  assert.match(manifests, /shared_facilities:[\s\S]*accentPair: \["violet", "teal"\]/);
  assert.match(manifests, /social_groups:[\s\S]*accentPair: \["coral", "violet"\]/);

  assert.match(manifests, /primaryScheduledEntity: "Shift"/);
  assert.match(manifests, /primaryScheduledEntity: "Booking"/);
  assert.match(manifests, /primaryScheduledEntity: "Event \/ activity"/);

  assert.match(manifests, /label: "Team"/);
  assert.match(manifests, /label: "Resources"/);
  assert.match(manifests, /label: "Group settings"/);
});

test("new calendar pages reuse Covie Core while remaining separate from co-parenting feature code", async () => {
  const [shell, templateNav, coParentNav, indexPage, routeLoader] = await Promise.all([
    source("components/templates/template-shell.tsx"),
    source("components/templates/template-workspace-nav.tsx"),
    source("components/workspace/workspace-nav.tsx"),
    source("app/calendar-types/page.tsx"),
    source("components/templates/template-route.tsx"),
  ]);

  for (const primitive of [
    "CoviePage",
    "CoviePageHeader",
    "CovieEmptyState",
  ]) {
    assert.match(shell, new RegExp(primitive));
  }

  assert.match(shell, /TemplateWorkspaceNav/);
  assert.match(shell, /CalendarSwitcher/);
  assert.doesNotMatch(shell, /@\/components\/workspace\/workspace-nav/);

  assert.match(templateNav, /CovieBrand/);
  assert.match(templateNav, /useDismissibleDetails/);
  assert.match(templateNav, /<span>\{staffMode \? "My roster" : "Calendar"\}<\/span>/);
  assert.match(templateNav, /staffRosterMode && !staffMode \? "Approvals" : "Updates"/);
  assert.match(templateNav, /!staffRosterMode && !staffMode && organiserItems.length > 0 \? \([\s\S]*<span>Organiser<\/span>/);
  assert.match(templateNav, /bottom-\[calc\(100%\+10px\)\]/);

  assert.match(coParentNav, /export function WorkspaceNav\(\{ active, actions \}/);
  assert.match(
    coParentNav,
    /active && \["responsibilities", "expenses", "kids", "organiser"\]\.includes\(active\)/,
  );

  assert.match(indexPage, /redirect\(calendarPathForType\(session\.calendarType\)\)/);
  assert.doesNotMatch(indexPage, /Calendar type shells|Open shell/);
  assert.match(routeLoader, /session\.calendarType !== manifest\.id/);
  assert.match(routeLoader, /listCalendarNavigationOptions/);
});

test("template navigation uses real pages instead of hash-only shell states", async () => {
  const [nav, calendarPage, updatesPage, organiserPage, organiserIndex] =
    await Promise.all([
      source("components/templates/template-workspace-nav.tsx"),
      source("app/calendar-types/[template]/page.tsx"),
      source("app/calendar-types/[template]/updates/page.tsx"),
      source("app/calendar-types/[template]/organiser/[tool]/page.tsx"),
      source("app/calendar-types/[template]/organiser/page.tsx"),
    ]);

  assert.match(nav, /href=\{basePath\}/);
  assert.match(nav, /\$\{basePath\}\/updates/);
  assert.match(nav, /\$\{basePath\}\/organiser\/\$\{key\}/);
  assert.doesNotMatch(nav, /#updates|#\$\{key\}|hashchange|window\.location\.hash/);

  assert.match(calendarPage, /section="calendar"/);
  assert.match(updatesPage, /section="updates"/);
  assert.match(organiserPage, /section="organiser"/);
  assert.match(organiserPage, /activeToolKey=\{tool\}/);
  assert.match(organiserIndex, /organiser\/\$\{firstTool\.key\}/);
});

test("new calendar pages contain no mock records, demo controls or preview copy", async () => {
  const shell = await source("components/templates/template-shell.tsx");

  for (const mockText of [
    "Alex",
    "Jordan",
    "Sam",
    "Coffee catch-up",
    "Club night",
    "Beach walk",
    "Tennis lesson",
    "Member booking",
    "Committee meeting",
    "Main site",
    "Shell preview",
    "Product boundary",
    "Schedule model",
    "Saving is intentionally left",
    "Preview the basic",
    "All calendar shells",
  ]) {
    assert.doesNotMatch(shell, new RegExp(mockText));
  }

  assert.doesNotMatch(shell, /sampleStaff|sampleShifts|facilityBookings|socialDays/);
  assert.doesNotMatch(shell, /CovieDialog|CovieInput|CovieSelect|submitPreview/);
  assert.doesNotMatch(shell, /window\.confirm/);
});

test("each calendar type has a simple unique production empty state", async () => {
  const shell = await source("components/templates/template-shell.tsx");

  assert.match(shell, /staff_rosters:[\s\S]*emptyTitle: "No shifts yet"/);
  assert.match(shell, /staff_rosters:[\s\S]*iconClassName: "text-\[#19A897\]"/);

  assert.match(shell, /shared_facilities:[\s\S]*emptyTitle: "No bookings yet"/);
  assert.match(shell, /shared_facilities:[\s\S]*iconClassName: "text-\[#765ED6\]"/);

  assert.match(shell, /social_groups:[\s\S]*emptyTitle: "No events yet"/);
  assert.match(shell, /social_groups:[\s\S]*iconClassName: "text-\[#FF6B5F\]"/);

  assert.match(shell, /section === "updates"/);
  assert.match(shell, /section === "organiser"/);
  assert.match(shell, /organiserEmptyCopy/);
  assert.match(shell, /CovieEmptyState/);
});

test("calendar view follows the co-parenting header pattern without a second page heading", async () => {
  const shell = await source("components/templates/template-shell.tsx");

  assert.match(shell, /section === "calendar" \? null : \(/);
  assert.match(shell, /<CalendarSwitcher/);
  assert.doesNotMatch(shell, /title: "Roster"|title: "Bookings"|title: "Events"/);
});

test("template shells remain bound to selected typed calendars", async () => {
  const [routeLoader, shell, navigation, migration, core] = await Promise.all([
    source("components/templates/template-route.tsx"),
    source("components/templates/template-shell.tsx"),
    source("lib/calendars/navigation.ts"),
    source("drizzle/0022_calendar_template_types.sql"),
    source("lib/db/schema/core.ts"),
  ]);

  assert.match(routeLoader, /getCalendarSession/);
  assert.match(routeLoader, /session\.calendarType !== manifest\.id/);
  assert.match(routeLoader, /listCalendarNavigationOptions/);
  assert.match(routeLoader, /manifest\.organiserTools\.some/);
  assert.match(shell, /currentCalendarId/);
  assert.match(navigation, /calendarType: calendars\.type/);
  assert.match(migration, /CREATE TYPE "calendar_type"/);
  assert.match(migration, /DEFAULT 'co_parenting'/);
  assert.match(core, /export const calendarType = pgEnum/);
  assert.match(core, /type: calendarType\("calendar_type"\)/);
});
