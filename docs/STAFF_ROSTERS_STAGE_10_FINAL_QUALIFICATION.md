# Stage 10 — Mobile, Accessibility, Security & Production Qualification

Starting Production: `376dc73f4fada8e1106861661e5bc8e10d0519fa`, Vercel `dpl_FqEH81TQGSWncCHUyoWcHmHV69mK`, READY, syd1. Neon Production `br-quiet-sea-a7duq4r3`, migration0031. No migration or new Staff feature.

## Defects fixed

- Shared Covie dialogs without a custom focus owner now focus the dialog (preserving an already focused input), contain Tab/Shift+Tab and restore the opener. Description text is associated with the dialog. Existing custom-ref focus handling remains in place.
- Operational-hours drafts initialize from current settings when opened, avoiding effect-driven resets during editing and the existing lint error.
- Co-parent calendar tile labels below the existing 11px brand minimum now meet that minimum. No custody/event policy changes.
- Restored final-UX and expense-recurrence suites to the default test command. Stale source assertions now follow the existing delegated services, labels/navigation and intentional immediate audited event CRUD/no synthetic Handover tiles. Assertions were strengthened at their current boundaries, not silenced.
- Updated current-state infrastructure/migration/break documentation and marked historical Calendar approval policy as superseded.

## Qualification evidence

The default regression suite includes all Stage1–9 tests, co-parent tests, restored suites and four Stage10 tests. The Stage10 capability matrix exercises all nine Staff access-role/calendar-permission combinations; managerial capabilities require both writable membership and Owner/Manager access. Source gates cover dialog ownership and operational draft initialization. Existing Stage6–9 tests retain own/calendar authority, privacy, same-origin, publication, concurrency and break invariants. No service, API, schema or database transition implementation changed.

Authenticated Production read-only review used the existing Staff Test calendar: connected Owner and one uninvited Staff profile, two draft shifts. Calendar navigation, team/account-link status, Availability/Leave and Manager Timesheets loaded. Add-person and Availability forms were opened/cancelled without saving or sending invitations. No operational records were manufactured.

Isolated actual-component fixture: personal Timesheet correction dialog initial focus, reverse/forward wrap, Escape dismissal and opener return executed successfully. At320/375/390/430/768/1280px it had no horizontal overflow, visible footer and44px footer buttons. At320x640 the form body scrolled while actions remained visible. Actual authenticated roster checked at the same six widths: no document horizontal overflow; visible buttons at least40px high. No physical devices or mobile software keyboard were used. Fixture data is not evidence of authenticated Staff/server transitions.

## Limits and remaining final gate

The available account is Owner, not separate Manager/editor or Staff/viewer sessions. Complete authenticated invitation acceptance, Staff clock/break/correction/leave lifecycle, Manager review/publication and adversarial cross-calendar HTTP journeys are not yet executed end-to-end in Stage10. Prior isolated database Stage8/9 race evidence remains applicable because those implementations and schema are unchanged; it is not a fresh Stage10 database run.

Physical-device keyboard, screen-reader, full contrast/zoom/reduced-motion and instrumented performance audits remain incomplete. No claim of full accessibility conformance, performance target attainment or programme completion is made. Existing automated/source boundaries and fixture checks do not replace these remaining journeys.

Local build compiles and typechecks but page collection requires local Neon authentication configuration. Vercel exact-SHA Production READY is mandatory for release. GitHub Actions must be reported separately if its runner again fails before any step starts.

Release and preservation evidence will be recorded in the Stage10 handoff. Preserve all break rows and the End break path during any rollback. Stage10 is the final roadmap stage; there is no Stage11.

## Pre-release checks

- Default full suite:400/400 passed. Final-UX28/28 also passed after removing one unused test import.
- Typecheck passed; whole lint passed with10 existing unused-symbol warnings (an introduced unused test import was removed).
- High-severity dependency gate passed;5 moderate advisories remain (drizzle-kit/esbuild chain and undici), unchanged dependencies.
- Local build compiled and typechecked; page collection failed because NEON_AUTH_BASE_URL is absent locally.
- Isolated Staff fixture exercised Start break, End break and Clock out with refreshed state. Live Owner shift dialog fit all six requested widths, with footer inside800px viewport.
- Fresh read-only Production snapshot covers19 tables including break sessions, with169 audit rows and0031 ledger. No operational data was created for tests.

