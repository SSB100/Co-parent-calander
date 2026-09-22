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

test("new calendar pages use Covie Core but remain separate from co-parenting workspace code", async () => {
  const [
    shell,
    templateNav,
    coParentNav,
    indexPage,
    calendarRoute,
    updatesRoute,
    organiserRoute,
  ] = await Promise.all([
    source("components/templates/template-shell.tsx"),
    source("components/templates/template-workspace-nav.tsx"),
    source("components/workspace/workspace-nav.tsx"),
    source("app/calendar-types/page.tsx"),
    source("app/calendar-types/[template]/page.tsx"),
    source("app/calendar-types/[template]/updates/page.tsx"),
    source("app/calendar-types/[template]/organiser/[tool]/page.tsx"),
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
  assert.match(templateNav, />Calendar</);
  assert.match(templateNav, />Updates</);
  assert.match(templateNav, />Organiser</);
  assert.match(templateNav, /bottom-\[calc\(100%\+10px\)\]/);

  assert.match(coParentNav, /export function WorkspaceNav\(\{ active, actions \}/);
  assert.match(
    coParentNav,
    /active && \["responsibilities", "expenses", "kids", "organiser"\]\.includes\(active\)/,
  );

  assert.match(indexPage, /redirect\(calendarPathForType\(session\.calendarType\)\)/);
  assert.doesNotMatch(indexPage, /Calendar type shells|Open shell/);

  assert.match(calendarRoute, /loadTemplatePage\(template\)/);
  assert.match(calendarRoute, /activeSection="calendar"/);
  assert.match(updatesRoute, /loadTemplatePage\(template\)/);
  assert.match(updatesRoute, /activeSection="updates"/);
  assert.match(organiserRoute, /manifest\.organiserTools\.find/);
  assert.match(organiserRoute, /activeSection=\{item\.key\}/);
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

  assert.match(shell, /staff_rosters:[\s\S]*title: "Roster"/);
  assert.match(shell, /staff_rosters:[\s\S]*emptyTitle: "No shifts yet"/);

  assert.match(shell, /shared_facilities:[\s\S]*title: "Bookings"/);
  assert.match(shell, /shared_facilities:[\s\S]*emptyTitle: "No bookings yet"/);

  assert.match(shell, /social_groups:[\s\S]*title: "Events"/);
  assert.match(shell, /social_groups:[\s\S]*emptyTitle: "No events yet"/);

  assert.match(shell, /activeSection === "updates"/);
  assert.match(shell, /organiserEmptyCopy/);
  assert.match(shell, /CovieEmptyState/);
});

test("template shells remain bound to selected typed calendars", async () => {
  const [loader, shell, navigation, migration, core] = await Promise.all([
    source("lib/templates/load-template-page.ts"),
    source("components/templates/template-shell.tsx"),
    source("lib/calendars/navigation.ts"),
    source("drizzle/0022_calendar_template_types.sql"),
    source("lib/db/schema/core.ts"),
  ]);

  assert.match(loader, /getCalendarSession/);
  assert.match(loader, /session\.calendarType !== manifest\.id/);
  assert.match(loader, /listCalendarNavigationOptions/);
  assert.match(shell, /currentCalendarId/);
  assert.match(navigation, /calendarType: calendars\.type/);
  assert.match(migration, /CREATE TYPE "calendar_type"/);
  assert.match(migration, /DEFAULT 'co_parenting'/);
  assert.match(core, /export const calendarType = pgEnum/);
  assert.match(core, /type: calendarType\("calendar_type"\)/);
});


test("template navigation uses real routes instead of hash-only shell sections", async () => {
  const nav = await source("components/templates/template-workspace-nav.tsx");

  assert.match(nav, /\/updates/);
  assert.match(nav, /\/organiser\//);
  assert.doesNotMatch(nav, /#updates|hashchange|window\.location\.hash/);
  assert.match(nav, /activeSection === "calendar"/);
  assert.match(nav, /activeSection === "updates"/);
});
