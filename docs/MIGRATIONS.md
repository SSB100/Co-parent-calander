# Database migrations

Covie uses ordered SQL migration files under `drizzle/`.

## Current production baseline

Production contains migrations `0000` through `0012`. Migrations `0013_parenting_schedules.sql` and `0014_retire_legacy_auth.sql` are staged in GitHub and must not be treated as Production-applied until the final database deployment pass.

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

Migration `0014_retire_legacy_auth.sql` removes the obsolete token/session credential tables after the application has moved fully to Managed Neon Auth and `calendar_memberships`.

It drops:

- `sessions`
- `access_tokens`
- `access_token_type`

It intentionally does **not** delete any calendar or family-domain data. Legacy-only calendars become archive/inert data until deliberately recovered through a modern membership.

Apply `0013` before `0014`. See `docs/LEGACY_AUTH_RETIREMENT.md` for the recovery and verification rules.
