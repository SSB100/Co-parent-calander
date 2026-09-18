# Covie

Covie is a mobile-first shared co-parenting organiser for schedules, expenses, responsibilities, agreements, child information, documents and related items.

Production uses:

- GitHub repository: `SSB100/Co-parent-calander`
- Vercel project: `co-parent-calander`
- Neon project: `delicate-sunset-36051658`
- Production Neon branch: `main` (`br-quiet-sea-a7duq4r3`)
- Production schema: migrations `0000` through `0012`

## Product model

A signed-in user can create or join one or more family calendars. Calendar membership controls access:

- `owner` — full family/calendar administration
- `editor` — can edit shared data
- `viewer` — read-only shared access

Parent profiles are separate from accounts so a co-parent can be represented in schedules even when they do not use Covie.

Core features:

- full-day and split-day parenting schedules
- saved repeating parenting schedules plus manual date overrides
- shared events and recurrence
- agreement/approval proposals
- expenses and settlement tracking
- responsibilities and recurrence
- child profiles and activities
- private attachments/profile photos
- related items across features
- optional one-way Google Calendar sync
- PWA installation

## Architecture

- Next.js App Router + React
- Neon Postgres + Drizzle ORM
- Managed Neon Auth for account login
- Vercel for production hosting
- Vercel Private Blob for attachment bytes
- Zod for request/domain validation

The relational database remains the source of truth. Google Calendar is one-way output only.

See `docs/ARCHITECTURE.md` for the current system boundaries and cleanup/release conventions.

## Local setup

Use Node.js 24 and npm.

Copy `.env.example` to `.env.local` and configure the required values.

At minimum:

- `DATABASE_URL`
- `NEON_AUTH_BASE_URL`
- `NEON_AUTH_COOKIE_SECRET`
- `NEXT_PUBLIC_APP_URL`

Optional integrations have their own variables documented in `.env.example` and feature docs.

Install and run:

```bash
npm ci
npm run dev
```

## Database migrations

SQL migrations live in `drizzle/`:

- `0000_initial.sql`
- `0001_nullable_assignment_parent.sql`
- `0002_account_memberships.sql`
- `0003_half_day_assignments.sql`
- `0004_google_calendar_sync.sql`
- `0005_approval_engine.sql`
- `0006_recurring_events.sql`
- `0007_expenses.sql`
- `0008_responsibilities.sql`
- `0009_child_profiles.sql`
- `0010_attachments.sql`
- `0011_entity_links.sql`
- `0012_schema_foundation.sql`
- `0013_parenting_schedules.sql` — staged, not yet Production-applied
- `0014_retire_legacy_auth.sql` — staged, not yet Production-applied
- `0015_parent_profile_identity.sql` — staged, not yet Production-applied
- `0016_retention_foundation.sql` — staged, not yet Production-applied

Production has migrations through `0012` applied. The `covie_schema_migrations` ledger records the historical `0000`–`0011` baseline plus normal migration `0012`. Migrations `0013_parenting_schedules.sql` through `0016_retention_foundation.sql` are staged in GitHub for the eventual approved database release. Migration `0014` retires legacy authentication non-destructively and deliberately retains old credential records for recovery until a later cleanup migration.

Do not replay historical migrations against production. The architecture-cleanup work is introducing an explicit migration ledger/baseline before the next schema migration.

## Verification

The release gate is:

```bash
npm ci --no-audit --no-fund
npm run lint
npm run typecheck
npm test
npm audit --audit-level=high
npm run build
```

GitHub Actions runs the same gate.

Automatic Git deployments are disabled. Production deployment should occur only after the intended commit has passed CI and the release has been explicitly approved.

## Release safety

- Do not apply schema migrations directly without a reviewed migration plan and rollback point.
- Do not commit secrets or local environment files.
- Production attachment storage must use a **Private** Blob store.
- Keep Google credentials and token-encryption material server-side.
- The production rollback branch `backup-before-phase-8-release` should remain untouched until a later cleanup explicitly retires it.
