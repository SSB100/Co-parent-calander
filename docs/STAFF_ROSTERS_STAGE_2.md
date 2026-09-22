# Staff Rosters Stage 2A — setup, roster builder and calendar lifecycle

This stage responds to the first real Staff Rosters testing feedback: team, roles, locations and availability existed, but there was no clear way to turn that setup into an actual working roster.

## Sources of truth

- Covie Brand Bible v2.0 controls shared Covie UI, navigation, forms, dialogs, destructive actions, spacing, responsive behaviour and semantic colour use.
- Calendar Template Specifications v0.1 controls Staff Rosters domain behaviour: staff rows, shifts, roles, locations, availability and overlap/unavailability rules.

## Covie Core calendar lifecycle

All calendar types now share the same lifecycle controls from the calendar switcher.

Owners can:

- archive the selected calendar
- restore an archived calendar
- permanently delete a calendar after typing its exact name

Archived calendars are excluded from normal sessions and normal switching. If the user has no active calendars, archived calendars remain recoverable from the onboarding screen.

Permanent deletion remains owner-only and uses the calendar's existing cascade rules. It is deliberately separate from reversible archive.

## Staff Rosters setup

New Staff Rosters calendars route to:

`/calendar-types/staff-rosters/setup`

The setup screen is a short production checklist based on real saved data:

1. Roles & locations
2. Team
3. Availability (optional)

Existing calendars are not reset. Counts are loaded from the real Staff Rosters tables so work already entered by the owner is recognised.

Roles, locations and availability remain optional. Finishing setup records `setup_completed_at` and opens the roster.

Existing Staff Rosters calendars that have not completed setup show a branded Finish setup notice on the roster rather than being forcibly redirected.

## Weekly roster builder

The Staff Rosters Calendar page is now a working weekly roster.

Managers/owners receive:

- previous week / Today / next week controls
- one row per active team member on desktop
- seven day columns
- click-to-create shift controls
- Create shift primary action
- create, edit and delete shift dialogs
- optional role, location and note
- member default role/location prefill
- availability conflict warning with explicit manager override
- hard blocking of overlapping shifts

Staff accounts receive only their own member/shift data from the server-side roster query.

Mobile uses day cards and upcoming shifts rather than shrinking the desktop roster grid.

## Shift safety

Shift writes are bounded to the selected Staff Rosters calendar and use the Staff capability policy.

The server checks:

- active team member belongs to the selected roster
- chosen role/location belongs to the selected roster
- end time is after start time
- the same person has no overlapping shift
- confirmed unavailable time is surfaced before saving
- only a manager/owner may explicitly override unavailability

All create, update and delete actions write to the existing audit log.

## Migration 0024

Migration `0024_calendar_lifecycle_staff_shifts.sql` adds:

- `calendars.archived_at`
- `staff_roster_settings`
- `staff_roster_shifts`

No co-parenting feature tables are altered.

## Deferred Stage 2B / Stage 3 work

This slice deliberately does not invent unfinished interactions. The next Staff Rosters passes still need:

- recurring shifts / series editing
- draft vs published roster state
- publish and republish workflow
- copy previous roster
- schedule-change acknowledgement
- manager team/location scoping
- account invitations/linking for Staff and Managers
- email/push roster notifications
- richer activity presentation

The current roster builder is intentionally useful with one-off shifts before those layers are added.
