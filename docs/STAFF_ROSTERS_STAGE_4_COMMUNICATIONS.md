# Staff Rosters Stage 4 — Publish, Changes Pending & Staff Communications

Stage 4 completes the deliberate Manager-to-Staff publication loop without introducing a second notification system or any new database schema.

## Baseline

- Production/main before Stage 4: `64af3275559b716d570871219ab74af58177da08`
- Production Neon migration: `0030`
- Migration in Stage 4: NONE

## Publication model

Managers continue editing the live `staff_roster_shifts` rows.

Staff continue reading immutable `staff_roster_published_shifts` snapshots.

The week state remains:

- `draft` — no published snapshot exists
- `published` — live shifts match the latest snapshot
- `changes_pending` — live shifts differ from the latest snapshot

Normal shift create/edit/delete/move/resize actions do not notify Staff.

## Initial Publish

When a Manager presses **Publish roster**:

1. the publication is created or updated transactionally
2. the current live week is snapshotted into `staff_roster_published_shifts`
3. one Staff roster update record is created per Staff member who has a published shift
4. audit history records the publish
5. only after the database transaction succeeds, best-effort Staff email delivery is attempted

The roster remains successfully published even if email recipient lookup or the email provider fails.

## Changes pending

After initial publication, Manager edits remain live Manager draft changes.

Staff keep seeing the previous published snapshot until the Manager deliberately presses **Send updates**.

The same pure roster-diff implementation drives both:

- the Manager's affected-Staff / changed-shift status
- the Staff email recipient set

This prevents notification targeting from drifting away from the visible Changes pending state.

The diff includes:

- added shifts
- removed shifts
- date/time changes
- role/location changes
- note changes
- availability-override changes
- Staff reassignment

When a published shift is reassigned from Staff A to Staff B, both Staff A and Staff B are affected.

## Send updates

When a Manager presses **Send updates**:

1. the current roster is compared with the published snapshot
2. change records are created for affected Staff
3. the published snapshot is replaced with the current live week
4. the publication revision increments
5. audit history records Send updates
6. after commit, only affected linked Staff are considered for email delivery

Multiple Manager edits therefore produce one deliberate communication event rather than notification spam.

## Email privacy and delivery

Stage 4 uses the same Covie transactional email configuration already used by approval notifications:

- `RESEND_API_KEY`
- `EMAIL_FROM`
- `NEXT_PUBLIC_APP_URL`

Staff roster email deliberately contains no:

- shift start/end details
- role
- location
- notes
- leave/availability details

It only states that the roster for a named week is ready or has changed, then sends the Staff member back into authenticated Covie.

Recipients are resolved only from:

- the selected Staff Rosters calendar
- active `staff_roster_members`
- an existing linked calendar membership
- the authenticated account email behind that membership
- the affected Staff member IDs calculated by the roster diff

Email addresses are never returned to the Manager browser.

## Manager feedback

After Publish or Send updates, the Manager receives a Covie notice showing:

- affected Staff count
- number of email notifications sent
- affected Staff profiles that are not yet linked to a Covie account
- email recipient lookup failure
- email provider delivery failure
- missing transactional-email configuration

Communication warnings use Sunshine. Successful publication/delivery uses Teal.

Email failure does not change the publication state; the roster remains available inside Covie.

## Staff Updates

The existing Staff Updates workspace remains the detailed authenticated source for publication/change history.

Managers may see team update records.

Staff remain server-scoped to only their own update records.

## Security invariants

- only Owner/Manager roster capability can publish
- publication mutation remains same-origin protected
- Staff email lookup stays calendar-scoped
- email delivery occurs only after successful publication commit
- intermediate Manager edits never trigger email
- affected Staff selection is server-derived
- no recipient email address is exposed to the client
- no co-parenting participant or approval authority is reused for Staff Rosters

## Qualification coverage

Stage 4 adds executable coverage for:

- unchanged roster diff
- shift add/change/remove
- Staff reassignment affecting both people
- successful Manager delivery feedback
- unlinked Staff feedback
- provider failure feedback
- unconfigured email feedback
- privacy-minimal email copy
- post-commit email ordering
- recipient calendar/membership scoping

## Out of scope

Stage 4 does not add:

- push notifications
- Staff onboarding changes
- additional invitation behavior
- clock/timesheet changes
- leave workflow changes
- breaks
- payroll or labour costs
