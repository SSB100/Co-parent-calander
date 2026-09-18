import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

test("Google connection APIs use membership access, not editor-only access", async () => {
  const paths = [
    "app/api/google-calendar/route.ts",
    "app/api/google-calendar/connect/route.ts",
    "app/api/google-calendar/callback/route.ts",
    "app/api/google-calendar/reconcile/route.ts",
  ];
  const files = await Promise.all(paths.map((file) => readFile(path.join(root, file), "utf8")));

  for (const text of files) {
    assert.match(text, /getCalendarSession/);
    assert.doesNotMatch(text, /getEditorSession/);
  }
});

test("calendar settings are readable by viewers but still writable only by editors", async () => {
  const text = await readFile(path.join(root, "app/api/settings/route.ts"), "utf8");

  assert.match(text, /export async function GET\(\)[\s\S]*?getCalendarSession\(\)/);
  assert.match(text, /export async function PATCH[\s\S]*?getEditorSession\(\)/);
});

test("viewer UI exposes only read-only family settings plus the viewer's own Google integration", async () => {
  const [shell, settings] = await Promise.all([
    readFile(path.join(root, "components/calendar/calendar-shell.tsx"), "utf8"),
    readFile(path.join(root, "components/calendar/settings-panel.tsx"), "utf8"),
  ]);

  assert.match(shell, /SettingsPanel readOnly=\{accessMode === "viewer"\}/);
  assert.match(settings, /GoogleCalendarSettings/);
  assert.match(settings, /disabled=\{saving \|\| readOnly\}/);
  assert.match(settings, /!readOnly \? \(/);
});

test("OAuth requests only the app-created-calendar scope", async () => {
  const [config, api] = await Promise.all([
    readFile(path.join(root, "lib/google-calendar/config.ts"), "utf8"),
    readFile(path.join(root, "lib/google-calendar/google-api.ts"), "utf8"),
  ]);

  assert.match(config, /https:\/\/www\.googleapis\.com\/auth\/calendar\.app\.created/);
  assert.doesNotMatch(config, /auth\/calendar\.events(?:["'\s]|$)/);
  assert.doesNotMatch(config, /auth\/calendar(?:["'\s]|$)/);
  assert.doesNotMatch(api, /calendarList/);
  assert.doesNotMatch(api, /primary/);
});

test("OAuth callback binds state to the same logged-in calendar membership", async () => {
  const [oauth, callback] = await Promise.all([
    readFile(path.join(root, "lib/google-calendar/oauth.ts"), "utf8"),
    readFile(path.join(root, "app/api/google-calendar/callback/route.ts"), "utf8"),
  ]);

  assert.match(oauth, /code_challenge_method.*S256/);
  assert.match(oauth, /access_type.*offline/);
  assert.match(oauth, /state/);
  assert.match(callback, /session\.membershipId !== state\.membershipId/);
  assert.match(callback, /session\.calendarId !== state\.calendarId/);
});

test("connection responses never expose Google tokens or account data", async () => {
  const route = await readFile(path.join(root, "app/api/google-calendar/route.ts"), "utf8");
  const responseBlock = route.slice(route.indexOf("return NextResponse.json({\n    configured:"));

  assert.doesNotMatch(responseBlock, /accessTokenEncrypted/);
  assert.doesNotMatch(responseBlock, /refreshTokenEncrypted/);
  assert.doesNotMatch(responseBlock, /googleAccount/i);
  assert.doesNotMatch(responseBlock, /email/i);
});

test("calendar mutations enqueue durable Google work inside their database transaction", async () => {
  const files = await Promise.all(
    [
      "app/api/assignments/route.ts",
      "app/api/assignment-details/route.ts",
      "app/api/assignments/undo/route.ts",
      "app/api/events/route.ts",
      "app/api/recurring-schedule/route.ts",
      "app/api/settings/route.ts",
      "app/api/parents/route.ts",
    ].map((file) => readFile(path.join(root, file), "utf8")),
  );

  for (const text of files) {
    assert.match(text, /buildCalendarSyncJobStatement/);
    assert.match(text, /sql\.transaction/);
  }
});

test("integration remains disabled cleanly when Google environment variables are absent", async () => {
  const [config, ui] = await Promise.all([
    readFile(path.join(root, "lib/google-calendar/config.ts"), "utf8"),
    readFile(path.join(root, "components/calendar/google-calendar-settings.tsx"), "utf8"),
  ]);

  assert.match(config, /isGoogleCalendarConfigured/);
  assert.match(ui, /Google Calendar syncing is not configured in this environment/);
});

test("Preview OAuth uses the exact Vercel deployment URL rather than the branch alias", async () => {
  const config = await readFile(path.join(root, "lib/google-calendar/config.ts"), "utf8");

  assert.match(config, /VERCEL_ENV === "preview"/);
  assert.match(config, /VERCEL_URL/);
  assert.match(config, /https:\/\/\$\{process\.env\.VERCEL_URL\}/);
});

test("Production OAuth uses Vercel's canonical production URL", async () => {
  const config = await readFile(path.join(root, "lib/google-calendar/config.ts"), "utf8");

  assert.match(config, /VERCEL_ENV === "production"/);
  assert.match(config, /VERCEL_PROJECT_PRODUCTION_URL/);
  assert.match(config, /https:\/\/\$\{process\.env\.VERCEL_PROJECT_PRODUCTION_URL\}/);
  assert.match(config, /NEXT_PUBLIC_APP_URL/);
});
