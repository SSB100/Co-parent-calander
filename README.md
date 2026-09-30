# Covie

Covie is a mobile-first shared-calendar ecosystem. Choose the optional preset you need: Staff Rosters, Salon Bookings, Shared Facilities, Social Groups or Co-parenting. Each calendar has its own people, permissions and purpose-specific tools. Personal is a private account view of your relevant commitments, linking to their original records.

Production uses:

- GitHub repository: `SSB100/Co-parent-calander`
- Vercel project: `co-parent-calander`
- Neon project: `delicate-sunset-36051658`
- Production Neon branch: `main` (`br-quiet-sea-a7duq4r3`)
- Production schema: migrations through `0035`, including the separately qualified and approved Salon additions

## Product model

A signed-in user can create or join one or more calendars without adopting every type. Calendar membership and the selected template’s roles control access. The existing co-parenting roles remain:

- `owner` — full family/calendar administration
- `editor` — can edit shared data
- `viewer` — read-only shared access

Parent profiles are separate from accounts so a co-parent can be represented in schedules even when they do not use Covie.

Shared preset capabilities:

- Staff Rosters: published shifts, leave, attendance and timesheets with manager/staff views
- Shared Facilities: resources, booking rules, availability and member bookings
- Social Groups: events, RSVPs, capacity and shared availability
- Salon Bookings: services, practitioner hours and appointments, with explicitly enabled client booking pages
- Personal: private source-linked commitments and items needing your attention

Co-parenting features:

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
- `0013_parenting_schedules.sql`
- `0014_retire_legacy_auth.sql` — non-destructive; legacy credential records are retained for recovery
- `0015_parent_profile_identity.sql`
- `0016_retention_foundation.sql`
- `0017_remove_retired_schema.sql`
- `0018_expense_share_payment_confirmation.sql`
- `0019_expense_share_partial_payments.sql`
- `0020_expense_share_payment_history.sql`
- `0021_recurring_shared_costs.sql`
- `0022_calendar_template_types.sql` — first-class calendar template identity

The list above records the original foundation. Later migrations add Staff Rosters, Shared Facilities, Social Groups and Salon Bookings through `0035`. See `docs/MIGRATIONS.md` for current release status. The `covie_schema_migrations` ledger is authoritative; historical migrations `0000`–`0011` are baselined.

Do not replay migrations already recorded in `covie_schema_migrations`.

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

GitHub Actions runs the same gate. Release candidates are validated from the current combined `main` state before Production promotion.

Feature-branch Git deployments are disabled. Main-branch Git deployments are enabled in `vercel.json`; merge only after the intended commit has passed CI and the release has been explicitly approved.

## Release safety

- Do not apply schema migrations directly without a reviewed migration plan and rollback point.
- Do not commit secrets or local environment files.
- Production attachment storage must use a **Private** Blob store.
- Keep Google credentials and token-encryption material server-side.
- Verify the current rollback inventory before each release. Retain existing backups; permanently deleting a branch requires specific approval for that branch.
