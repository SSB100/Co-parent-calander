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
  const [styles, home, expenses, responsibilities, kids, childProfile, organiser, auth] = await Promise.all([
    source("app/globals.css"),
    source("components/home/home-shell.tsx"),
    source("components/expenses/expenses-shell.tsx"),
    source("components/responsibilities/responsibilities-shell.tsx"),
    source("components/children/kids-shell.tsx"),
    source("components/children/child-profile-shell.tsx"),
    source("components/workspace/organiser-shell.tsx"),
    source("components/auth/credentials-form.tsx"),
  ]);

  assert.match(styles, /--background: #fff9f2/i);
  assert.match(styles, /workspace-destinations > a\[aria-current="page"\],[\s\S]*workspace-organiser-menu\.is-active[\s\S]*#ff6b5f/i);
  assert.match(styles, /covie-page-header/);
  assert.match(styles, /covie-primary-action/);
  for (const page of [home, expenses, responsibilities, kids, childProfile, organiser]) {
    assert.match(page, /CoviePageHeader/);
    assert.match(page, /CoviePage/);
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
  const switcher = await source("components/calendars/calendar-switcher.tsx");

  assert.match(switcher, /max-h-\[72vh\]/);
  assert.match(switcher, /overflow-y-auto/);
  assert.match(switcher, /w-\[min\(92vw,28rem\)\]/);
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

test("Calendar day tiles centre the date, place custody below it, and stack up to three events", async () => {
  const [shell, categories] = await Promise.all([
    source("components/calendar/calendar-shell.tsx"),
    source("components/calendar/event-category-icon.tsx"),
  ]);

  assert.match(shell, /parentTileName/);
  assert.match(shell, /left-1\/2 top-1/);
  assert.match(shell, /top-8/);
  assert.doesNotMatch(shell, /right-1 top-1\/2/);
  assert.match(shell, /function TileEventStack/);
  assert.match(shell, /events\.find\(\(event\) => event\.category === "handover"\)/);
  assert.match(shell, /regularEvents\.slice\(0, 2\)/);
  assert.match(shell, /regularEvents\.slice\(0, 3\)/);
  assert.match(shell, /\.\.\.regularEvents\.slice\(0, 2\), handover/);
  assert.match(shell, /hiddenCount/);
  assert.match(shell, /inset-x-0 bottom-0/);
  assert.match(shell, /eventCategoryBarClass/);
  assert.match(categories, /eventCategoryBarClass/);
  assert.match(shell, /title: "Handover"/);
  assert.doesNotMatch(shell, /\+\{tileEvents\.length - 1\}/);
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

test("Calendar day cards show handover text without clock icons", async () => {
  const shell = await source("components/calendar/calendar-shell.tsx");

  assert.match(shell, /title: "Handover"/);
  assert.doesNotMatch(shell, /Clock3/);
  assert.doesNotMatch(shell, /aria-label="Handover"/);
  assert.doesNotMatch(shell, /marker\?\.handover \|\| marker\?\.note/);
});

test("Calendar removes the redundant next handover summary row", async () => {
  const shell = await source("components/calendar/calendar-shell.tsx");

  assert.doesNotMatch(shell, /Next handover:/);
  assert.doesNotMatch(shell, /nextHandoverOwner|nextHandoverWhen/);
});

test("day details put events before custody and delete events immediately", async () => {
  const panel = await source("components/calendar/day-details-panel.tsx");

  const eventsIndex = panel.indexOf("Shared plans recorded for this day");
  const custodyIndex = panel.indexOf("Current custody");
  assert.ok(eventsIndex >= 0);
  assert.ok(custodyIndex >= 0);
  assert.ok(eventsIndex < custodyIndex);
  assert.match(panel, /Delete event/);
  assert.match(panel, /method: "DELETE"/);
  assert.match(panel, /Event removed/);
  assert.doesNotMatch(panel, /Event cancellation sent to/);
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

test("core workspace editors and destructive confirmations use canonical Covie dialogs", async () => {
  const [
    ui,
    styles,
    expenses,
    responsibilities,
    childProfile,
    dayDetails,
    undoBulk,
    attachments,
    profilePhoto,
  ] = await Promise.all([
    source("components/ui/covie.tsx"),
    source("app/globals.css"),
    source("components/expenses/expenses-shell.tsx"),
    source("components/responsibilities/responsibilities-shell.tsx"),
    source("components/children/child-profile-shell.tsx"),
    source("components/calendar/day-details-panel.tsx"),
    source("components/calendar/undo-bulk-button.tsx"),
    source("components/attachments/attachment-panel.tsx"),
    source("components/attachments/profile-photo.tsx"),
  ]);

  assert.match(ui, /export function CovieDialog/);
  assert.match(ui, /export function CovieConfirmDialog/);
  assert.match(ui, /covie-dialog-footer/);
  assert.match(styles, /\.covie-input-shell/);
  assert.match(styles, /\.covie-dialog-close \{[\s\S]*?height: 44px;[\s\S]*?width: 44px;/);

  for (const editor of [expenses, responsibilities, childProfile, dayDetails, undoBulk]) {
    assert.match(editor, /CovieDialog/);
    assert.match(editor, /footer=\{/);
    assert.doesNotMatch(editor, /fixed inset-0 z-50/);
  }

  for (const destructiveSurface of [
    expenses,
    responsibilities,
    childProfile,
    dayDetails,
    attachments,
    profilePhoto,
  ]) {
    assert.match(destructiveSurface, /CovieConfirmDialog/);
    assert.doesNotMatch(destructiveSurface, /window\.confirm/);
  }

  assert.match(expenses, /covie-input/);
  assert.match(responsibilities, /covie-input/);
  assert.match(childProfile, /covie-input/);
  assert.match(dayDetails, /covie-input/);
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


test("record-management pages share Covie metrics filters empty states and cards", async () => {
  const [ui, styles, expenses, responsibilities, kids, proposalCard, proposalStatus] =
    await Promise.all([
      source("components/ui/covie.tsx"),
      source("app/globals.css"),
      source("components/expenses/expenses-shell.tsx"),
      source("components/responsibilities/responsibilities-shell.tsx"),
      source("components/children/kids-shell.tsx"),
      source("components/approvals/proposal-card.tsx"),
      source("components/approvals/proposal-status-chip.tsx"),
    ]);

  for (const primitive of [
    "CovieMetricGrid",
    "CovieMetricCard",
    "CovieSectionHeader",
    "CovieSegmentedControl",
    "CovieRecordCard",
    "CovieEmptyState",
  ]) {
    assert.match(ui, new RegExp(`export function ${primitive}`));
  }

  for (const page of [expenses, responsibilities]) {
    assert.match(page, /CovieMetricGrid/);
    assert.match(page, /CovieSectionHeader/);
    assert.match(page, /CovieSegmentedControl/);
    assert.match(page, /CovieRecordCard/);
    assert.match(page, /CovieEmptyState/);
    assert.doesNotMatch(page, /(?:bg|text|border)-sky-/);
    assert.doesNotMatch(page, /(?:bg|text|border)-blue-/);
  }

  assert.match(kids, /CovieEmptyState/);
  assert.doesNotMatch(kids, /index % 3/);
  assert.match(kids, /bg-white/);
  assert.match(kids, /hover:border-\[#765ED6\]/);

  assert.match(proposalCard, /CovieStrongCard/);
  assert.match(proposalStatus, /CovieStatusBadge/);
  assert.doesNotMatch(proposalCard, /text-\[10px\]/);

  assert.match(styles, /\.covie-metric-grid/);
  assert.match(styles, /\.covie-segmented-control/);
  assert.match(styles, /\.covie-record-card/);
  assert.match(styles, /\.covie-tool-menu > button,[\s\S]*?\.covie-tool-menu > a/);
});

test("Calendar and compact workspace controls follow the final brand consistency gate", async () => {
  const [
    styles,
    calendar,
    switcher,
    day,
    events,
    recurring,
    members,
    settings,
    attachments,
    profilePhoto,
    identity,
    categories,
  ] = await Promise.all([
    source("app/globals.css"),
    source("components/calendar/calendar-shell.tsx"),
    source("components/calendars/calendar-switcher.tsx"),
    source("components/calendar/day-details-panel.tsx"),
    source("components/calendar/event-panel.tsx"),
    source("components/calendar/recurring-schedule-panel.tsx"),
    source("components/calendar/members-panel.tsx"),
    source("components/calendar/settings-panel.tsx"),
    source("components/attachments/attachment-panel.tsx"),
    source("components/attachments/profile-photo.tsx"),
    source("lib/parents/identity.ts"),
    source("components/calendar/event-category-icon.tsx"),
  ]);

  for (const text of [calendar, switcher, day, events, recurring, members, settings]) {
    assert.doesNotMatch(text, /text-\[(?:8|9|10)px\]/);
    assert.doesNotMatch(text, /(?:bg|text|border|ring)-blue-/);
    assert.doesNotMatch(text, /shadow-(?:sm|md|lg|xl|2xl)/);
    assert.doesNotMatch(text, /min-h-10/);
  }

  assert.match(calendar, /eventCategoryBarClass/);
  assert.match(day, /eventCategorySurfaceClass/);
  assert.match(events, /eventCategorySurfaceClass/);
  assert.match(categories, /school[\s\S]*#765ED6/);
  assert.match(categories, /sport[\s\S]*#19A897/);
  assert.match(categories, /medical[\s\S]*#FF6B5F/);
  assert.match(categories, /birthday[\s\S]*#F4C64E/);
  assert.match(categories, /holiday[\s\S]*#3B73AE/);
  assert.match(categories, /activity[\s\S]*#0D7A6D/);
  assert.match(categories, /handover[\s\S]*#FF5A8A/);
  assert.doesNotMatch(categories, /handover[\s\S]*bg-\[#243139\]/);
  assert.doesNotMatch(categories, /birthday" \|\| category === "holiday"/);
  assert.doesNotMatch(categories, /sport" \|\| category === "activity"/);
  assert.doesNotMatch(categories, /bg-\[#(?:DDD3FA|BFEDE6|FFD0CB|F7DC86|C3DCF7|D7F2EC|F4F1FF|EAF8F5|FFF3F1|FFF9DF|EEF5FC|F0FBF8)\]/);

  assert.match(calendar, /CovieStatusBadge/);
  assert.match(calendar, /CovieNotice/);
  assert.match(calendar, /ring-\[#765ED6\]/);
  assert.match(switcher, /shadow-\[5px_5px_0_#F4C64E\]/);

  assert.doesNotMatch(attachments, /h-8 w-8|min-h-9|min-h-10/);
  assert.doesNotMatch(profilePhoto, /h-8 w-8|text-\[10px\]/);
  assert.match(settings, /h-11 w-11 rounded-full/);
  assert.match(members, /CovieStatusBadge/);
  assert.match(identity, /Functional identity palette/);
  assert.match(identity, /Blue is intentionally available here as an identity colour/);

  assert.match(styles, /Calendar QA target widths: 320, 375, 390 and 430px/);
  assert.match(styles, /\.workspace-mobile-actions-trigger \{[\s\S]*?height: 44px;[\s\S]*?width: 44px;/);
  assert.doesNotMatch(styles, /font-size:\s*(?:9|10)px;/);
  assert.match(styles, /\.covie-calendar-grid \{[\s\S]*?gap: 2px;/);
});

test("mobile keyboard support keeps focused fields inside the visual viewport", async () => {
  const [layout, guard, styles] = await Promise.all([
    source("app/layout.tsx"),
    source("components/workspace/mobile-keyboard-guard.tsx"),
    source("app/globals.css"),
  ]);

  assert.match(layout, /interactiveWidget: "resizes-content"/);
  assert.match(layout, /viewportFit: "cover"/);
  assert.match(layout, /MobileKeyboardGuard/);
  assert.match(guard, /window\.visualViewport/);
  assert.match(guard, /scrollIntoView/);
  assert.match(guard, /covieKeyboardOpen/);
  assert.match(styles, /--covie-visual-viewport-height/);
  assert.match(styles, /data-covie-keyboard-open="true"[\s\S]*\.workspace-nav[\s\S]*display: none/);
  assert.match(styles, /\.covie-dialog-body[\s\S]*scroll-padding-bottom/);
});

test("Calendar mobile header omits editor and repeating-schedule tags", async () => {
  const shell = await source("components/calendar/calendar-shell.tsx");

  assert.doesNotMatch(shell, /currentEditor|Editor access/);
  assert.doesNotMatch(shell, /Repeating schedule on/);
  assert.match(shell, /View only/);
  assert.match(shell, /hidden sm:inline-flex/);
});

test("workspace dropdowns dismiss when users click elsewhere or press Escape", async () => {
  const [hook, switcher, nav, shell, coming] = await Promise.all([
    source("lib/client/use-details-dismiss.ts"),
    source("components/calendars/calendar-switcher.tsx"),
    source("components/workspace/workspace-nav.tsx"),
    source("components/calendar/calendar-shell.tsx"),
    source("components/workspace/coming-up.tsx"),
  ]);

  assert.match(hook, /pointerdown/);
  assert.match(hook, /details\.contains\(event\.target\)/);
  assert.match(hook, /event\.key !== "Escape"/);
  assert.match(switcher, /useDismissibleDetails\(detailsRef\)/);
  assert.match(nav, /useDismissibleDetails\(accountRef\)/);
  assert.match(shell, /useDismissibleDetails\(toolsMenuRef\)/);
  assert.match(shell, /useDismissibleDetails\(settingsMenuRef\)/);
  assert.match(coming, /mobileOnly: true/);
  assert.match(switcher, /name="calendar-management"/);
});

test("Updates uses a compact single-viewport desktop layout", async () => {
  const shell = await source("components/home/home-shell.tsx");

  assert.match(shell, /lg:flex lg:h-screen lg:flex-col lg:overflow-hidden/);
  assert.match(shell, /lg:grid-cols-\[1\.12fr_0\.88fr\]/);
  assert.match(shell, /lg:overflow-y-auto/);
  assert.match(shell, /grid grid-cols-2 gap-2/);
  assert.match(shell, /Open updates/);
  assert.match(shell, /Today/);
  assert.match(shell, /Children/);
});

test("Children workspace starts simple and exposes Add child after onboarding", async () => {
  const [kids, profile] = await Promise.all([
    source("components/children/kids-shell.tsx"),
    source("components/children/child-profile-shell.tsx"),
  ]);

  assert.match(kids, /AddChildPanel/);
  assert.match(kids, /Start with the basics/);
  assert.match(kids, /Open profile/);
  assert.match(profile, /School & care/);
  assert.match(profile, /Documents & related items/);
  assert.match(profile, /<details/);
  assert.doesNotMatch(profile, /defaultOpen/);
});
