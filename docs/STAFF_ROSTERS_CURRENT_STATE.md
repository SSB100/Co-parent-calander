# Staff Rosters current production state

Verified: 23 September 2026 (NZ time)

This document is the re-baselined source for the Staff Rosters staged programme. It records the live Production state that later Staff stages must preserve.

## Production application

- Repository: `SSB100/Co-parent-calander`
- Production branch: `main`
- Stage 10 starting Production SHA: `376dc73f4fada8e1106861661e5bc8e10d0519fa` (Stage 9, PR #125)
- Vercel project: `co-parent-calander`
- Vercel project ID: `prj_UNfHcQuLfhydY92COjd8OV2ZoGGv`
- Vercel team: `team_vWDwkGoSk1NIOdKApGuukv0C`
- Production region: `syd1`
- Stage 10 starting Production deployment: `dpl_FqEH81TQGSWncCHUyoWcHmHV69mK`
- Production alias: `co-parent-calander.vercel.app`

The Production Vercel deployment is READY and references the same SHA as `main`.

## Production database

- Neon project: `co-parent-calendar`
- Project ID: `delicate-sunset-36051658`
- Production branch: `main`
- Production branch ID: `br-quiet-sea-a7duq4r3`
- Region: `aws-ap-southeast-2`
- Current migration: `0031` (already approved/applied; do not replay)

The live migration ledger records `0000` through `0031`. Stage 10 is migration-free.

At re-baseline, Production contained:

- 3 Staff Rosters calendars
- 10 Staff roster members
- 4 Staff roles
- 4 Staff locations
- 2 live Staff shifts
- 0 availability records
- 0 published roster weeks
- 0 published-shift snapshots
- 0 clock sessions
- 0 break sessions
- 0 leave requests
- 0 Staff invitations

These counts are evidence of the re-baseline only. They are not fixtures and must never be used to overwrite Production.

## Current Staff Rosters domain

Production currently includes:

- Staff Rosters calendar type
- Owner / Manager / Staff roster-access roles
- team members
- multiple eligible job roles per Staff member
- optional default role and location
- work locations
- availability
- one-off live shifts
- same-person overlap checking
- Manager availability override
- approved-leave blocking
- pending-leave warning
- Staff setup state
- configurable operational hours
- Manager Week and Month roster views
- Staff rail and filters
- drag Staff into the Week timeline
- drag existing shifts
- resize shifts on 15-minute increments
- simultaneous different-Staff overlap layout
- weekly rostered-hour totals
- copy previous week
- draft / published / changes-pending publication model
- immutable published-shift snapshots
- explicit Send updates workflow
- Staff update records
- Staff account invitations that link to existing team profiles
- separate Staff My Roster workspace
- clock in / clock out
- own-session Start break / End break, one active break, explicit End break before clock-out
- unrostered clock confirmation
- Staff and Manager timesheets
- deterministic elapsed, break and worked durations; Manager break information is read-only
- Staff correction requests
- Manager correction review/direct correction
- Staff leave requests and Manager review
- archive / restore / permanent calendar deletion

## Authority invariants

Staff Rosters does not use co-parenting participant roles as roster authority.

Calendar permission and Staff roster access role are combined by `staffRosterCapabilities`.

The current invitation model intentionally creates:

- Manager -> calendar `editor` membership
- Staff -> calendar `viewer` membership

A Staff viewer still receives bounded Staff-domain self-service capabilities for their own:

- roster view
- availability
- clocking
- timesheet correction requests
- leave requests

Viewer permission never grants Manager authority. Team management, roster writes, publication, leave review and timesheet review still require a writable membership plus Owner/Manager Staff access.

The browser never grants these capabilities.

## Data invariants

- Existing Staff calendars and identifiers are preserved.
- Staff Rosters extends the existing Staff domain rather than introducing a parallel roster system.
- Different Staff may be rostered for identical time ranges.
- The same Staff member may not have overlapping live shifts.
- Shift writes use server-side conflict checks and transaction/advisory-lock protection.
- Approved leave blocks a conflicting shift.
- Pending leave and ordinary unavailability warn rather than silently changing the roster.
- Staff reads published roster snapshots rather than Manager draft shifts.
- Post-publication Manager edits remain pending until the Manager deliberately sends updates.
- Staff account acceptance links the authenticated membership to the existing Staff member instead of creating a duplicate.
- Attendance and timesheets are roster operations, not payroll.
- Staff domain records remain calendar-scoped and isolated from co-parenting tables.

## Product boundary

Staff Rosters does not include payroll, wages, PAYE, KiwiSaver, holiday-pay calculations, leave accrual balances, employment contracts, recruitment, applicant tracking, performance reviews, disciplinary records, employee HR files, GPS clocking, biometrics or employee surveillance.

## Stage 1 CI re-baseline finding

The GitHub Actions workflow is currently unable to start its `verify` steps.

Evidence:

- the unchanged Production SHA fails before any job steps are reported
- a manual rerun of the same Production workflow also fails before any steps are reported
- Stage 1 documentation-only commits fail in the same 3-4 second pre-step pattern
- GitHub's public status reports Actions operational at the time of verification

This means the current Actions conclusion cannot be treated as an application lint, typecheck, test, audit or build result.

Separately, the legacy Stage 1 Staff test contained a stale assertion that expected Staff self-availability to require editor permission. That contradicted the live invitation model, where Staff intentionally receive viewer membership plus bounded Staff self-service authority. The Stage 1 test has been updated to exercise the real capability matrix directly.

Until hosted Actions jobs can actually start, Stage qualification must report GitHub CI as blocked rather than falsely calling it green.


## Publication email invariant

Roster publication and Send updates commit their database snapshot/update records before email delivery is attempted. Email is best-effort and cannot roll back a successful publication. Intermediate Manager edits stay silent. Only affected linked Staff accounts are eligible for roster email, and shift details remain inside authenticated Covie rather than being copied into email.

## Owner readiness refinement (8 October 2026)

Team is the live setup destination. Its owner summary separates active staff/manager roster profiles from linked accounts, pending invitation acceptance, and profile-only people; the owner is excluded from team totals. Profile creation supports planning shifts without implying Covie access. Expired invitations are not shown as pending, and linked accounts do not imply a roster has been published. Focus/visibility refresh updates the snapshot, late requests are ignored, and denied access clears stale team data. Locations and leave remain optional. No API, schema or invitation behavior changes.
