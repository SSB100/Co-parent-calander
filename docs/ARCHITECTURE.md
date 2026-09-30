# Covie architecture

Calendar ecosystem boundaries reviewed: 30 September 2026.

## System boundaries

Covie workspaces use one selected calendar at a time. Optional preset types are Staff Rosters, Salon Bookings, Shared Facilities, Social Groups and Co-parenting. Personal is a separate, account-private read projection across relevant commitments; it never copies source records or treats membership alone as participation. See `PERSONAL_CALENDAR.md` and `SALON_BOOKINGS_PLAN.md`.

Salon clients use their authenticated identity to book and manage their own appointments without becoming calendar members. An explicitly enabled public page exposes only allowed business/service/practitioner fields and available slots. It never exposes the shared workspace, other clients, private notes or unrelated calendars.

Account identity comes from Managed Neon Auth. Application access is represented by `calendar_memberships`. Parent profiles in `participants` are domain records and can exist without an account. Legacy token/session authentication was retired in migration `0014`; migration `0017` removed its retired credential tables after qualification.

The primary business domains are:

- parenting schedule and handovers
- shared events
- approval proposals
- expenses
- responsibilities
- children and activities
- attachments
- related items
- optional one-way co-parent Google Calendar output
- Staff Rosters and attendance
- Shared Facilities availability and bookings
- Social Groups events, RSVPs and availability
- Salon services, practitioners and appointments
- private Personal projections

## Data ownership

Neon Postgres is the authoritative source of truth.

Google Calendar is optional, one-way output to a Covie-created secondary calendar. It must never become a second source of truth.

Attachment bytes belong in Vercel Private Blob. Postgres stores private object keys, metadata and relationships only.

Home is a derived read model and has no Home-specific persistence.

The selected calendar's `timezone` is authoritative for date-sensitive application behaviour. `Pacific/Auckland` remains the default for newly created calendars, not a hidden runtime assumption.

Saved parenting schedules use first-class `parenting_schedules`, `parenting_schedule_slots`, and `parenting_schedule_children` records introduced by migration `0013`. Manual `parenting_assignments` remain the date-specific override layer. Migration `0017` removed the retired first-generation `recurring_rules` storage.

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
- Staff Rosters
- Shared Facilities
- Social Groups
- Salon Bookings

Application code can keep importing from `@/lib/db/schema`, while feature-level schema ownership stays explicit and the Drizzle entry point remains stable.

## Permission model

Core membership is combined with each preset’s domain role. Staff manager/staff, Facilities resource scope, Social group roles and Salon practitioner/client capabilities are enforced by their services and transactional boundaries. Co-parent profiles are never created by joining another preset.

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
- migrations through `0035` are applied in Production after isolated qualification and specific approval
- `covie_schema_migrations` is the authoritative migration ledger from `0012` onward
- legacy `access_tokens`, `sessions`, `access_token_type` and first-generation recurrence storage were removed by migration `0017`

Recent rollback snapshots (verify live inventory before any release):

- `backup-before-0033-facilities-20260930` (`br-damp-dream-a7453iai`)
- `backup-before-0034-social-20260930` (`br-soft-bonus-a7pgwbl2`)
- `backup-before-0035-salon-20260930` (`br-solitary-dream-a7nujr7j`)
- `backup-before-0035-salon-release-20260930-1758` (`br-square-truth-a74kmkrv`) — latest pre-`0035` production snapshot

Do not replay migrations already recorded in `covie_schema_migrations`.

## Release workflow

Feature-branch Vercel Git deployments are disabled by default; `main` deployment is enabled in `vercel.json`. A specific preview branch may be enabled for approved qualification, without changing deployment protection. Merging to `main` therefore follows the tested-batch release gate.

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
