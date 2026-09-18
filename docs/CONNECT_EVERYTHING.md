# Phase 8 — Connect Everything

Phase 8 makes related Covie records feel like parts of one real-life situation instead of isolated database rows.

The guiding example is a school camp:

- Event: camp dates
- Expense: camp fee
- Responsibility: return permission form
- Child: the child attending
- Document: camp information PDF

## Product boundary

Covie now supports optional relationships between:

- Events
- Expenses
- Responsibilities
- Children
- Documents

The UI does **not** force users through a multi-step wizard.

Links are added from a small **Related / Link existing** control on an already agreed record.

This is deliberately simpler than making every creation form responsible for creating several other records at once.

## Native relationships stay authoritative

Several relationships already existed before Phase 8:

- Expense → Child
- Responsibility → Child / Children
- Responsibility → Event
- Responsibility → Expense
- Document → its primary owning item

These relationships automatically appear in Related Items.

Users do not need to recreate them.

Native relationships cannot be removed from the generic Related Items panel because their source field remains authoritative.

For example:

- change an Expense’s child through the Expense itself
- change a Responsibility’s linked Event through the Responsibility workflow
- remove a document from its original record through Documents

## Explicit entity links

New optional cross-feature links are stored in:

- `entity_links`

Linkable record types:

- event
- expense
- responsibility
- child

The relationship is symmetric.

Event → Expense and Expense → Event are the same relationship.

The database enforces one canonical representation so reversed duplicates cannot exist.

## Documents

Documents continue using the Phase 7:

- `attachments`
- `attachment_links`

model.

Phase 8 does not create another document relationship table.

An existing Ready supporting document can now be linked to another Event, Expense, Responsibility or Child.

The original/primary document relationship remains protected.

A secondary document link can be removed without deleting the file from its original owner.

Profile photos are excluded from generic document candidates.

## Related Items UI

A reusable `LinkedItemsPanel` is available on:

- agreed Expense cards
- agreed Responsibility cards
- agreed Event cards in Day Details
- Child profiles

It displays:

- Events
- Expenses
- Responsibilities
- Children
- Documents

Editors can choose **Link existing**.

Viewers can see/open related items but cannot create or remove relationships.

## Candidate loading

The picker is only populated for owner/editor memberships.

It uses a bounded query per feature type rather than performing one database query for every candidate.

Current candidate limits:

- Events: 150
- Expenses: 150
- Responsibilities: 150
- Children: 50
- Documents: 150

These are presentation limits, not data deletion limits.

## Idempotency

Creating an existing relationship again is a no-op.

Removing a relationship that is already gone is also a no-op.

This avoids duplicate history entries if the browser retries a request after a network interruption.

## Deletion cleanup

`0011_entity_links.sql` installs cleanup triggers on:

- events
- expenses
- responsibilities
- children

Deleting one of these records automatically removes its explicit `entity_links`.

This avoids stale polymorphic relationship rows.

## Permissions

### Owner / Editor

Can:

- see related items
- browse candidates
- create explicit links
- add an existing supporting document to another item
- remove explicit links
- remove secondary document links

### Viewer

Can:

- see related items
- navigate to related records
- open private related documents through the existing signed-download path

Cannot:

- receive the candidate catalogue
- create links
- remove links

Server-side permissions remain authoritative.

## Approval behavior

Linking is an operational relationship action.

It does **not** create an approval proposal.

Only already agreed Events, Expenses and Responsibilities are shown with Related Items controls.

A Waiting proposal does not become linkable merely because it exists.

The agreed record remains the relationship target.

## Calendar behavior

### Month view

Phase 8 adds no new month-cell indicator.

Parenting colours, handovers, events, responsibilities and pending states already consume the limited calendar-cell space.

### Day Details

Agreed Event cards now expose Related Items.

This is where an Event such as "School Camp" can reveal its related Expense, Responsibility, Child and documents.

### Expenses / Responsibilities

Their dated workflows keep their existing calendar behavior.

The Related control is available from the full record card.

## Home behavior

Phase 8 adds no new Needs Attention item.

A relationship itself does not require action.

Home continues to surface the actionable underlying record:

- expense due
- responsibility overdue
- approval waiting
- event coming up

## Child profiles

Child profiles now get a Related Items section.

Existing child-linked Expenses and Responsibilities appear automatically as native relationships.

Explicit Event links finally provide the previously missing Event → Child connection without guessing from event names.

Documents can also be linked to the child from another record where appropriate.

## Audit behavior

Explicit relationship changes use:

- `link.create`
- `link.delete`

The activity surface translates these to friendly wording:

- linked related Covie items
- unlinked related Covie items

Duplicate/no-op requests do not intentionally create extra relationship history.

## Google Calendar

Cross-feature relationships do not sync to Google Calendar.

They do not:

- change Event text
- publish Expense information into Google
- publish document URLs
- create Google sync jobs

Only the existing agreed calendar/event information participates in Google sync.

## Migration

Phase 8 introduces:

- `drizzle/0011_entity_links.sql`
- `linked_entity_type`
- `entity_links`
- canonical link constraints
- automatic explicit-link cleanup triggers

This migration must be applied after `0010_attachments.sql`.

## Deployment notes

The accumulated build now requires migrations:

- `0005` through `0011`

in order.

Phase 7 additionally requires a Vercel **Private Blob** store.

Do not publish the accumulated feature code to production against an older schema.

The safe release order is:

1. verify production database backup / branch state
2. review migrations `0005`–`0011`
3. apply migrations in order
4. confirm private Blob store is connected
5. merge/promote the final code
6. perform one production Vercel deployment
7. run focused production verification

## Deployment verification

After release, verify:

1. Event can link to Expense.
2. Expense sees the same Event relationship.
3. Event can link to Responsibility.
4. Responsibility sees the same Event relationship.
5. Expense can link to Responsibility.
6. Child can link to Event.
7. Existing Expense → Child appears automatically.
8. Existing Responsibility → Child appears automatically.
9. Existing Responsibility → Expense appears automatically.
10. Existing Responsibility → Event appears automatically.
11. Existing primary documents appear as Related documents.
12. A document can be secondarily linked to another record.
13. Removing a secondary document link does not delete the original file.
14. Primary document link cannot be removed from the generic relationship panel.
15. Viewer can see relationships but cannot edit them.
16. Viewer does not receive link candidates.
17. Re-linking the same pair does not duplicate it.
18. Unlinking twice remains harmless.
19. Deleting an entity removes its explicit entity links.
20. Event Related Items render in Day Details.
21. Expense Related Items render.
22. Responsibility Related Items render.
23. Child profile Related Items render.
24. Home remains free of relationship-only attention cards.
25. Month calendar gains no extra relationship marker.
26. Link actions create no approval proposals.
27. Link actions create no Google Calendar jobs.


## Release checkpoint

Production release prepared on 18 September 2026 after:

- Phase 8 CI passed on the feature branch
- migrations 0005 through 0011 were validated on a temporary Neon branch
- the same migrations were applied atomically to production Neon
- a pre-release Neon backup branch was created
