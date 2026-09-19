import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

async function source(file) {
  return readFile(path.join(root, file), "utf8");
}

test("public landing is concise, product-led and uses recognizable Covie previews", async () => {
  const [home, previews] = await Promise.all([
    source("app/page.tsx"),
    source("components/marketing/product-previews.tsx"),
  ]);

  assert.match(home, /Life between two homes, made simpler/);
  assert.match(home, /Create or join/);
  assert.match(home, /Add the plan/);
  assert.match(home, /See what matters/);
  assert.match(home, /Schedule/);
  assert.match(home, /Updates/);
  assert.match(home, /Expenses/);
  assert.match(home, /Responsibilities/);
  assert.match(home, /Agreements/);
  assert.match(home, /Create an account/);
  assert.match(home, /Log in/);
  assert.match(previews, /Alex/);
  assert.match(previews, /Sam/);
  assert.match(previews, /School show/);
  assert.match(previews, /Handover/);
});

test("landing hero fits the desktop viewport beneath navigation", async () => {
  const home = await source("app/page.tsx");

  assert.match(home, /h-20/);
  assert.match(home, /lg:h-\[calc\(100svh-5rem\)\]/);
  assert.match(home, /lg:max-h-\[760px\]/);
  assert.match(home, /lg:min-h-\[480px\]/);
  assert.doesNotMatch(home, /lg:min-h-\[(?:570|720)px\]/);
});

test("public brand uses solid Covie colours without decorative gradients", async () => {
  const [home, previews, brand, brandGuide] = await Promise.all([
    source("app/page.tsx"),
    source("components/marketing/product-previews.tsx"),
    source("components/workspace/covie-brand.tsx"),
    source("docs/COVIE_BRAND.md"),
  ]);

  const combined = home + previews;
  for (const colour of ["#FF6B5F", "#19A897", "#F4C64E", "#765ED6", "#243139", "#FFF9F2"]) {
    assert.match(combined, new RegExp(colour.replace("#", "\\#"), "i"));
  }

  assert.doesNotMatch(home, /gradient/i);
  assert.doesNotMatch(previews, /gradient/i);
  assert.doesNotMatch(brand, /linearGradient|radialGradient/i);
  assert.match(brandGuide, /solid colours only/i);
  assert.match(brandGuide, /Covie Loop/i);
});

test("redundant decorative eyebrow labels are removed from core product pages", async () => {
  const files = await Promise.all([
    source("components/calendar/calendar-shell.tsx"),
    source("components/home/home-shell.tsx"),
    source("components/expenses/expenses-shell.tsx"),
    source("components/responsibilities/responsibilities-shell.tsx"),
    source("components/children/kids-shell.tsx"),
    source("components/children/child-profile-shell.tsx"),
    source("components/workspace/organiser-shell.tsx"),
    source("components/onboarding/onboarding-shell.tsx"),
  ]);
  const combined = files.join("\n");

  for (const label of [
    "Shared family calendar",
    "Covie expenses",
    "Covie responsibilities",
    "Covie kids",
    "Welcome to Covie",
  ]) {
    assert.doesNotMatch(combined, new RegExp(label, "i"));
  }
});

test("authenticated pages share the public Covie design system", async () => {
  const [styles, home, expenses, responsibilities, kids, organiser, auth] = await Promise.all([
    source("app/globals.css"),
    source("components/home/home-shell.tsx"),
    source("components/expenses/expenses-shell.tsx"),
    source("components/responsibilities/responsibilities-shell.tsx"),
    source("components/children/kids-shell.tsx"),
    source("components/workspace/organiser-shell.tsx"),
    source("components/auth/credentials-form.tsx"),
  ]);

  assert.match(styles, /--background: #fff9f2/i);
  assert.match(styles, /workspace-destinations a\[aria-current="page"\].*#ff6b5f/i);
  assert.match(styles, /covie-page-header/);
  assert.match(styles, /covie-primary-action/);
  for (const page of [home, expenses, responsibilities, kids, organiser]) {
    assert.match(page, /covie-page-header/);
    assert.match(page, /covie-page-title/);
  }
  assert.match(auth, /#FFF9F2/);
  assert.match(auth, /#FF6B5F/);
});

test("new-account onboarding has a clear escape while invited existing users can return", async () => {
  const shell = await source("components/onboarding/onboarding-shell.tsx");

  assert.match(shell, /authClient\.signOut/);
  assert.match(shell, /Log out/);
  assert.match(shell, /Back to calendar/);
  assert.match(shell, /signOutError/);
  assert.match(shell, /role="alert"/);
});

test("multi-calendar controls remain bounded and accessible on smaller screens", async () => {
  const switcher = await source("components/calendar/calendar-switcher.tsx");

  assert.match(switcher, /max-h-\[72vh\]/);
  assert.match(switcher, /overflow-y-auto/);
  assert.match(switcher, /max-w-\[calc\(100vw-9rem\)\]/);
  assert.match(switcher, /aria-current=\{active \? "page"/);
});

test("PWA install affordance stays inside the authenticated Calendar workspace", async () => {
  const [calendarPage, shell, install] = await Promise.all([
    source("app/calendar/page.tsx"),
    source("components/calendar/calendar-shell.tsx"),
    source("components/pwa/install-app.tsx"),
  ]);

  assert.doesNotMatch(calendarPage, /InstallApp/);
  assert.match(shell, /import \{ InstallApp \}/);
  assert.match(shell, /<InstallApp \/>/);
  assert.match(install, /Add Covie to your phone/);
  assert.match(install, /sm:hidden/);
  assert.match(install, /fixed bottom-/);
});

test("Calendar fills the viewport and adjacent month days remain interactive", async () => {
  const [shell, styles] = await Promise.all([
    source("components/calendar/calendar-shell.tsx"),
    source("app/globals.css"),
  ]);

  assert.match(shell, /covie-calendar-page/);
  assert.match(shell, /covie-calendar-board/);
  assert.match(shell, /gridTemplateRows/);
  assert.doesNotMatch(shell, /disabled=\{!inMonth \|\| saving\}/);
  assert.match(styles, /height: 100dvh/);
  assert.match(styles, /overflow: hidden/);
});

test("Calendar day tiles use parent names and a full-width bright event strip", async () => {
  const shell = await source("components/calendar/calendar-shell.tsx");

  assert.match(shell, /parentTileName/);
  assert.match(shell, /inset-x-1 top-1/);
  assert.match(shell, /right-1 top-1\/2/);
  assert.match(shell, /inset-x-0 bottom-0/);
  assert.match(shell, /#F4C64E/);
  assert.match(shell, /title: "Handover"/);
  assert.doesNotMatch(shell, /shortOwnerLabel\(assignment\.morning\).*→.*shortOwnerLabel\(assignment\.afternoon\)/);
});

test("Google Calendar has a direct action outside Calendar settings", async () => {
  const [shell, action] = await Promise.all([
    source("components/calendar/calendar-shell.tsx"),
    source("components/calendar/google-calendar-quick-action.tsx"),
  ]);

  assert.match(shell, /GoogleCalendarQuickAction/);
  assert.match(action, /Connect Google Calendar/);
  assert.match(action, /Sync Google Calendar/);
  assert.match(action, /GoogleGMark/);
  assert.match(action, /\/api\/google-calendar\/connect/);
  assert.match(action, /\/api\/google-calendar\/reconcile/);
});

test("Calendar recovery copy no longer points users to the retired selector page", async () => {
  const shell = await source("components/calendar/calendar-shell.tsx");

  assert.match(shell, /Try another calendar from the calendar name above/);
  assert.doesNotMatch(shell, /Return to your calendars and try again/);
});

test("first invite panel remains usable on narrow screens", async () => {
  const welcome = await source("components/onboarding/new-calendar-welcome.tsx");

  assert.match(welcome, /flex-col gap-3 sm:flex-row/);
  assert.match(welcome, /break-all/);
  assert.match(welcome, /Copy invite link/);
  assert.match(welcome, /Maybe later/);
});


test("workspace rail prioritises organiser context and caps Your Events at three", async () => {
  const [route, coming, shell, nav, styles] = await Promise.all([
    source("app/api/coming-up/route.ts"),
    source("components/workspace/coming-up.tsx"),
    source("components/calendar/calendar-shell.tsx"),
    source("components/workspace/workspace-nav.tsx"),
    source("app/globals.css"),
  ]);

  assert.match(coming, /Organiser/);
  assert.match(coming, /Responsibilities/);
  assert.match(coming, /Expenses/);
  assert.match(coming, /Your Events/);
  assert.match(coming, /workspace-event-card/);
  assert.match(route, /items: allEventItems\.slice\(0, 3\)/);
  assert.match(route, /responsibilityTotal/);
  assert.match(route, /expenseTotal/);
  assert.match(route, /loadEffectiveAssignmentMap/);
  assert.match(nav, /workspace-destinations[\s\S]*desktop-coming-up[\s\S]*ComingUp/);
  assert.match(styles, /width: 252px/);
  assert.match(shell, /max-w-none/);
  assert.doesNotMatch(shell, /covie-calendar-events-rail/);
  assert.doesNotMatch(shell, /ComingUp variant=/);
});

test("Calendar removes the redundant next handover summary row", async () => {
  const shell = await source("components/calendar/calendar-shell.tsx");

  assert.doesNotMatch(shell, /Next handover:/);
  assert.doesNotMatch(shell, /nextHandoverOwner|nextHandoverWhen/);
});

test("day details put events before custody and expose approval-aware event deletion", async () => {
  const panel = await source("components/calendar/day-details-panel.tsx");

  const eventsIndex = panel.indexOf("Shared plans recorded for this day");
  const custodyIndex = panel.indexOf("Current custody");
  assert.ok(eventsIndex >= 0);
  assert.ok(custodyIndex >= 0);
  assert.ok(eventsIndex < custodyIndex);
  assert.match(panel, /Delete event/);
  assert.match(panel, /method: "DELETE"/);
  assert.match(panel, /Event cancellation sent to/);
  assert.match(panel, /all of its repeated occurrences/);
  assert.match(panel, /onEventChanged/);
});

test("Updates navigation shows an actionable approval notification count on desktop and mobile", async () => {
  const [route, nav, styles] = await Promise.all([
    source("app/api/notifications/route.ts"),
    source("components/workspace/workspace-nav.tsx"),
    source("app/globals.css"),
  ]);

  assert.match(route, /approverMembershipId === session\.membershipId/);
  assert.match(nav, /notificationCount/);
  assert.match(nav, /workspace-notification-badge/);
  assert.match(styles, /workspace-notification-badge/);
});


test("calendar tool dialogs use the shared branded responsive shell", async () => {
  const [styles, range, schedules, events, settings, members, activity, share] =
    await Promise.all([
      source("app/globals.css"),
      source("components/calendar/range-assignment-panel.tsx"),
      source("components/calendar/recurring-schedule-panel.tsx"),
      source("components/calendar/event-panel.tsx"),
      source("components/calendar/settings-panel.tsx"),
      source("components/calendar/members-panel.tsx"),
      source("components/calendar/activity-panel.tsx"),
      source("components/calendar/share-panel.tsx"),
    ]);

  const dialogs = [range, schedules, events, settings, members, activity, share];

  assert.match(styles, /\.covie-dialog-backdrop/);
  assert.match(styles, /\.covie-dialog-header/);
  assert.match(styles, /\.covie-dialog-body/);
  assert.match(styles, /\.covie-dialog-footer/);
  assert.match(styles, /max-height: calc\(100dvh - 8px\)/);
  assert.match(styles, /max-height: calc\(100dvh - 48px\)/);

  for (const dialog of dialogs) {
    assert.match(dialog, /covie-dialog-backdrop/);
    assert.match(dialog, /covie-dialog-header/);
    assert.match(dialog, /covie-dialog-close/);
    assert.match(dialog, /covie-dialog-body/);
  }

  assert.match(range, /covie-dialog-footer/);
  assert.match(events, /covie-dialog-footer/);
  assert.match(settings, /covie-dialog-footer/);
  assert.match(schedules, /covie-dialog-footer/);
  assert.match(members, /covie-dialog-footer/);
  assert.match(share, /covie-dialog-footer/);
  assert.match(events, /<details[\s\S]*Upcoming events/);
  assert.match(schedules, /<details[\s\S]*Preview first four weeks/);
  assert.match(settings, /<details[\s\S]*Google Calendar/);
});

test("calendar modal save controls stay outside the scrolling dialog body", async () => {
  const [range, schedules, events, settings] = await Promise.all([
    source("components/calendar/range-assignment-panel.tsx"),
    source("components/calendar/recurring-schedule-panel.tsx"),
    source("components/calendar/event-panel.tsx"),
    source("components/calendar/settings-panel.tsx"),
  ]);

  for (const [text, action] of [
    [range, "Clear range"],
    [schedules, "Save schedule"],
    [events, "Create event"],
    [settings, "Save settings"],
  ]) {
    const bodyEnd = text.lastIndexOf("</div>\n\n            <footer");
    const footerAction = text.lastIndexOf(action);
    assert.ok(bodyEnd >= 0);
    assert.ok(footerAction > bodyEnd);
  }
});
