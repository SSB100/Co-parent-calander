import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

async function source(file) {
  return readFile(path.join(root, file), "utf8");
}

test("all signed-in accounts start in Personal and can optionally add a calendar", async () => {
  const [home, onboarding, calendar, proxy] = await Promise.all([
    source("app/page.tsx"),
    source("app/onboarding/page.tsx"),
    source("app/calendar/page.tsx"),
    source("proxy.ts"),
  ]);

  assert.match(home, /session\?\.user\) redirect\("\/personal"\)/);
  assert.doesNotMatch(home, /getCalendarSession/);
  assert.match(onboarding, /listCalendarNavigationOptions/);
  assert.match(onboarding, /listArchivedCalendarNavigationOptions/);
  assert.doesNotMatch(onboarding, /redirect\("\/calendar"\)/);
  assert.match(onboarding, /hasExistingCalendar=\{activeCalendars.length > 0\}/);
  assert.match(calendar, /redirect\("\/onboarding"\)/);
  assert.match(proxy, /\/onboarding\/\:path\*/);
  assert.match(onboarding, /if \(!session\?\.user\) redirect\(inviteSignInPath\(inviteCode\)\)/);
  assert.match(proxy, /inviteSignInPath\(request.nextUrl.searchParams.get\("invite"\)\)/);
  assert.match(proxy, /auth.middleware\(\{ loginUrl \}\)\(request\)/);
});

test("signup and login preserve a shared invite into onboarding", async () => {
  const [actions, page, form] = await Promise.all([
    source("app/auth/actions.ts"),
    source("app/auth/[path]/page.tsx"),
    source("components/auth/credentials-form.tsx"),
  ]);

  assert.match(actions, /onboardingDestination/);
  assert.match(actions, /normalizeInviteCode/);
  assert.match(actions, /redirect\(invite \? onboardingDestination\(formData\) : safeAuthReturnTo\(formData\.get\("returnTo"\)\) \|\| "\/personal"\)/);
  assert.match(actions, /redirect\(verificationDestination\(formData\)\)/);
  assert.match(page, /searchParams/);
  assert.match(page, /inviteCode/);
  assert.match(form, /name="invite"/);
  assert.match(form, /\?invite=/);
  assert.match(form, /safeReturn \|\| "\/personal"/);
});

test("onboarding offers one clear create or join choice", async () => {
  const shell = await source("components/onboarding/onboarding-shell.tsx");

  assert.match(shell, /Create a Covie calendar/);
  assert.match(shell, /Join a Covie calendar/);
  assert.match(shell, /href="\/personal" prefetch=\{false\}/);
  assert.match(shell, /Back to Personal/);
  assert.match(shell, /Archived calendars/);
  assert.match(shell, /restoreCalendar/);
  assert.match(shell, /name="flow" value="onboarding"/);
  assert.match(shell, /CalendarTypeChoiceGrid/);
  assert.match(shell, /name="calendarType"/);
  assert.match(shell, /name="calendarName"/);
  assert.match(shell, /selectedType === "co_parenting"/);
  assert.match(shell, /name="children"/);
  assert.match(shell, /name="code"/);
  assert.doesNotMatch(shell, /membership|participant ID|database permission/i);
});

test("onboarding create generates an editor invite and hands it into Calendar", async () => {
  const [actions, calendar, welcome] = await Promise.all([
    source("app/calendar/actions.ts"),
    source("app/calendar/page.tsx"),
    source("components/onboarding/new-calendar-welcome.tsx"),
  ]);

  assert.match(actions, /generateInviteCode/);
  assert.match(actions, /NEW_CALENDAR_INVITE_COOKIE_NAME/);
  assert.match(actions, /INSERT INTO calendar_invites/);
  assert.match(actions, /'editor'/);
  assert.match(actions, /\/calendar\?welcome=created/);
  assert.match(calendar, /NEW_CALENDAR_INVITE_COOKIE_NAME/);
  assert.match(welcome, /Invite your co-parent/);
  assert.match(welcome, /Copy invite link/);
  assert.match(welcome, /Maybe later/);
});

test("join flow explains invalid, expired, used and existing membership cases", async () => {
  const actions = await source("app/calendar/actions.ts");

  assert.match(actions, /We couldn’t find that invitation/);
  assert.match(actions, /This invitation has expired/);
  assert.match(actions, /This invitation has already been used/);
  assert.match(actions, /existingMembership/);
  assert.match(actions, /cookieStore\.set\(\s*SELECTED_CALENDAR_COOKIE_NAME/);
  assert.match(actions, /available_participant AS/);
  assert.match(actions, /new_participant AS/);
});

test("calendar sessions fall back safely when the selected calendar cookie is stale", async () => {
  const session = await source("lib/security/session.ts");

  assert.match(session, /selectedMembership/);
  assert.match(session, /membershipForUser\(accountSession\.user\.id, selectedCalendarId\)/);
  assert.match(session, /selectedMembership \?\? \(await membershipForUser\(accountSession\.user\.id\)\)/);
});

test("Covie brand links return to Personal without changing calendar workspace tabs", async () => {
  for (const file of ["components/templates/template-workspace-nav.tsx", "components/workspace/workspace-nav.tsx"]) {
    assert.match(await source(file), /href="\/personal" prefetch=\{false\} aria-label="Covie Personal"/);
  }
});
