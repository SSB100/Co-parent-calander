# Owner-readiness synthetic browser QA

This harness bundles the real `TemplateShell`, Salon, Social Groups, Shared Facilities and Staff Team components, CSS modules, and `app/globals.css`. Only Next navigation/server-action/auth boundaries and API transport are fabricated. It never authenticates, reads live data, changes permissions, enables client booking or creates bookings/invitations. Unexpected API reads and every mutation fail the automated run.

## Run

Use a Node 24 environment with the repository dependencies plus Playwright or Playwright Core available. No package or lockfile changes are required. From the repository root:

```sh
node tests/browser/owner-readiness/run.mjs
```

When the browser tooling lives in a separate installed workspace:

```sh
TMPDIR=../covie-owner-tooling/tmp \
COVIE_BROWSER_TOOLING=../covie \
COVIE_PLAYWRIGHT_TOOLING=../agent-labs-r11 \
COVIE_BROWSER_OUTPUT=../covie-owner-tooling/owner-readiness-evidence \
node tests/browser/owner-readiness/run.mjs
```

`COVIE_BROWSER_TOOLING` selects the esbuild, PostCSS and Tailwind installation; actual application source and CSS still come from the current checkout. `COVIE_PLAYWRIGHT_TOOLING` independently selects Playwright/Playwright Core. By default, Chromium uses the Playwright-managed browser installed with `npx playwright install chromium`. Set `CHROMIUM_PATH=/usr/bin/chromium` only to select an existing system browser. Use a writable `TMPDIR` when `/tmp` is full; create the example directory first with `mkdir -p ../covie-owner-tooling/tmp`.

## Coverage

The runner defines 36 browser cases at 1440×900, 1100×560, 1440×480, 1024×480, 390×844 and 320×568:

- Salon, Social and Facilities: readiness stays inside the owner sidebar; expanded details leave the calendar width/height unchanged; desktop calendars retain usable height; no horizontal document overflow; screenshots before and after expansion.
- Social and Facilities: existing settings dialogs open from readiness; Escape and Back/Forward preserve working calendar state without mutations.
- Salon private/enabled states: only saved enabled state exposes copy/open links; copying uses the current origin and calendar ID; preview uses saved display fields even after an unsaved business-name edit; no client identity, contact, appointment note or block reason enters preview; preview causes no API request; nested Escape leaves Booking settings open; Close/repeated open and Back/Forward drop nested preview state; viewport fit; no public API or mutation calls.
- Staff Team: three non-owner active profiles are counted separately as one linked account, one pending acceptance and one profile-only; invitation acceptance and optional locations/leave remain explicit; no body overflow or mutations.

The run writes PNGs and `results.json` to `test-results/owner-readiness` or `COVIE_BROWSER_OUTPUT`. Failure writes the completed case list, error and any available failure DOM/screenshot. A failed Chromium launch produces no visual evidence.

## Optional supported-browser review

For a connected cloud browser that can reach the same localhost namespace, `COVIE_BROWSER_SERVE_ONLY=1` builds and prints a local fixture-server URL instead of launching Chromium. Open `/frame?fixture=salon&width=1440&height=900&date=2026-10-09` on that origin for an exact CSS iframe viewport. Variants are `salon`, `social`, `facilities`, `staff`, and `legacy-staff`; add `enabled=1` for enabled Salon sharing. `serve-transport.json` records synthetic API requests and the server rejects mutations. This is manual iframe QA, not a substitute for a successful automated Playwright run.

`COVIE_BROWSER_BUILD_ONLY=1` validates the component/CSS bundle without a browser. Build-only success establishes no layout or interaction results.

## 8 October 2026 execution status

- Passed: bundle generation using actual component/CSS source; JavaScript syntax check; focused ESLint for this directory.
- Not run: all 36 browser cases and screenshots. Chromium failed before opening a page with `process_singleton_posix.cc:297 socket() failed: Operation not permitted`, including an explicitly reviewed execution attempt. A supported cloud-browser attempt also failed before rendering: tab creation timed out and its next inventory reported `Connection closed`.
- These are environment blockers, not passing browser results. Run this harness in a browser-capable environment before treating responsive/visual verification as complete. No security settings were changed.
