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

test("calendar type shells reuse canonical Covie UI and navigation", async () => {
  const [shell, nav, indexPage, route] = await Promise.all([
    source("components/templates/template-shell.tsx"),
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

  assert.match(shell, /WorkspaceNav/);
  assert.match(shell, /primaryItemsOverride/);
  assert.match(shell, /organiserItemsOverride/);
  assert.match(shell, /contextEnabled=\{false\}/);
  assert.match(shell, /accountEnabled=\{false\}/);

  assert.match(nav, /primaryItemsOverride/);
  assert.match(nav, /organiserItemsOverride/);
  assert.match(nav, /contextEnabled = true/);
  assert.match(nav, /accountEnabled = true/);

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

test("shell stage is preview-only and does not introduce a database migration", async () => {
  const [docs, treeMarker] = await Promise.all([
    source("docs/CALENDAR_TEMPLATE_SHELLS.md"),
    source("lib/db/schema/core.ts"),
  ]);

  assert.match(docs, /does not add a database column, migrations or live domain records/);
  assert.doesNotMatch(treeMarker, /calendar_template|template_type|calendar_type/);
});
