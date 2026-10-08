# Timesheets synthetic browser checks

Bundles the real TemplateShell, Timesheets components, CSS modules and app globals. Next navigation, server actions and auth boundaries are replaced. API reads use synthetic owner, assigned-manager and staff DTOs. Every external URL, unexpected API, mutation and unmocked API fails the run. No account is signed in and no live data is read or changed.

Run from the repository root with Playwright 1.56.1 and esbuild 0.25.12 available (the CI browser job installs these into its disposable workspace):

```sh
node tests/browser/timesheets/run.mjs
```

Set `COVIE_BROWSER_TOOLING` and `COVIE_PLAYWRIGHT_TOOLING` to another explicitly provisioned tooling directory when needed. `CHROMIUM_PATH` can select an installed browser, and `COVIE_BROWSER_OUTPUT` selects an evidence directory. No packages are installed by the harness itself.

Use `COVIE_BROWSER_BUILD_ONLY=1` to validate the real component/CSS bundle without launching Chromium. Build-only success does not establish visual results. No installation or dependency changes are needed. Coordinate browser execution with other resource-intensive verification.

The matrix covers owner Settings, Team and Clients & projects plus staff and assigned-manager calendars at 1440×900, 390×844 and 320×568 (15 cases). It checks exact increment choices, invitation affordances with no password fields, fixed project client, week/day view and totals, invalid duration rejection, draft cancellation, Escape, dialog viewport fit, horizontal document overflow and stale-calendar data removal. Work entry drafts are not saved; mocked mutation behavior is covered in the component tests.

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

Open `http://127.0.0.1:40215/?fixture=staff-calendar`. Variants are owner-settings, owner-team, owner-clients, staff-calendar and manager-calendar. `/frame?fixture=owner-team&width=390&height=844` provides an exact iframe viewport. Add `stale=1` to the current document URL before refreshing Timesheets to test a 409 selected-calendar response. The server fabricates only scoped GET /api/timesheets reads, including known-entry change history, and rejects every mutation and unexpected request. `serve-transport.json` records all API traffic with its allowed/denied status. A serve-only build is not a browser pass; record manual checks and screenshots separately.

The supported cloud-browser retry also stopped before rendering: it could not open `http://127.0.0.1:40215/?fixture=staff-calendar` and reported `net::ERR_BLOCKED_BY_CLIENT`. No network or security settings were changed and no alternate route was used after that denial. The serve-only process was stopped. Hosted/browser-capable execution remains required for screenshots and the 15-case visual matrix.
