# Covie architecture

Last reviewed: 19 September 2026.

## System boundaries

Covie is organised around one selected calendar. Each calendar has a first-class template type: Co-parenting, Staff Rosters, Shared Facilities or Social Groups.

Account identity comes from Managed Neon Auth. Application access is represented by `calendar_memberships`. Parent profiles in `participants` are domain records and can exist without an account. Legacy token/session authentication is retired from application runtime and recorded in migration `0014`; legacy credential tables are temporarily retained as recovery evidence until legacy-only calendars are recovered or explicitly archived.

The primary business domains are:

- parenting schedule and handovers
- shared events
- approval proposals
- expenses
- responsibilities
- children and activities
- attachments
- related items
- Google Calendar output

## Data ownership

Neon Postgres is the authoritative source of truth.

Google Calendar is optional, one-way output to a Covie-created secondary calendar. It must never become a second source of truth.

Attachment bytes belong in Vercel Private Blob. Postgres stores private object keys, metadata and relationships only.

Home is a derived read model and has no Home-specific persistence.

The selected calendar's `timezone` is authoritative for date-sensitive application behaviour. `Pacific/Auckland` remains the default for newly created calendars, not a hidden runtime assumption.

Saved parenting schedules use first-class `parenting_schedules`, `parenting_schedule_slots`, and `parenting_schedule_children` records introduced by migration `0013`. Manual `parenting_assignments` remain the date-specific override layer. Legacy `recurring_rules` metadata is retained only for migration/history compatibility and is no longer the intended runtime source of truth after `0013`.

## Database schema modules

`lib/db/schema.ts` is a compatibility barrel. Table and enum definitions are grouped by domain under `lib/db/schema/`:

- core
- migrations
- parenting
- events
- expenses
- responsibilities
- children
- attachments
- links
- approvals
- Google Calendar
- audit
- retention

Application code can keep importing from `@/lib/db/schema`, while feature-level schema ownership stays explicit and the Drizzle entry point remains stable.

## Permission model

- Owner: calendar administration plus editor capabilities.
- Editor: shared data mutation.
- Viewer: read-only shared access.
- A participant profile may exist without an account membership.

All API mutations require server-side permission checks and same-origin mutation protection.

Parent domain identity is represented by the `participants.profile_slot` values `parent_one` and `parent_two`. `color_key` is retained only as presentation compatibility and must not be used to decide ownership, account identity or parent ordering.

## Agreement model

The approval engine stores proposed state separately from agreed state. Waiting, declined and withdrawn proposals never mutate agreed records or Google Calendar.

Feature-specific approval applicators apply the agreed mutation and proposal transition transactionally.

## Google Calendar

Calendar/event mutations enqueue durable database sync jobs in the same transaction where practical. A prompt post-response worker attempt may process them immediately, while the daily worker provides reconciliation/retry.

## Privacy and retention

Attachment metadata deletion queues the private object key transactionally in `storage_cleanup_jobs`. A prompt post-response attempt handles normal user deletions, while the authenticated daily worker retries failures and reclaims expired processing leases.

The same daily maintenance removes stale incomplete uploads, abandoned proposal drafts and operational proposal/audit history after the documented windows. Active domain records, Waiting proposals and Ready attachments are not age-expired. See `docs/RETENTION.md`.

## Relationships

Native domain relationships remain authoritative, for example Expense → Child or Responsibility → Event.

Optional user-created relationships use `entity_links`.

Document relationships use `attachment_links`.

Generic relationship UI aggregates these sources without replacing domain semantics.

## PWA boundary

The service worker caches static Next assets, icons and the manifest only. It does not cache private page navigations, API responses or authentication routes.

## Production database

Production Neon:

- project: `delicate-sunset-36051658`
- branch: `br-quiet-sea-a7duq4r3`
- schema migrations applied in Production before this release: `0000` through `0021`\n- migration `0022` adds first-class calendar template identity and is applied only after its production migration gate
- `covie_schema_migrations` is the authoritative migration ledger from `0012` onward
- legacy `access_tokens`, `sessions` and `access_token_type` remain temporarily retained as recovery data after non-destructive migration `0014`

Rollback snapshots currently retained:

- `backup-before-0013-0016-release` (`br-bitter-fire-a7p424x5`) — immediate pre-`0013`–`0016` Production snapshot
- `backup-before-phase-8-release` (`br-orange-surf-a7znl10e`) — older pre-Phase-8 snapshot

Do not replay migrations already recorded in `covie_schema_migrations`.

## Release workflow

Automatic Vercel Git deployment is disabled.

The intended release flow is:

1. work in GitHub
2. CI passes install, lint, typecheck, tests, dependency audit and build
3. review any required database migration separately
4. create/confirm rollback protection for schema changes
5. apply only unapplied migrations
6. explicitly approve production release
7. perform one production deployment
8. verify root/API health, runtime errors and integration-specific checks

This prevents production from being promoted before CI finishes and avoids unnecessary Preview deployments.

## Current architecture-cleanup direction

Before the brand/UI redesign, cleanup work should:

- move business workflows out of large route handlers into feature services
- split the large client shells into controllers/hooks and smaller UI components
- introduce a shared authenticated application shell
- modularise approval applicators and relationship aggregation
- keep the production-applied privacy/retention policy and durable cleanup queue covered by release verification
