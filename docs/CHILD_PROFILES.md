# Child profiles

> **Current release status — 18 September 2026:** This feature is live in Covie Production and its required database migration(s) are already applied through schema version `0011`. Older “do not apply” or “not yet deployed” wording below is historical phase context.

Phase 6 turns each child into a lightweight shared information hub.

The profile is reference information, not a case-management record. The goal is to make useful everyday details easy to find without forcing parents into a complex data-entry system.

## Product boundary

Child profiles contain shared practical reference information:

- identity basics
- school information
- health information
- regular activities
- useful clothing / uniform / preference details

This information generally updates immediately.

It does not use the proposal/approval engine because ordinary reference details would become frustrating if every typo or phone-number change required approval.

Every edit is still recorded in change history.

## Basic

Fields:

- preferred name
- full name
- date of birth
- school
- year / class

The existing `children.display_name` field remains the preferred name so existing calendar functionality stays compatible.

## Photo

The profile currently uses initials as its avatar.

Actual photo upload is deliberately deferred to Phase 7 because that phase introduces the attachment/file infrastructure. Phase 6 does not create a one-off base64 image store or require parents to paste public image URLs.

The later attachment implementation can add a profile-photo relationship without changing the rest of the child profile model.

## School

Optional fields:

- school name
- teacher
- school phone
- school email
- student ID
- before / after-school care
- school notes

## Health

Optional fields:

- GP
- dentist
- allergies
- medications
- important medical notes
- NHI / health identifier

The UI explicitly states that health and identifier fields are optional.

Covie does not require any sensitive health field in order to use a child profile.

## Activities

Activities use a separate lightweight table.

Each activity can contain:

- activity / team
- organisation
- coach / contact
- contact details
- normal location
- schedule information
- notes

Activities update immediately and have change history.

Direct links from activities to Events, Expenses and Responsibilities are intentionally deferred to Phase 8, where cross-feature linking is handled consistently.

## Practical information

Optional:

- clothing size
- shoe size
- uniform size
- useful requirements / preferences

## Existing related Covie data

The child hub already surfaces records that are linked through existing data relationships:

### Responsibilities

Responsibilities connected through `responsibility_children` are shown on the child profile.

The profile highlights open tasks and links back to the dated Responsibilities view.

### Expenses

Expenses with that child as `child_id` are shown as recent expenses.

The profile links back to the dated Expenses view.

Calendar-event-to-child linking does not yet exist, so the profile does not guess which events belong to a child. Phase 8 can add that explicit relationship.

## Change history

Profile updates and activity changes use the existing `audit_log`.

Child-specific actions:

- `child_profile.update`
- `child_activity.create`
- `child_activity.update`
- `child_activity.delete`

For privacy, profile audit entries do **not** duplicate medical, identifier, contact or note values.

A profile update stores only:

- which field names changed
- which profile sections changed

Activity history stores the activity ID/name and changed field names, not the contact/note contents.

The child profile turns those audit entries into simple Recent Changes wording.

## Permissions

- Owner/editor memberships can update child profiles and activities.
- Viewer memberships can read child profiles but cannot mutate them.

Reference updates are immediate and are not approval proposals.

## Navigation and other surfaces

### Home

Home receives the active child list and provides quick child-profile links.

### Calendar

Calendar has a Kids navigation action.

There is intentionally no child-profile marker in month cells. Profile reference information is not date-based and should not compete with parenting colours, events, handovers and tasks.

### Day Details

Phase 6 does not add a permanent child-profile block to every date sheet. Child reference data is available from Kids, while dated child-linked expenses and responsibilities already appear in their existing workflows.

This avoids adding non-date-specific clutter to Day Details.

### Expenses and Responsibilities

Both screens expose Kids navigation.

## Google Calendar

Child profile and activity mutations do not create Google Calendar jobs.

They do not import the Google Calendar outbox, queue or mapping layer.

## Database migration

Phase 6 introduces, but does not apply:

- `drizzle/0009_child_profiles.sql`

It extends `children` with profile fields and adds:

- `child_activities`

Do not apply this migration until the accumulated staged build is explicitly approved for deployment.

## Deployment verification later

After all stages are complete and deployment is approved, verify:

1. Kids lists all active children in the selected family calendar.
2. Each child opens only inside its own calendar.
3. Viewer access can read but not edit.
4. Preferred/full name and date of birth save correctly.
5. School fields save and display correctly.
6. Optional health fields can remain completely blank.
7. Health fields save only when parents choose to add them.
8. Practical sizes/preferences save correctly.
9. Adding an activity works.
10. Editing an activity works.
11. Removing an activity works.
12. Profile edits apply immediately without approval.
13. Activity edits apply immediately without approval.
14. Recent Changes shows who changed the profile/activity and when.
15. Audit rows do not duplicate sensitive profile values.
16. Child-linked open responsibilities appear.
17. Child-linked recent expenses appear.
18. Home child shortcuts open the correct profile.
19. Kids navigation works from Calendar, Expenses and Responsibilities.
20. No child-profile calendar-month marker is introduced.
21. Child profile/activity changes create no Google Calendar sync jobs.
22. Profile initials display cleanly before photo uploads are introduced in Phase 7.
