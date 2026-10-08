# Timesheets 0036: proposed release and permission approval

Status: exact-lock local implementation and qualification passed, with visual verification still blocked locally. **Not approved for Production schema/access execution.** Production migration, access grants, real staff invitations and deployment remain untouched. Hosted CI is separately authorized within the bounded allowance below.

## Exact target and scope

- Repository: `SSB100/Co-parent-calander`
- Baseline: Production main `7c90e4a9a15b72ecb6026030e8ca5dfce8a304df`, tree `e4b2c5285120055fa045d7620876c6ab5fadd343`. Local exported parent commit has this exact tree.
- Production target, only after approval: existing Neon project `delicate-sunset-36051658`, branch `br-quiet-sea-a7duq4r3`, database `neondb`.
- Schema file: `drizzle/0036_timesheets.sql`.
- Permission file: `docs/releases/timesheets-permissions.sql`.

The migration adds the `timesheets` calendar enum; ten new organisation/Timesheets tables; eight SECURITY INVOKER functions; a Timesheets-only Core membership serialization trigger; and two append-only history triggers. It registers migration 0036. No existing business rows are migrated, rewritten or deleted. Existing co-parenting and Staff attendance tables remain untouched.

The permission bundle grants the existing `covie_app` runtime role only required operations on the ten new tables and execution on the eight new functions. It removes PUBLIC access/execute to these new objects, removes runtime delete where unused, and limits audit/revisions to select/insert. There is no role creation, credential rotation/generation, new Auth grant, Auth configuration change, OAuth or external integration access. It relies on the already-available read of the non-secret `neon_auth.user` profile (metadata-only read confirmed `emailVerified` is boolean).

## Order and preconditions

1. Review the final code, schema, permission diff and recorded hashes; obtain specific production schema/permission approval and a separate bounded CI allocation.
2. Qualify the complete migration against a synthetic isolated native PostgreSQL database, including full existing migration compatibility, the restricted runtime role, concurrent acceptance/revocation, authority removal, stale entry writes and overlap rejection. Preserve before/after fingerprints for non-Timesheets tables in any remote qualification environment.
3. Pass focused and aggregate tests, desktop/mobile browser flows and build on the final candidate. Run no live staff invitations or outbound Auth email during qualification without specific permission.
4. Apply the schema through the existing migration owner and a direct database connection. Apply the reviewed runtime permission bundle. Check migration record, constraints, function SECURITY INVOKER status, triggers and privileges. Read-only verification must find no changes to existing calendar data.
5. Merge/deploy the exact qualified commit only within the approved CI/release budget. Confirm the expected commit on Production. Verify a private Timesheets route without changing any existing calendar.
6. Real organisation creation/staff onboarding is user work; it is not implicit permission for release smoke tests to invite people or change their access.

## Recovery

Do not drop Timesheets tables, delete time history, remove the enum value or restore the whole database as routine rollback. Before any organisation exists, application rollback to the previous release can leave additive schema dormant. Once Timesheets organisations exist, an old application does not understand their selected calendar type: use a forward fix or a compatibility-preserving disablement after review, retaining routes/data and existing calendars. Restore production data only under a separately approved recovery plan.

## CI exposure, not a spending guarantee

Existing Covie CI has two Linux jobs with 15-minute timeouts: 30 configured runner-minutes per full run. At the separately verified shared-account Linux rate of $0.006/minute, configured execution exposure is approximately $0.18 per run before artifact storage/cleanup and any overlapping triggers. A branch push plus PR creation may duplicate runs; merge triggers main CI again. An allowance of up to US$1 for this release’s checks was approved on 8 October 2026 within the unchanged US$14 shared cap. Limit this release to at most four full two-job runs including post-merge (US$0.72 configured compute exposure plus remaining artifact/cleanup headroom), preserve auto-stop, and avoid duplicate branch-push/PR triggers. Check the current remaining shared budget immediately before publication.

## Remaining gates

See `timesheets-local-qualification.json` for exact dependency, migration and permission hashes and passed local gates. All 760 regression tests, 23 native SQL checks, full typecheck/lint, dependency gate and production build pass on the locked Next16.3.8/React19.3.0 dependencies. A final 13-case copy/template check and rebuilt production bundle cover the last wording change. The initial memory failures were resolved after approved cleanup; they are not the final test result.

Local visual execution remains blocked before any page renders: executor Chromium reports a socket-permission denial, and the supported cloud browser reports ERR_BLOCKED_BY_CLIENT for the synthetic localhost fixture. No visual passes or screenshots are claimed. The 15-case desktop/mobile harness is included in the existing hosted browser job. Actual managed Auth email delivery/new-account flow has not been exercised against a live provider; the installed SDK contracts and authoritative verified-email SQL are qualified without changing Auth configuration.

Do not apply the production schema/access bundle before the hosted visual result and the specific approval are clear.
