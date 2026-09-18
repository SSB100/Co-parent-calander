# Database migrations

Covie uses ordered SQL migration files under `drizzle/`.

## Current production baseline

Production contains migrations `0000` through `0012`. Migrations `0013_parenting_schedules.sql`, `0014_retire_legacy_auth.sql`, `0015_parent_profile_identity.sql` and `0016_retention_foundation.sql` are staged in GitHub and must not be treated as Production-applied until the final database deployment pass.

Those files must **not** be replayed.

Migration `0012_schema_foundation.sql` introduced the first explicit Covie migration ledger and is applied in Production:

- table: `covie_schema_migrations`
- historical rows `0000`–`0011` are marked `baseline = true`
- `0012` is recorded as a normal applied migration

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

This migration is currently staged only. Before Production application:

1. create a fresh Neon temporary branch from Production
2. apply `0013`
3. verify schedule counts, slot reconstruction and child links
4. compare effective assignments over representative date ranges before/after
5. confirm Google Calendar desired parenting output is unchanged for the same source data
6. apply to Production only during the explicitly approved release pass


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

This migration is staged only. Apply it after `0013`, `0014` and `0015`; do not run the worker code against a database that has not yet applied `0016`.
