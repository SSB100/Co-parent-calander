# Staff Rosters Stage 1

Staff Rosters Stage 1 establishes the real production foundation for the Staff Rosters calendar without changing the co-parenting feature implementation.

## Product source

- Covie Brand Bible v2.0 controls shared UI, interaction, spacing, colour semantics, dialogs, forms, navigation and responsive behaviour.
- Calendar Template Specifications v0.1 controls Staff Rosters domain behaviour and product boundaries.

## Included in Stage 1

### Team

- Real roster member records.
- Separate roster-access role: Owner, Manager or Staff.
- Optional default job role.
- Optional default work location.
- Owner can create Managers or Staff.
- Managers can add and manage Staff.
- Owner profile is linked lazily to the existing calendar membership for Staff Rosters calendars created before this migration.
- Team members can exist as roster profiles before account invitations are added in a later stage.

### Roles and locations

- Create and archive job roles.
- Create and archive work locations.
- Archived roles/locations are removed from active assignment choices.
- Staff profiles can store a default role and location.

### Availability

- Available or unavailable status.
- Date-specific records.
- Whole-day availability or a bounded start/end time.
- Optional note.
- Owner and Manager can manage team availability.
- Staff capability policy limits Staff to their own availability.

## Capability boundary

Staff Rosters uses its own server-side capability policy. It does not reuse co-parenting participant roles.

Stage 1 establishes:

- `manageTeam`
- `manageManagers`
- `manageStructure`
- `editOwnAvailability`
- `manageAllAvailability`
- `createShifts` (reserved for the next stage)
- `publishRoster` (reserved for the publish stage)

The browser never grants authority. APIs derive capabilities from the selected calendar membership plus Staff Rosters access role.

## Schema

Migration `0023_staff_roster_foundation.sql` adds only Staff Rosters domain tables and enums:

- `staff_roster_members`
- `staff_roster_roles`
- `staff_roster_locations`
- `staff_roster_availability`
- `staff_roster_access_role`
- `staff_roster_availability_status`

No parenting, child, shared-cost, responsibility or approval tables are changed.

## Migration qualification

Migration 0023 was applied to a temporary Neon branch cloned from Production.

Qualification confirmed:

- all four new tables were created
- both enums contain the documented values
- the existing Staff Test calendar can reference its existing calendar membership
- role, location, member and both whole-day and timed availability records insert successfully
- an invalid availability range where end precedes start is rejected by the database constraint
- synthetic qualification records were removed
- the temporary qualification branch was deleted without applying changes to Production

Production remains at migration 0022 until this stage is explicitly approved for release.

## Deferred to later Staff Rosters stages

- account invitations/linking for Managers and Staff
- manager team/location scoping
- shifts
- recurrence
- overlap and unavailability conflict checks
- draft/published roster states
- publish workflow
- copy previous roster
- staff personal shift view
- schedule-change acknowledgement
- notifications and roster activity presentation
