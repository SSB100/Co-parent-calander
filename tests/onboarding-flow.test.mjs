import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

async function source(file) {
  return readFile(path.join(root, file), "utf8");
}

test("new accounts enter onboarding while existing calendar sessions bypass it", async () => {
  const [home, onboarding, calendar, proxy] = await Promise.all([
    source("app/page.tsx"),
    source("app/onboarding/page.tsx"),
    source("app/calendar/page.tsx"),
    source("proxy.ts"),
  ]);

  assert.match(home, /calendar \? "\/calendar" : "\/onboarding"/);
  assert.match(onboarding, /calendar_memberships/);
  assert.match(onboarding, /memberships\.length > 0 && !inviteCode/);
  assert.match(onboarding, /redirect\("\/calendar"\)/);
  assert.match(calendar, /redirect\("\/onboarding"\)/);
  assert.match(proxy, /\/onboarding\/\:path\*/);
});

test("signup and login preserve a shared invite into onboarding", async () => {
  const [actions, page, form] = await Promise.all([
    source("app/auth/actions.ts"),
    source("app/auth/[path]/page.tsx"),
    source("components/auth/credentials-form.tsx"),
  ]);

  assert.match(actions, /onboardingDestination/);
  assert.match(actions, /normalizeInviteCode/);
  assert.match(actions, /redirect\(onboardingDestination\(formData\)\)/);
  assert.match(page, /searchParams/);
  assert.match(page, /inviteCode/);
  assert.match(form, /name="invite"/);
  assert.match(form, /\?invite=/);
});

test("onboarding offers one clear create or join choice", async () => {
  const shell = await source("components/onboarding/onboarding-shell.tsx");

  assert.match(shell, /Create a Covie calendar/);
  assert.match(shell, /Join a Covie calendar/);
  assert.match(shell, /name="flow" value="onboarding"/);
  assert.match(shell, /name="calendarName"/);
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
