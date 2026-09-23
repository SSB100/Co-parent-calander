# Staff Rosters Stage 3 — Roster Intelligence, Month & Copy Week

Stage 3 strengthens the Manager's ability to understand the roster without creating a second scheduling model.

## Baseline

- Production/main baseline before the staged programme: `bf18c6da1ae0d360add9e45eef85cfc0caeb38d5`
- Stage 1 head: `542650a3d058689d0bf0dad440f9d0b06bd46cc5`
- Stage 2 head: `7333284b7964cee46ec59c8cb6e8bc97b03392b3`
- Production migration: `0030`
- Migration in Stage 3: NONE

## Purpose

Make the roster easier to understand and reuse while preserving Week as the editing workspace.

## Availability on the calendar

The roster week payload now includes existing `staff_roster_availability` rows with status `unavailable` for the requested week.

No second availability model is created.

Managers see team unavailability. Staff remain bounded to their own availability data by the existing Staff capability model.

Week renders unavailable periods as Sunshine calendar overlays behind shifts. Whole-day unavailability spans the visible operating window; timed unavailability uses its actual start and finish.

Mobile renders the same unavailability as touch-friendly day cards.

## Month overview

Month remains an overview rather than an hourly editor.

Each populated day now shows:

- unique Staff count
- total rostered hours
- approved/pending leave summary
- unavailability summary
- compact shifts
- an accurate `+N more` link when the summary rows consume visible shift slots

The old layout could silently hide one shift when a leave row consumed one of the three display rows. Stage 3 explicitly calculates visible and hidden shift counts so every hidden shift is represented by `+N more`.

Clicking a Month day continues to open its related Week.

## Filters

Staff / role / location filtering now scopes associated availability and leave signals to the same visible Staff population instead of leaving unrelated warnings on screen.

Shift role/location filtering remains based on each shift's assigned role/location. Staff-rail filtering remains based on Staff role membership and default location.

## Weekly hours

The existing Staff rail continues to show weekly rostered hours.

Month day summaries reuse the same shift-duration rules and show total rostered hours plus unique Staff coverage.

No wage or labour-cost model is introduced.

## Copy previous week

Copy previous week continues to create draft shifts only.

The result message now identifies the exact source week and continues to explain:

- copied shifts
- overlap skips
- unavailability skips
- leave skips
- inactive Staff skips
- stale role/location references removed from copied shifts

Copy still runs normal shift conflict checks and never publishes automatically.

## Authority

All availability, leave and copy-week data is calendar-scoped on the server.

This stage does not change shift-write authority:

- approved leave blocks
- pending leave warns
- normal unavailability warns and requires explicit Manager override
- same-person overlap remains invalid
- different Staff may overlap
- Manager capability is server-derived

## Qualification coverage

Stage 3 adds executable coverage for:

- unique Staff/day coverage counts
- total day roster hours
- Month visible/hidden shift row calculations
- the leave-row hidden-shift regression
- availability query calendar/date scoping
- Staff-vs-Manager availability visibility
- Week/Month/mobile availability integration
- copy-week source-week and skip feedback

## Out of scope

Stage 3 does not add:

- recurring shifts
- new publication semantics
- email notifications
- Staff account changes
- clock/timesheet changes
- leave workflow changes
- breaks
- payroll or labour costs
