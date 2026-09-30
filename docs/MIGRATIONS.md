# Database migrations

Covie uses ordered SQL migration files under `drizzle/`.

## Current production baseline

Production currently contains migrations `0000` through `0030`. They must **not** be replayed. This baseline was re-verified against the Production Neon branch `br-quiet-sea-a7duq4r3` on 23 September 2026.

Migration `0012_schema_foundation.sql` introduced the first explicit Covie migration ledger:

- table: `covie_schema_migrations`
- historical rows `0000`–`0011` are marked `baseline = true`
- `0012` through `0016` are recorded as normal applied migrations

The baseline timestamps represent when the ledger was established, not the original historical deployment times.

## Rules for future migrations

1. Add exactly one new numbered SQL file.
2. Never edit an already-applied migration.
3. Add the migration's own ledger row as the final logical schema-version step.
4. Validate production data against any new constraints before applying them.
5. Test the migration on a temporary Neon branch first.
6. Create or confirm a rollback point before production schema changes.
7. Apply only migrations not already present in `covie_schema_migrations`.
8. Verify schema and application CI before deployment.
9. Treat merges to `main` as Production code releases. The current Vercel project deploys `main` to Production automatically; feature branches remain non-production unless explicitly promoted.

## 0012 invariant hardening

The first ledger migration also moves several existing application assumptions into Postgres constraints:

- event end date cannot precede start date
- recurring event end date cannot precede start date
- parenting recurring-rule end date cannot precede start date
- invite use counts must stay within their configured maximum
- settled expenses must have a settlement timestamp, and non-settled expenses must not
- Google event-link ranges must be ordered
- Ready attachments must have `ready_at`, while Pending attachments must not
- recurring responsibility `next_occurrence_id` must point to a real responsibility and is cleared if that next row is deleted

These checks were validated against Production before the migration was prepared; no existing rows violated them.


## 0013 first-class parenting schedules

Migration `0013_parenting_schedules.sql` replaces RRULE metadata as the saved parenting-schedule source of truth.

It adds:

- `parenting_schedules`
- `parenting_schedule_slots`
- `parenting_schedule_children`

The migration backfills active saved schedules from existing `recurring_rules` metadata, including split morning/afternoon ownership and linked children. Existing `recurring_rules` rows are retained as historical compatibility data during this transition, but the application runtime uses the new first-class tables after `0013`.

Manual rows in `parenting_assignments` remain date-specific overrides and continue to win over the repeating baseline.

Production qualification completed before release on 19 September 2026:

1. a fresh Neon branch was cloned from Production at schema `0012`
2. `0013`–`0016` were applied transactionally
3. the backfill produced 2 schedules, 28 slots and 2 child links
4. exact set comparisons found zero schedule, slot or child-link mismatches
5. Production was migrated only after the repository CI gate passed
6. a fresh rollback snapshot, `backup-before-0013-0016-release`, was created immediately before Production migration


## 0014 legacy authentication retirement

Migration `0014_retire_legacy_auth.sql` records retirement of the obsolete token/session authentication path after the application has moved to Managed Neon Auth and `calendar_memberships`.

It is deliberately non-destructive. The legacy `sessions`, `access_tokens` tables and `access_token_type` enum remain temporarily in Postgres as recovery evidence for legacy-only calendars, while application runtime code no longer reads them.

A later cleanup migration may remove that retained credential infrastructure only after every legacy-only calendar has either been recovered into a modern membership or explicitly approved for archival.

Apply `0013` before `0014`. See `docs/LEGACY_AUTH_RETIREMENT.md` for the recovery and verification rules.


## 0015 semantic parent identity

Migration `0015_parent_profile_identity.sql` adds a stable semantic `profile_slot` to parent profiles:

- `parent_one`
- `parent_two`

Existing active parents are backfilled by creation order within each calendar. A partial unique index prevents two profiles in the same calendar from sharing the same semantic slot.

The existing `color_key` column remains for presentation compatibility only. Runtime ownership and account identity continue to use participant IDs, while visual palette selection can map from `profile_slot` without making a colour name part of the domain model.

## 0016 privacy retention and durable storage cleanup

Migration `0016_retention_foundation.sql` adds `storage_cleanup_jobs` and a transactional attachment-deletion trigger. The queue retains only a storage provider/object key, retry state and bounded error metadata. It allows user deletions, profile-photo replacement, stale upload expiry and cascade deletion to remove private Blob bytes reliably even when the first provider call fails.

The matching daily worker also enforces the policy documented in `docs/RETENTION.md` for stale Pending uploads, abandoned Draft proposals, terminal proposal history and audit entries.

This migration is applied in Production after `0013`, `0014` and `0015`. The release verification confirmed the queue table, cleanup function and attachment-deletion trigger are present, and a synthetic attachment deletion successfully queued a pending cleanup job on the qualification branch.


## 0022 calendar template identity

Migration `0022_calendar_template_types.sql` adds a first-class `calendar_type` enum and a non-null `calendars.calendar_type` column.

Existing calendars are preserved as `co_parenting` through the column default. New calendars explicitly store one of:

- `co_parenting`
- `staff_rosters`
- `shared_facilities`
- `social_groups`

The application uses this type only for calendar navigation, routing and template selection at this stage. It does not retrofit roster, booking or social data into the co-parenting schema.

The migration was qualified and applied to Production on 22 September 2026 and is recorded as `0022` in `covie_schema_migrations`.


## 0023 Staff Rosters foundation

Migration `0023_staff_roster_foundation.sql` introduces Staff Rosters domain storage for team members, job roles, work locations and availability. It is isolated from the co-parenting schema and does not alter parenting, children, shared-cost, responsibility or approval tables.

The migration was qualified successfully on temporary Neon branches cloned from Production and applied to Production after explicit approval on 22 September 2026. A rollback branch, `backup-before-0023-staff-rosters`, was created immediately before release. Production now records `0023`.


## 0024 calendar lifecycle and Staff roster setup/shifts

Migration `0024_calendar_lifecycle_staff_shifts.sql` is the Stage 2 migration.

It adds the Covie Core calendar lifecycle field `calendars.archived_at`, plus Staff Rosters setup and one-off shift storage:

- `staff_roster_settings`
- `staff_roster_shifts`
- `staff_roster_shifts_time_valid`

Archive is reversible; permanent delete remains a separate owner-only action and relies on existing calendar-scoped cascade rules. Staff shifts are kept inside the Staff Rosters domain and do not alter parenting, child, Shared Costs, Tasks or approval tables.

Migration `0024` was qualified and applied to Production on 22 September 2026. The rollback branch created immediately before that release is `backup-before-0024-staff-roster-builder` (`br-steep-firefly-a70jmc58`).


## 0025 Staff roster publication snapshots

Migration `0025_staff_roster_publication.sql` adds the weekly publication boundary between the Manager's editable roster and the Staff-visible roster:

- `staff_roster_week_publications`
- `staff_roster_published_shifts`

Managers continue editing `staff_roster_shifts`. Staff reads published snapshots rather than unfinished Manager draft rows. A publication is unique per calendar/week and later sends increment its revision.

Migration `0025` was applied to Production on 23 September 2026 (NZ time).

## 0026 Staff attendance, corrections and leave

Migration `0026_staff_roster_attendance_leave.sql` adds:

- `staff_roster_clock_sessions`
- `staff_roster_timesheet_corrections`
- `staff_roster_leave_requests`
- correction and leave status enums

The database prevents more than one active clock session per Staff member. Attendance remains an operational roster feature only; this migration does not add wages, PAYE, payroll, holiday-pay or leave-accrual calculations.

Migration `0026` was applied to Production on 23 September 2026 (NZ time).

## 0027 Staff roster account invitations

Migration `0027_staff_roster_invitations.sql` adds `staff_roster_invites`.

An invitation links an authenticated Covie calendar membership to an existing `staff_roster_members` profile. It must not create a duplicate Staff profile or a co-parenting participant.

Staff invitations use viewer calendar permission plus Staff-domain self-service capabilities. Manager invitations use editor permission. Owner-only policy continues to govern Manager promotion.

Migration `0027` was applied to Production on 23 September 2026 (NZ time).

## 0028 Staff roster publication updates

Migration `0028_staff_roster_updates.sql` adds `staff_roster_updates`.

These records describe affected Staff changes when a published roster is updated. Intermediate Manager draft edits remain quiet until the Manager explicitly sends the updated roster.

Migration `0028` was applied to Production on 23 September 2026 (NZ time).

## 0029 Staff member multi-role assignments

Migration `0029_staff_roster_member_roles.sql` adds `staff_roster_member_roles` and backfills each member's existing default role into the reusable role-assignment relation.

A Staff member may have multiple eligible job roles while retaining one optional default role for new-shift prefilling.

Migration `0029` was applied to Production on 23 September 2026 (NZ time).

## 0030 Staff roster operational hours

Migration `0030_staff_roster_operational_hours.sql` adds persisted operational-hour bounds to `staff_roster_settings`:

- `operational_start_minute`
- `operational_end_minute`
- `staff_roster_settings_operational_hours_valid`

The Manager Week view may show a practical operating window without changing the underlying 24-hour shift model.

Migration `0030` was applied to Production on 23 September 2026 (NZ time).

## Current Staff Rosters schema boundary

As of migration `0030`, Production includes the Staff Rosters foundation, one-off shifts, publication snapshots, roster updates, attendance, timesheet corrections, leave, account invitations, multi-role assignments and operational hours.

Any future Staff Rosters schema change must start at migration `0031` or later, preserve current Production Staff records, and still requires explicit Production migration approval after qualification on a fresh Production clone.

## 0033 Shared Facilities and purpose-specific membership

Migration 0033 was qualified and applied to Production on 30 September 2026 after explicit approval. Rollback branch: `backup-before-0033-facilities-20260930` (`br-damp-dream-a7453iai`). It adds facility settings, resources, bookings and update history, plus purpose-specific member/invite roles. Owners can delegate selected resources to a manager; Social Groups can reuse the role primitive for group admins. Editor/viewer Core memberships are preserved and never create parent profiles in these templates.

Booking writes serialize resource conflicts and per-member limits, enforce local opening hours/duration/notice/cancellation rules, and keep version and duplicate-submit checks. Private booking notes are shown only to the creator or authorised organiser; shared-title visibility is opt-in.

This migration is qualified on a fresh Production clone before release. Production approval is explicit and a rollback branch must be captured before applying. Existing runtime default table privileges apply to the new tables; no new account or credential is provisioned.

## 0034 Social Groups

Migration 0034 was qualified and applied to Production on 30 September 2026 after specific approval. Rollback: `backup-before-0034-social-20260930` (`br-soft-bonus-a7pgwbl2`).

Additive Social settings, events, RSVP responses, personal shared availability and update history. Event and RSVP triggers preserve member/organiser authority, serialize capacity and retain cancelled history. Events may overlap; RSVP conflicts are non-blocking notices. Existing tables and co-parenting data are not rewritten.

Requires 0033 template roles. Qualify on the isolated branch, receive specific production approval, capture a fresh rollback point and verify runtime table access before rollout.

## 0035 Salon Bookings (qualification only)

Adds the optional `salon_bookings` enum value and nine tables: `salon_settings`, `salon_practitioners`, `salon_services`, `salon_practitioner_services`, `salon_working_hours`, `salon_time_blocks`, `salon_appointments`, `salon_updates`, and `salon_invite_roles`. Existing `covie_app` default CRUD privileges cover these tables; functions use invoker privileges. No new credential, account, payment access or public business publication is created.

Salon-only serialization triggers also attach to the shared membership/invitation tables. They return without Salon changes for other calendar types. Generated co-parent fixtures test this boundary; existing co-parent records are not rewritten. Booking functions lock current calendar/practitioner authority, validate expected displayed terms, preserve service snapshots, enforce hours/buffers/conflicts and protect retry/version semantics.

Applied only to isolated qualification branch `br-frosty-morning-a75bl7hs`. Rollback copy `br-solitary-dream-a7nujr7j` retains production at 2026-09-30 11:50 UTC. Production application remains pending specific approval including these shared-table triggers; take an appropriately current rollback point before applying. Actual login as the runtime role was unavailable because the connection lookup has no password and the owner cannot SET ROLE. Table/function ACL verification is distinct from successful application-role authentication.
