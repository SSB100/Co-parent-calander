# Timesheets 0037: custom work types and hourly entry grid

Status: local implementation, reviewed backend, 784 aggregate tests, typecheck, lint, production build and browser bundle qualification passed. Not published or deployed. Production schema and runtime permission changes require coordinated approval; no prior 0036 approval extends to 0037. No charged CI run is allocated to this slice yet.

## Exact target and scope

- Repository: SSB100/Co-parent-calander.
- Baseline Production main: d3ada5917c7d97e95e72001bc7b8156f6c5d1075, exact source tree e23113df611a55310af2309bf9596555be45cf8d.
- Existing Neon project delicate-sunset-36051658, Production branch br-quiet-sea-a7duq4r3, database neondb.
- Proposed additive schema: drizzle/0037_timesheet_work_types.sql.
- Proposed runtime permission bundle: docs/releases/timesheets-work-types-permissions.sql.

Migration 0037 adds one organisation-scoped table, timesheet_work_types; two nullable entry fields, work_type_id and work_type_name; a composite tenant foreign key; paired-null snapshot check; and case-insensitive unique names per organisation. It replaces timesheet_mutate with the same signature and SECURITY INVOKER semantics, preserving existing grants and calendar/organisation locking. It registers migration 0037. It does not alter migration 0036, existing entry classifications, audit/revision snapshots, other calendar domains or Auth configuration. No categories are seeded and no payroll/billable policy is inferred.

The exact access expansion is SELECT, INSERT and UPDATE on timesheet_work_types for the existing covie_app role. No DELETE, new role, credential, Auth permission, external integration or public access is granted. Existing table-level entry permissions include the new nullable columns. Existing function EXECUTE grants remain restricted. Production application requires the schema and this permission bundle before its deployment.

## Behaviour and compatibility

Owners create, rename, archive and restore the business's own work types. Members and assigned managers can choose an active type while entering work, but cannot manage types. Each entry stores the label chosen at save time. Rename/archive never rewrites entry labels or revision history. Retaining the same type preserves that label during corrections, including timing changes. A cleared or changed type cannot newly select an archived type. Reclassification to another active type snapshots its current label. No type is a valid optional choice; all existing entries retain null values.

Already-open older clients may omit workTypeId: the server preserves an existing entry's classification and creates unclassified new entries. Clients cannot supply the trusted label snapshot through the strict request contract. Work types never set billable status; the existing explicit billable input is unchanged. CSV uses the saved label and existing spreadsheet-formula escaping.

The visible hourly day/week calendar and click-to-create interaction require no database change. They remain within Timesheets and use the existing entry form, timezone validation and owner-configured duration increments.

## Required release order

1. Review the exact code, migration, permission bundle and hashes; obtain specific production schema/access approval and an allocated CI allowance.
2. Pass full tests/typecheck/lint/build and the final desktop/mobile browser matrix. Run scripts/test-timesheets-native.sh in a fresh synthetic local/CI cluster to verify all migrations, runtime grants, concurrent saves/rename/archive/stale updates and unchanged non-Timesheets fingerprints. Embedded PostgreSQL is useful semantics coverage, never native race qualification.
3. Apply only the reviewed schema as migration owner on the direct connection; apply only the approved new-table runtime grants. Verify ledger, constraints, SECURITY INVOKER status and minimum grants read-only. No real staff/business record is a test fixture.
4. Publish/merge/deploy the exact qualified candidate within the shared CI allocation, confirm the remote commit and Production deployment, then read-only smoke the existing Timesheets route.

## Recovery

An application rollback to the baseline may leave the additive schema intact. The baseline mutation client omits workTypeId; the replacement function safely preserves existing types on updates. Keep 0037 installed rather than reverting its function and silently risking label loss. Do not drop the new table/columns or erase snapshots as routine recovery. Prefer a forward fix and preserve business history. No whole-database restore is authorized.

## Verification limits

This recovered cloud workspace has the exact deployed source and dependencies but no native PostgreSQL binary. Synthetic PGlite and existing pg packages are available. Actual service tests have an explicitly selected embedded mode with restricted covie_app permissions; independent-connection races remain native-only. Hosted qualification and production release are held for allocation and approval. No live organisation, invitation, Auth account, roster or co-parenting record is created or modified for testing.

## Reviewed SQL hashes

- Schema SHA-256: ae2d573ee6cd4f3fa0e2d70bd721874f89fcfbf739d50d37502dbb1bf581276d.
- Permission SHA-256: 02f43ec1fc6a3c573538ed90b49e67481e7c8619198dbe443c58cc60367a4648.

These are proposed artifacts, not evidence that production approval was given. Stop and re-review if either hash changes. Independent backend review found no blocking defects. Its pre-0037 upgrade-history coverage gap was addressed with a genuine fixture created before the new migration; embedded service verification passes with restricted runtime rights. Native and rendered-browser qualification remain required.

## Proposed CI reservation, not authorization

Reserve up to US$0.75 from the existing shared US$18 cap, only once the parent confirms capacity. Maximum three complete CI workflows: initial draft-PR qualification, one corrective retry if needed, and the post-merge main run. Each workflow has two ubuntu-latest jobs capped at 15 minutes: at most 90 configured Linux runner-minutes, or US$0.54 compute at the verified US$0.006/minute standard Linux rate. The remaining US$0.21 is artifact/rounding headroom, not permission for another run. Artifacts retain the existing three-day lifetime. Current rates: https://docs.github.com/en/billing/reference/actions-runner-pricing (checked 9 October 2026).

Use a branch outside build/** and feature/**, for example feat/timesheets-work-types-hours, so the branch push does not duplicate the pull-request trigger. Keep the PR draft until qualified. Count any manual diagnostic/re-run against the same allowance; never start an extra workflow because a prior one failed. Preserve one run for post-merge. If either initial or corrective qualification remains red, do not migrate/merge/deploy. Check the shared account's current usage/reservation immediately before every charged start. Billing metering can lag; configured execution exposure is not a provider-enforced spending guarantee.

## Ordinary release risks

The additive ALTER TABLE briefly requires an exclusive lock. Apply in one migration transaction with bounded lock/statement timeouts; on contention, leave the application unchanged and retry within approved limits rather than waiting indefinitely. Deploying the app before its table and runtime grants would make Timesheets reads fail. A browser/layout or native-concurrency defect may still appear at the pending hosted gate; local bundle/JSDOM/PGlite passes are not substitutes. Other calendar tables and their data are outside the migration. Existing entries stay unclassified until explicitly changed; no hardcoded default work types are inserted. No automatic billable, pay, wage or payroll behavior changes.

## Reproduce local checks

From the repository root with its unchanged installed dependencies:

- npm run typecheck
- npm run lint
- npm run test:timesheets
- Full package test list without tsx's optional IPC CLI: node -e "const {spawnSync}=require('child_process'); const files=require('./package.json').scripts.test.split(' ').slice(2); const result=spawnSync(process.execPath,['--import','tsx','--test','--test-concurrency=1',...files],{stdio:'inherit'}); process.exit(result.status??1)"
- COVIE_SQL_TOOLING=/path/to/existing/pglite-tooling node --import tsx --test tests/timesheets.database.test.ts
- env -u DATABASE_URL -u APP_DATABASE_URL -u COVIE_TIMESHEETS_TEST_DATABASE_URL COVIE_SQL_TOOLING=/path/to/existing/pglite-tooling COVIE_TIMESHEETS_EMBEDDED=1 node --import tsx --test tests/timesheets-service.database.test.ts
- COVIE_BROWSER_BUILD_ONLY=1 node tests/browser/timesheets/run.mjs
- NEON_AUTH_BASE_URL=https://build-only.invalid/auth NEON_AUTH_COOKIE_SECRET=build-only-cookie-secret-not-for-runtime npm run build

For the remaining gates use npm run test:timesheets-native with installed PostgreSQL/pg as documented in docs/TIMESHEETS.md, then the real browser runner in tests/browser/timesheets/README.md. Never substitute a production connection or real business data for the synthetic fixtures.
