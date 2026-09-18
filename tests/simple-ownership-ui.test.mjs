import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

test("assignment APIs accept direct split ownership atomically", async () => {
  const bulk = await readFile(path.join(root, "app/api/assignments/route.ts"), "utf8");
  const details = await readFile(path.join(root, "app/api/assignment-details/route.ts"), "utf8");

  assert.match(bulk, /ownershipSchema/);
  assert.match(bulk, /morningParentId/);
  assert.match(bulk, /afternoonParentId/);
  assert.match(details, /ownershipSchema/);
  assert.match(details, /morningParentId/);
  assert.match(details, /afternoonParentId/);
});

test("day editor uses direct custody states and shows events", async () => {
  const panel = await readFile(path.join(root, "components/calendar/day-details-panel.tsx"), "utf8");

  assert.match(panel, /Full day you/);
  assert.match(panel, /them_full/);
  assert.match(panel, /me_then_them/);
  assert.match(panel, /them_then_me/);
  assert.match(panel, /Events on this day/);
  assert.doesNotMatch(panel, /Which part of the day\?/);
});

test("calendar bulk controls use direct custody states and create event remains visible", async () => {
  const shell = await readFile(path.join(root, "components/calendar/calendar-shell.tsx"), "utf8");
  const events = await readFile(path.join(root, "components/calendar/event-panel.tsx"), "utf8");

  assert.match(shell, /me_then_them/);
  assert.match(shell, /them_then_me/);
  assert.doesNotMatch(shell, /Bulk assignment period/);
  assert.match(events, /Create event/);
});

test("mobile month grid supports deliberate left and right swipe navigation", async () => {
  const gesture = await readFile(path.join(root, "components/calendar/mobile-calendar-swipe.tsx"), "utf8");
  const layout = await readFile(path.join(root, "app/layout.tsx"), "utf8");
  const styles = await readFile(path.join(root, "app/globals.css"), "utf8");

  assert.match(layout, /MobileCalendarSwipe/);
  assert.match(gesture, /max-width: 767px/);
  assert.match(gesture, /minimumSwipeDistance = 56/);
  assert.match(gesture, /horizontalIntentRatio = 1\.2/);
  assert.match(gesture, /deltaX < 0 \? "Next" : "Previous"/);
  assert.match(gesture, /event\.preventDefault\(\)/);
  assert.match(gesture, /button\[aria-pressed="true"\]/);
  assert.match(styles, /touch-action: pan-y/);
});


test("calendar month is viewport-bound and adjacent-month dates keep their planned content", async () => {
  const [shell, styles] = await Promise.all([
    readFile(path.join(root, "components/calendar/calendar-shell.tsx"), "utf8"),
    readFile(path.join(root, "app/globals.css"), "utf8"),
  ]);

  assert.match(shell, /covie-calendar-page/);
  assert.match(shell, /covie-calendar-grid/);
  assert.match(shell, /"--covie-week-rows"/);
  assert.match(styles, /height:\s*100dvh/);
  assert.match(styles, /overflow:\s*hidden/);
  assert.doesNotMatch(shell, /disabled=\{!inMonth \|\| saving\}/);
  assert.doesNotMatch(shell, /assignment && inMonth/);
  assert.doesNotMatch(shell, /dayEvents\[0\] && inMonth/);
});

test("calendar tiles show parent names at the top, date at right centre, and event strip at the bottom", async () => {
  const shell = await readFile(path.join(root, "components/calendar/calendar-shell.tsx"), "utf8");

  assert.match(shell, /ownerName\(fullDayOwner\)/);
  assert.match(shell, /grid grid-cols-2 text-center/);
  assert.match(shell, /right-1\.5 top-1\/2/);
  assert.match(shell, /primaryTileEvent/);
  assert.match(shell, /bg-\[#FF6B5F\]/);
  assert.match(shell, /splitDay \? 1 : 0/);
  assert.doesNotMatch(shell, /shortOwnerLabel/);
});

test("Google sync is a first-level Calendar action and install prompt is mobile-only", async () => {
  const [shell, settings, install] = await Promise.all([
    readFile(path.join(root, "components/calendar/calendar-shell.tsx"), "utf8"),
    readFile(path.join(root, "components/calendar/settings-panel.tsx"), "utf8"),
    readFile(path.join(root, "components/pwa/install-app.tsx"), "utf8"),
  ]);

  assert.match(shell, /Google[\s\S]*Sync/);
  assert.match(shell, /<GoogleCalendarSettings/);
  assert.doesNotMatch(settings, /GoogleCalendarSettings/);
  assert.match(install, /md:hidden/);
  assert.match(install, /Dismiss install prompt/);
});
