# Database migrations

Covie uses ordered SQL migration files under `drizzle/`.

## Current production baseline

Production already contains the schema represented by migrations `0000` through `0011`.

Those files must **not** be replayed.

Migration `0012_schema_foundation.sql` introduces the first explicit Covie migration ledger:

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
