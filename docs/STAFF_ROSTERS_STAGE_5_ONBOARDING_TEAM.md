# Staff Rosters Stage 5 — simplified onboarding, Team linking and Organiser

Stage 5 makes Staff Rosters calendar-first and Team-first without changing the Staff data model.

## Delivered

- New Staff Rosters calendars continue opening directly on the Calendar.
- When the owner is the only roster profile, the Calendar leads with **Add your first staff member to start rostering**.
- The Coral Add staff member action opens Team directly in the name-first create flow.
- Staff can be created with only a name. Access, roles, usual role and usual location remain optional details.
- The legacy `/calendar-types/staff-rosters/setup` route remains compatible but redirects Managers/Owners to Team instead of presenting a competing setup wizard.
- Existing `setup_completed_at` data remains intact and the compatibility setup API remains available.
- Team cards derive a calm Covie account state: Not invited, Invite active or Connected.
- Managers can create a new Staff invite, replace an old/expired invite and revoke an outstanding invite.
- Staff invite acceptance continues linking the authenticated membership to the existing Staff profile. It does not create a second Staff profile or a co-parenting participant.
- Staff invites remain viewer memberships; Manager invites remain editor memberships.
- Owner-only Manager authority remains enforced server-side.
- Staff remain blocked from Manager Team/structure routes while retaining bounded personal roster, availability, clock, timesheet and leave capabilities.
- Existing archive safety remains: upcoming live/published shifts block archive; archive revokes account roster access and outstanding invitations while historical roster and attendance data remain.

## Organiser

Manager Organiser remains intentionally small:

1. Team
2. Availability & leave
3. Roles & locations
4. Timesheets

The Calendar remains the primary Staff Rosters workspace.

## Database

No database migration is required. Stage 5 derives invitation UI state from the existing `staff_roster_invites` table and preserves migration `0030`.
