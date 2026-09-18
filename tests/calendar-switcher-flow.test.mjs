import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

async function source(file) {
  return readFile(path.join(root, file), "utf8");
}

test("Calendar header owns switching, creating and joining calendars", async () => {
  const [page, shell, switcher, actions] = await Promise.all([
    source("app/calendar/page.tsx"),
    source("components/calendar/calendar-shell.tsx"),
    source("components/calendar/calendar-switcher.tsx"),
    source("app/calendar/actions.ts"),
  ]);

  assert.match(page, /FROM calendar_memberships membership/);
  assert.match(page, /calendarOptions/);
  assert.match(page, /currentCalendarId=\{session\.calendarId\}/);
  assert.match(shell, /CalendarSwitcher/);
  assert.match(switcher, /Your calendars/);
  assert.match(switcher, /Create another calendar/);
  assert.match(switcher, /Join another calendar/);
  assert.match(switcher, /action=\{openCalendar\}/);
  assert.match(switcher, /name="flow" value="calendar-management"/);
  assert.match(actions, /"calendar-management"/);
  assert.match(actions, /cookieStore\.set\(SELECTED_CALENDAR_COOKIE_NAME/);
});

test("legacy Dashboard is only a protected compatibility redirect", async () => {
  const [dashboard, navigation, proxy] = await Promise.all([
    source("app/dashboard/page.tsx"),
    source("components/workspace/workspace-nav.tsx"),
    source("proxy.ts"),
  ]);

  assert.match(dashboard, /redirect\("\/calendar"\)/);
  assert.doesNotMatch(dashboard, /Your calendars|CreateCalendarForm|JoinCalendarForm|openCalendar/);
  assert.doesNotMatch(navigation, /href="\/dashboard"/);
  assert.match(proxy, /\/dashboard\/\:path\*/);
});

test("obsolete Dashboard-only UI and action modules are removed", async () => {
  await assert.rejects(
    access(path.join(root, "components/dashboard/dashboard-forms.tsx")),
  );
  await assert.rejects(
    access(path.join(root, "app/dashboard/actions.ts")),
  );
});
