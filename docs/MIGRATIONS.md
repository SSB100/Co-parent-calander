# Database migrations

Covie uses ordered SQL migration files under `drizzle/`.

## Current production baseline

Production currently contains migrations `0000` through `0021`. They must **not** be replayed.

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
9. Production application deployment remains explicit; Git pushes do not auto-deploy.

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

The migration must be qualified on a temporary Neon branch before Production application and recorded as `0022` in `covie_schema_migrations`.
