# Timesheets synthetic browser checks

Bundles the real TemplateShell, Timesheets components, CSS modules and app globals. Next navigation, server actions and auth boundaries are replaced. API reads use synthetic owner, assigned-manager and staff DTOs. Every external URL, unexpected API or mutation, and unmocked API fails the run. The two work-type journeys allow only explicitly scoped, in-memory saveWorkType or saveEntry requests; no mutation reaches a real API. No account is signed in and no live data is read or changed.

Run from the repository root with Playwright 1.56.1 and esbuild 0.25.12 available (the CI browser job installs these into its disposable workspace):

```sh
node tests/browser/timesheets/run.mjs
```

Set `COVIE_BROWSER_TOOLING` and `COVIE_PLAYWRIGHT_TOOLING` to another explicitly provisioned tooling directory when needed. `CHROMIUM_PATH` can select an installed browser, and `COVIE_BROWSER_OUTPUT` selects an evidence directory. No packages are installed by the harness itself.

Use `COVIE_BROWSER_BUILD_ONLY=1` to validate the real component/CSS bundle without launching Chromium. Build-only success does not establish visual results. No installation or dependency changes are needed. Coordinate browser execution with other resource-intensive verification.

The matrix covers owner Settings, Team, Clients & projects and Work types, staff and assigned-manager calendars, staff work-type editing, and an empty hourly calendar at 1440×900, 390×844 and 320×568 (24 cases). It checks exact increment choices, invitation affordances with no password fields, fixed project client, week/day view and totals, invalid duration rejection, draft cancellation, Escape, dialog viewport fit, horizontal document overflow and stale-calendar data removal. The work-type journeys verify create, rename, archive, restore, staff selection, historical labels, and retention of an archived choice. The empty-grid journey checks 24-hour rows, independent scrolling, keyboard slot activation, prefilled date/time and increment, cancellation and focus restoration. Other work entry drafts are not saved. The component tests additionally cover daylight-saving gaps, repeated hours and midnight rollover.

PNG screenshots and incrementally saved results.json are written to the output directory. A launch failure is recorded as a blocker with zero browser cases, never a pass. Review the screenshots alongside the assertions before calling visual QA complete.

## 8 October 2026 execution status

- Passed: current real-component and CSS bundle generation, runner syntax check and scoped ESLint.
- Blocked: Chromium exited before opening a page with `process_singleton_posix.cc:297 socket() failed: Operation not permitted`; the default crash-report configuration location was also read-only.
- The run recorded zero of 15 browser cases, no screenshots and no unmocked API calls in its `results.json`. These are not visual passes. No browser security settings were changed to bypass the restriction.

## Existing cloud-browser review

Use `COVIE_BROWSER_SERVE_ONLY=1` to build and serve the same fixture without importing or launching Chromium. The server binds `127.0.0.1:40215` by default; override `COVIE_BROWSER_PORT` when needed. Example:

```sh
COVIE_BROWSER_SERVE_ONLY=1 node tests/browser/timesheets/run.mjs
```

Open `http://127.0.0.1:40215/?fixture=staff-calendar`. Variants are owner-settings, owner-team, owner-clients, owner-work-types, staff-calendar, staff-work-types, staff-hour-grid and manager-calendar. `/frame?fixture=owner-team&width=390&height=844` provides an exact iframe viewport. Add `stale=1` to the current document URL before refreshing Timesheets to test a 409 selected-calendar response. The server fabricates only scoped GET /api/timesheets reads, including known-entry change history, and rejects every mutation and unexpected request. `serve-transport.json` records all API traffic with its allowed/denied status. A serve-only build is not a browser pass; record manual checks and screenshots separately.

The supported cloud-browser retry also stopped before rendering: it could not open `http://127.0.0.1:40215/?fixture=staff-calendar` and reported `net::ERR_BLOCKED_BY_CLIENT`. No network or security settings were changed and no alternate route was used after that denial. The serve-only process was stopped. Hosted/browser-capable execution remains required for screenshots and the current 24-case visual matrix.

## 9 October 2026 work types and hourly grid candidate

- Passed locally: 40 component tests, typecheck, scoped ESLint, runner syntax check, and the real component/CSS browser bundle.
- Browser assertions and screenshots for the expanded 24-case matrix are not yet executed in this environment. Build-only success is not a visual pass; the browser-capable CI job must execute the matrix.
