# Responsibilities

> **Current release status — 18 September 2026:** This feature is live in Covie Production and its required migration(s) are already applied through production schema version `0011`. Any older “do not apply”, “GitHub-only”, or “not yet deployed” wording below is retained only as historical phase context and is not the current operating state.

Phase 4 adds lightweight shared tasks to Covie.

The goal is to make practical co-parenting work visible without turning the app into a project-management system.

## Responsibility model

Each responsibility has one responsible parent.

If both parents need separate actions, create two responsibilities.

Examples:

- Book dentist
- Buy football boots
- Return school form
- Register for football
- Bring uniform
- Pick up prescription

## Fields

Each agreed responsibility stores:

- title
- one responsible parent
- one or more optional children
- due date
- optional due time
- category
- optional notes
- recurrence
- optional recurrence end date
- optional linked calendar event
- optional linked expense
- completion date and actor
- recurrence series metadata

The UI includes the Phase 4 quick templates as form prefills only. They do not create separate workflows.

## Categories

- School
- Medical
- Sport
- Activity
- Transport
- Shopping
- Forms & Permissions
- Appointment
- Home / Admin
- Other

## Agreement boundary

A responsibility is shared agreed information when it puts work on the other parent.

When both parents have linked edit-capable accounts, approval is required if:

- a new responsibility is assigned to the other parent
- an existing responsibility owned by the other parent is edited
- an existing responsibility owned by the other parent is removed
- a responsibility is reassigned from the current parent to the other parent

A parent creating or editing work they themselves own does not require the other parent to approve it.

If there is no other linked edit-capable parent, the responsibility remains immediately usable so solo-parent Covie use is not blocked.

Viewer memberships remain read-only.

Responsibility proposals use the reusable approval engine:

- entity type: `responsibility`
- entity id: responsibility UUID
- current agreed state remains active while Waiting
- accept applies the responsibility mutation and proposal transition transactionally
- decline or withdraw leaves the agreed responsibility unchanged

## Completion

Completion is a personal action.

Only the responsible parent can mark an agreed task complete or reopen it.

Completion never creates an approval proposal.

Completed responsibilities are retained as history and are not editable or deletable through the normal task workflow.

## Recurrence

Supported recurrence:

- Weekly
- Fortnightly
- Monthly
- Yearly

Recurring responsibilities intentionally generate only one future occurrence at a time.

When the responsible parent completes the current occurrence:

1. Covie records completion.
2. If recurrence continues, Covie creates the next occurrence.
3. Child, parent, category, note and linked-item details carry forward.
4. No new approval is required for the next occurrence because the recurring assignment was already agreed.

This avoids creating a large set of future task rows.

A completed recurring item cannot be reopened after its next occurrence has already been generated, preventing duplicate active occurrences.

## Status

Status is computed from the due date:

- Upcoming
- Due soon: within the next three days
- Due today
- Overdue
- Completed

The optional due time gives practical detail but does not turn a task red halfway through its due day. A task remains Due today until the date has passed.

## Calendar connection

The month view receives lightweight responsibility markers for due dates.

Parenting colours remain the strongest visual element.

The secondary indicator cluster limits visible markers rather than stacking an unlimited number of icons.

Day Details shows:

- responsibilities due that day
- completion state
- one-tap completion for the responsible parent
- pending responsibility-change count
- a direct link to the date-filtered Responsibilities screen

## Links

A responsibility may optionally link to:

- a calendar event
- an expense
- one or more children

These are simple relationships. Phase 8 will later make cross-feature linking more complete.

## Google Calendar

Responsibilities do not sync to Google Calendar in Phase 4.

No responsibility create/edit/delete/completion or proposal code imports the Google Calendar queue or mapping layer.

## Home and child profiles

Phase 4 prepares the data needed for later integration but does not prematurely build the Phase 5 Home overview or Phase 6 child profile UI.

Phase 5 can use the responsibility status model for:

- due today
- due soon
- overdue
- next responsibility

Phase 6 can use `responsibility_children` to surface child-specific responsibilities.

## Database migration

Phase 4 introduces, but does not apply:

- `drizzle/0008_responsibilities.sql`
- `responsibility_category`
- `responsibility_recurrence`
- `responsibilities`
- `responsibility_children`

Do not apply this migration until the accumulated staged build is explicitly approved for deployment.

## Deployment verification later

After all stages are complete and deployment is approved, verify:

1. Creating a responsibility for yourself is immediate.
2. Assigning a linked other parent creates a Waiting proposal.
3. Editing the other parent's agreed task creates a Waiting proposal.
4. Removing the other parent's agreed task creates a Waiting proposal.
5. Accept applies create/edit/delete exactly once.
6. Decline and withdraw leave the agreed task unchanged.
7. Viewer access is read-only.
8. Only the responsible parent can complete a task.
9. Completion requires no approval.
10. Upcoming, Due soon, Due today, Overdue and Completed statuses display correctly.
11. Weekly, fortnightly, monthly and yearly recurrence create only the next occurrence after completion.
12. Recurrence end date stops future generation.
13. Child links carry to generated recurring occurrences.
14. Event and expense links validate against the same calendar.
15. Day Details lists responsibilities due that day.
16. Calendar markers do not obscure parenting colours.
17. Pending responsibility proposals are not shown as agreed tasks.
18. Responsibility activity never creates Google Calendar sync jobs.
