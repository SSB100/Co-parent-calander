# Staff Rosters Stage 2 — Manager Week Builder Hardening

This stage hardens the existing calendar-first Manager Week roster without changing the Staff Rosters schema or publication model.

## Baseline

- Parent Stage 1 branch head: `542650a3d058689d0bf0dad440f9d0b06bd46cc5`
- Production/main baseline: `bf18c6da1ae0d360add9e45eef85cfc0caeb38d5`
- Production migration: `0030`
- Migration in this stage: NONE

Stage 2 is intentionally stacked on the Stage 1 re-baseline branch because the user explicitly requested moving on while the hosted GitHub Actions runner remains unable to start its verify steps.

## Purpose

Make the Manager Week view the reliable primary roster-building workspace:

- drag a Staff member onto a day/time
- create a sensible shift immediately
- move existing shifts between days/times
- resize start or finish on 15-minute increments
- make the intended drop range visible before release
- preserve exact dialog editing as the fallback
- preserve server authority for overlap, leave and availability conflicts

## Direct-drop duration

The old direct-drop interaction always created a 60-minute shift.

Stage 2 changes this to:

1. use the Staff member's most recent live shift duration at or before the viewed week end, when one exists
2. otherwise use an eight-hour default
3. keep the Manager's chosen drop point as the requested start
4. clamp safely to the currently visible operational timeline
5. keep exact editing available through the existing shift dialog

This is a convenience hint only. It grants no authority and creates no persistent preference record.

## Interaction math

Shared pure helpers now own:

- 15-minute snapping
- default/recent drop duration
- member-drop ranges
- existing-shift move ranges
- resize ranges
- shift duration calculation

The Week UI uses the same helpers for its visual preview and its final mutation request so the preview and saved result do not drift apart.

## Drop preview

A Manager dragging either a Staff member or an existing shift now sees the intended full time block rather than only a horizontal start-time line.

The preview displays the start and finish time and uses the Staff Rosters Teal treatment.

## Server authority preserved

The client remains non-authoritative.

`createShift` and `updateShift` continue to:

- derive Manager capability server-side
- validate Staff/role/location belong to the selected Staff Rosters calendar
- reject same-person overlaps
- block approved leave
- warn/require explicit override for pending leave and normal unavailability
- use a calendar/member/date PostgreSQL advisory lock
- re-check overlap inside the locked write statement
- write audit history

Different Staff members remain allowed to occupy the same time range.

## Qualification coverage

Stage 2 adds executable interaction tests for:

- eight-hour default drop duration
- recent-duration reuse
- 15-minute snapping
- move-duration preservation
- timeline clamping
- resize snapping
- minimum valid end-of-day shift range
- deterministic duration calculation

The existing Stage 2 source-boundary tests are updated to verify the new interaction helpers and recent-duration server query.

## Out of scope

This stage does not add:

- new tables or migrations
- availability overlays
- richer Month intelligence
- copy-week redesign
- notification delivery
- Staff account changes
- clock/timesheet changes
- leave workflow changes
- breaks

Those remain later stages in the approved roadmap.
