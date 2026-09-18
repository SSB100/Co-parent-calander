# Home / Needs Attention

> **Current release status — 18 September 2026:** This feature is live in Covie Production and its required database migration(s) are already applied through schema version `0011`. Older “do not apply” or “not yet deployed” wording below is historical phase context.

Phase 5 adds Covie Home as the daily overview for the selected family calendar.

Home is intentionally a derived view. It does not add another storage layer or duplicate the feature records already owned by Calendar, Expenses, Responsibilities and the approval engine.

## Product role

Home answers three questions:

1. What needs my attention?
2. What is happening today?
3. What is coming up next?

It is not an analytics dashboard, activity feed or project-management page.

There are no graphs or scores.

## Needs Attention

Needs Attention only shows items that are useful to act on now.

### Approvals

Only Waiting proposals where the current membership is the designated approver appear here.

The Home card reuses the existing ProposalActions control so the parent can:

- Accept
- Decline
- add an optional decline reason

Outgoing proposals waiting on the other parent do not inflate Needs Attention because the current user cannot act on them.

### Expenses

An expense appears in Needs Attention when:

- settlement status is Outstanding
- it has a reimbursement due date
- that due date is overdue, today, or within the next three days

Home shows whether:

- you owe the reimbursement
- reimbursement is owed to you
- the reimbursement is shared/context-only for view-only access

The detailed expense remains managed in Expenses.

### Responsibilities

A responsibility appears in Needs Attention when it is:

- overdue
- due today
- not completed

Future Due soon responsibilities remain visible in Responsibilities and can become the next responsibility in Coming up, rather than making Home feel constantly urgent.

## All caught up

When Needs Attention contains no approvals, urgent expenses or due/overdue responsibilities, Home shows:

> You're all caught up.

The supporting copy is deliberately calm and avoids gamification.

## Today

Today summarizes:

- parenting state
- today's handover
- today's events
- today's responsibilities

Parenting state uses the effective schedule, including recurring parenting rules.

The wording remains parent-centred, for example:

- Full day You
- Full day Jess
- You → Jess
- Jess → You
- Mixed across children

It does not expose internal morning/afternoon storage language.

Today cards link back to the detailed Calendar or Responsibilities workflow instead of duplicating edit controls on Home.

## Coming up

Coming up shows one next item for each useful category:

- next handover
- next event
- next expense
- next responsibility

To avoid duplicating urgent expense cards, Next expense starts after the three-day Needs Attention window.

## Entry point

Selecting, creating or joining a family calendar now lands on `/home`.

The calendar selector uses the Covie name and “Open Covie”.

Calendar, Expenses and Responsibilities each expose a Home link.

## Permissions

Home respects the existing selected-calendar membership.

- Owner/editor: can act on incoming approvals through the shared proposal actions.
- Viewer: sees the shared Home picture but cannot edit feature records.

Feature-specific mutation permissions remain enforced by their existing APIs.

## Data ownership

Home reads from:

- parenting assignments and recurring parenting rules
- shared events
- approval proposals
- expenses and expense shares
- responsibilities

Home does not write a Home-specific database record.

## Google Calendar

Home creates no Google Calendar sync jobs.

It reads agreed calendar/event state that may already participate in Google sync, but the Home feature itself has no Google mapping, queue or outbox dependency.

## Database migration

Phase 5 adds no migration.

The latest unapplied migration remains:

- `drizzle/0008_responsibilities.sql`

Do not apply migrations until the accumulated staged build is explicitly approved for deployment.

## Deployment verification later

After all stages are complete and deployment is approved, verify:

1. Creating a calendar lands on Home.
2. Joining a calendar lands on Home.
3. Opening an existing calendar lands on Home.
4. Home loads the correct selected calendar.
5. Incoming Waiting approvals appear and can be accepted/declined.
6. Outgoing Waiting approvals do not appear as actionable items.
7. Overdue expenses appear.
8. Expenses due today appear.
9. Expenses due within three days appear.
10. Later expenses appear in Coming up rather than Needs Attention.
11. Overdue responsibilities appear.
12. Responsibilities due today appear.
13. Completed responsibilities do not appear in Needs Attention.
14. Today parenting reflects effective recurring/manual schedule state.
15. Today handover, events and responsibilities are accurate.
16. Coming up shows the next handover, event, expense and responsibility.
17. “You're all caught up.” appears when there is nothing actionable.
18. Viewer Home remains read-only.
19. Home links correctly to Calendar, Expenses and Responsibilities.
20. Home creates no Google Calendar sync jobs.
