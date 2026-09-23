# Staff Rosters Stage 7 — Timesheets & corrections qualification

Stage 7 qualifies the attendance-history experience after Stage 6 clocking. It keeps Timesheets as a simple operational record rather than expanding Covie into payroll or HR software.

## Staff Timesheets

Staff Timesheets remain personal and calendar-scoped.

Staff can see only:

- their own published scheduled work
- their own clock sessions
- their own correction requests and statuses
- rostered and completed worked-time summaries
- factual exception/status information

Published roster snapshots remain the schedule comparison source. Manager draft shifts are not used by the Staff Timesheet path.

An active current session is labelled **In progress** and is not included in completed Worked duration. A historical open session is labelled **Missing clock-out**. Staff clock-out remains owned by the Stage 6 My roster workspace.

## Calendar timezone

Timesheet display, week selection and correction inputs use the roster calendar timezone.

The datetime-local controls no longer convert through the browser/device timezone. Local roster-calendar values are converted to instants explicitly before submission, and invalid local wall-clock times are rejected.

## Staff correction requests

Correction creation remains bound to:

authenticated account → selected calendar membership → linked Staff profile → own clock session.

The browser cannot nominate a Staff profile or calendar.

A request requires:

- a reason
- at least one actual time change
- a valid effective finish after effective start
- no existing pending correction for the same attendance entry

Request creation takes a transaction-scoped advisory lock on the clock-session ID. The pending check and insert occur while that lock is held, so repeated submissions, multiple tabs and concurrent requests cannot manufacture simultaneous pending requests without adding a schema migration.

The request audit records original recorded time and the requested values.

## Manager review

Manager/Owner review still requires the existing `reviewTimesheets` capability.

Review now uses the same per-clock-session transaction lock and a conditional pending → reviewed transition. Attendance application and audit rows are gated by that winning transition.

This means:

- exactly one concurrent review can win
- stale/repeated review returns a conflict rather than false success
- an approval re-validates effective time ordering against the current attendance row
- a decline never changes attendance
- approval changes only the intended clock-session time/correction metadata

## Direct Manager correction

Direct correction remains Manager/Owner-only and calendar-bounded.

It updates the existing attendance row in place and preserves roster snapshot/unrostered history. Relevant pending Staff correction requests are cancelled in the same locked operation and receive a separate supersession audit record, preventing stale pending requests from later rewriting the corrected attendance entry.

## UI

Manager pending-review cards show:

- Staff member
- relevant date
- original recorded time
- requested time change
- reason
- status
- explicit Approve / Decline controls

Staff correction history shows original/requested values and pending/reviewed status.

Meaningful mutations re-read authoritative Timesheet state before the UI reports settled state.

## Database

Stage 7 introduces no schema change and no migration.

Production must remain on migration `0030`.

## Qualification coverage

`tests/staff-rosters-stage-7.test.ts` covers:

- Staff viewer / Manager editor capability preservation
- calendar/member bounded Staff Timesheet filtering
- published roster comparison
- roster-calendar datetime conversion
- calendar-local week boundaries
- current active versus historical open-session presentation
- browser identity stripping
- no-op and invalid correction rejection boundaries
- duplicate-pending serialization
- atomic single-winner Manager review architecture
- calendar-bounded direct correction
- pending-request supersession and audit behavior
- same-origin mutation protection
- absence of mock Timesheet data

All Stage 1–6 tests remain in the normal `npm test` command.

## Product boundary

Stage 7 does not add wages, payroll, overtime entitlement, break deductions, tax, holiday pay, leave accrual, performance management or disciplinary meaning.
