import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

async function source(file) {
  return readFile(path.join(root, file), "utf8");
}

test("additional calendar templates have explicit Brand Bible manifests", async () => {
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

  assert.match(manifests, /label: "Shift",[\s\S]*colour: "teal"/);
  assert.match(manifests, /label: "Booking",[\s\S]*colour: "violet"/);
  assert.match(manifests, /label: "Activity",[\s\S]*colour: "coral"/);
});

test("calendar type shells reuse Covie Core without changing co-parenting navigation", async () => {
  const [shell, templateNav, coParentNav, indexPage, route] = await Promise.all([
    source("components/templates/template-shell.tsx"),
    source("components/templates/template-workspace-nav.tsx"),
    source("components/workspace/workspace-nav.tsx"),
    source("app/calendar-types/page.tsx"),
    source("app/calendar-types/[template]/page.tsx"),
  ]);

  for (const primitive of [
    "CoviePage",
    "CoviePageHeader",
    "CovieCard",
    "CovieDialog",
    "CovieInput",
    "CovieSelect",
    "CovieStatusBadge",
    "CovieNotice",
  ]) {
    assert.match(shell, new RegExp(primitive));
  }

  assert.match(shell, /TemplateWorkspaceNav/);
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
  assert.doesNotMatch(
    coParentNav,
    /primaryItemsOverride|organiserItemsOverride|contextEnabled|accountEnabled/,
  );

  assert.match(indexPage, /Calendar type shells/);
  assert.match(route, /isAdditionalCalendarTemplateSlug/);
  assert.doesNotMatch(shell, /window\.confirm/);
  assert.doesNotMatch(shell, /(?:bg|text|border)-blue-/);
});

test("shell schedules reflect each template's documented scheduling model", async () => {
  const shell = await source("components/templates/template-shell.tsx");

  assert.match(shell, /StaffRosterSchedule/);
  assert.match(shell, /sampleStaff/);
  assert.match(shell, /FacilitiesSchedule/);
  assert.match(shell, /resources = \["Court 1", "Court 2", "Meeting room"\]/);
  assert.match(shell, /SocialSchedule/);
  assert.match(shell, /Coffee catch-up/);
  assert.match(shell, /overflow-x-auto/);
  assert.match(shell, /Product boundary:/);
  assert.match(shell, /Saving is intentionally left for the detailed feature pass/);
});

test("template shells bind to selected typed calendars while keeping feature data isolated", async () => {
  const [route, shell, navigation, migration, core] = await Promise.all([
    source("app/calendar-types/[template]/page.tsx"),
    source("components/templates/template-shell.tsx"),
    source("lib/calendars/navigation.ts"),
    source("drizzle/0022_calendar_template_types.sql"),
    source("lib/db/schema/core.ts"),
  ]);

  assert.match(route, /getCalendarSession/);
  assert.match(route, /session\.calendarType !== manifest\.id/);
  assert.match(route, /listCalendarNavigationOptions/);
  assert.match(shell, /CalendarSwitcher/);
  assert.match(shell, /currentCalendarId/);
  assert.match(navigation, /calendarType: calendars\.type/);
  assert.match(migration, /CREATE TYPE "calendar_type"/);
  assert.match(migration, /DEFAULT 'co_parenting'/);
  assert.match(migration, /'0022', 'Calendar template types and navigation'/);
  assert.match(core, /export const calendarType = pgEnum/);
  assert.match(core, /type: calendarType\("calendar_type"\)/);
});
