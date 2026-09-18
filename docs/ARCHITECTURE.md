# Covie architecture

Last reviewed: 18 September 2026.

## System boundaries

Covie is organised around one selected family calendar.

Account identity comes from Managed Neon Auth. Application access is represented by `calendar_memberships`. Parent profiles in `participants` are domain records and can exist without an account.

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

## Permission model

- Owner: calendar administration plus editor capabilities.
- Editor: shared data mutation.
- Viewer: read-only shared access.
- A participant profile may exist without an account membership.

All API mutations require server-side permission checks and same-origin mutation protection.

## Agreement model

The approval engine stores proposed state separately from agreed state. Waiting, declined and withdrawn proposals never mutate agreed records or Google Calendar.

Feature-specific approval applicators apply the agreed mutation and proposal transition transactionally.

## Google Calendar

Calendar/event mutations enqueue durable database sync jobs in the same transaction where practical. A prompt post-response worker attempt may process them immediately, while the daily worker provides reconciliation/retry.

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
- schema migrations applied: `0000` through `0011`
- `0012_schema_foundation.sql` is prepared/verified and awaits explicit Production application

A pre-Phase-8 rollback branch is currently retained:

- `backup-before-phase-8-release`
- `br-orange-surf-a7znl10e`

Do not replay migrations `0000`–`0011`.

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

- apply the prepared `0012` migration ledger/invariant hardening after explicit approval
- retire the legacy token/session authentication path after its remaining calendar is migrated or archived
- move business workflows out of large route handlers into feature services
- split the large client shells into controllers/hooks and smaller UI components
- introduce a shared authenticated application shell
- make calendar timezone authoritative
- decouple parent identity from Tailwind colour names
- simplify the parenting recurrence persistence model
- modularise approval applicators and relationship aggregation
- add data-retention/privacy rules and selected database constraints
