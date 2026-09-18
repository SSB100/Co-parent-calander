# Calendar approvals

> **Current release status — 18 September 2026:** This feature is live in Covie Production and its required migration(s) are already applied through production schema version `0011`. Any older “do not apply”, “GitHub-only”, or “not yet deployed” wording below is retained only as historical phase context and is not the current operating state.

Phase 2 connects the existing shared calendar workflows to the reusable approval engine from Phase 1.

## Product behaviour

When two active co-parents both have edit-capable linked accounts:

- parenting ownership changes create a proposal
- full-day and split-day direction changes create a proposal
- handover time, location and note changes create a proposal
- repeating parenting schedule creation, edits and cancellation create a proposal
- shared event creation, edits and cancellation create a proposal
- the existing agreed record remains active while the proposal is waiting
- the proposal may include an optional reason
- the receiving parent can Accept or Decline, with an optional decline reason
- the proposing parent can Withdraw
- an accepted calendar proposal applies its target mutation and its proposal transition in the same database transaction

The month calendar receives agreed assignments/events and waiting proposals as separate payload fields. Parenting colours always come from the agreed assignment data. Waiting changes add only a small amber marker.

Day Details shows the agreed and proposed versions side by side, plus the proposal reason and the appropriate Accept, Decline or Withdraw controls.

## Solo-parent compatibility

A parent can use the calendar even when the other parent has not created or linked an account.

If there is no other active, linked owner/editor membership, the existing mutation path remains available immediately. Once another edit-capable parent is linked, shared calendar mutations use approval by default.

Viewer memberships never count as an approver.

## Conflict boundary

For parenting ownership, handovers and repeating parenting schedules, the current implementation uses one logical entity identifier for the family parenting schedule. This deliberately allows only one waiting parenting-schedule proposal at a time.

That is conservative, but it prevents two independently proposed schedule mutations from becoming inconsistent while the product is still intentionally simple.

Event proposals use the event ID, so unrelated events may have independent waiting proposals.

## Google Calendar

Waiting, declined and withdrawn proposal JSON is never mapped to Google Calendar.

For linked co-parents, proposal submission does not mutate the agreed assignment/event tables and does not enqueue the proposal as a Google event.

After approval, the feature-specific applicator updates the agreed records and queues Google synchronization from those effective records. The generic proposal engine itself has no Google Calendar dependency.

For a solo-parent calendar, the existing direct mutation and sync path remains unchanged.

## Recurring shared events

Shared events can repeat:

- Weekly
- Fortnightly
- Monthly
- Yearly

A repeat-until date is optional. The first implementation deliberately edits or cancels the whole series only; it does not add per-occurrence exceptions.

One database event row remains the agreed series. Calendar views and Google Calendar expand approved occurrences only for the date range being viewed or synchronized.

Changing or cancelling the series goes through the same shared-event approval process. Pending recurrence changes never appear in Google Calendar.

## Migrations

Phase 2 depends on:

- `drizzle/0005_approval_engine.sql` — proposal lifecycle and history
- `drizzle/0006_recurring_events.sql` — event recurrence and optional repeat-until date

Both migrations are committed to GitHub only and have not been applied to Neon or Production.

## Deployment status

This work is GitHub-only. No Vercel deployment has been triggered and no live Neon migration has been applied.
