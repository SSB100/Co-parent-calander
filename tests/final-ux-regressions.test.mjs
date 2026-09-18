import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

async function source(file) {
  return readFile(path.join(root, file), "utf8");
}

test("public landing explains Covie in three steps and four core areas", async () => {
  const home = await source("app/page.tsx");

  assert.match(home, /Co-parenting,/);
  assert.match(home, /organised in one shared place/);
  assert.match(home, /Less back-and-forth\. More clarity\./);
  assert.match(home, /Create or join/);
  assert.match(home, /Plan together/);
  assert.match(home, /Know what’s next/);
  assert.match(home, /Schedule/);
  assert.match(home, /Expenses/);
  assert.match(home, /Responsibilities/);
  assert.match(home, /Agreements/);
  assert.match(home, /Create an account/);
  assert.match(home, /Log in/);
  assert.match(home, /aria-hidden="true"/);
});

test("landing positioning keeps Covie cooperative and organiser-focused", async () => {
  const [home, manifest] = await Promise.all([
    source("app/page.tsx"),
    source("app/manifest.ts"),
  ]);

  assert.match(home, /shared organiser/);
  assert.match(home, /not a payment\s+app, legal evidence/);
  assert.match(home, /works even if/);
  assert.match(manifest, /shared organiser/);
  assert.match(manifest, /expenses, responsibilities and agreements/);
});

test("public brand uses the approved solid-colour visual system", async () => {
  const [home, brand, brandGuide] = await Promise.all([
    source("app/page.tsx"),
    source("components/workspace/covie-brand.tsx"),
    source("docs/COVIE_BRAND.md"),
  ]);

  for (const colour of ["#FF6B5F", "#19A897", "#F4C64E", "#765ED6", "#243139", "#FFF9F2"]) {
    assert.match(home, new RegExp(colour.replace("#", "\\#"), "i"));
  }

  assert.doesNotMatch(home, /gradient/i);
  assert.doesNotMatch(home, /blur-/i);
  assert.doesNotMatch(brand, /linearGradient|radialGradient/i);
  assert.match(brandGuide, /solid colours only/i);
  assert.match(brandGuide, /Covie Loop/i);
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
  assert.match(install, /shared organiser/);
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
