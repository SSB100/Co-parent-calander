# Standalone Timesheets

Timesheets is its own calendar type, organisation boundary and project-time domain. It does not read, modify or grant access to Staff Rosters attendance. Co-parenting and the other calendar types keep their existing data and behaviour.

## First slice

- Create a Timesheets calendar to create one organisation, its owner membership and the owner's work profile in the same transaction. No parenting participant or child is created.
- Owners configure the organisation name, IANA timezone and duration increment (5, 10, 15, 30 or 60 minutes; default 15).
- Owners create named staff profiles with email addresses and choose staff or manager roles. Managers have only their own and explicitly assigned staff scope. Assigned-member profile management is permitted; managers cannot add unassigned people, promote managers or change assignments.
- Create a person-specific shareable invitation link. Covie does not send staff invitation emails automatically. New people use existing managed account creation to choose their own password; existing people sign in. An optional verification-code UI uses the installed managed Auth client without changing Auth configuration.
- Acceptance hashes the token and atomically checks the current Auth user email and `emailVerified`, exact invitation email snapshot, expiry, revocation, active profile/organisation/calendar, current inviter authority and profile availability. Grandfathered sessions alone cannot accept invitations. The same winning account can safely repeat acceptance. Other accounts cannot consume the link or inherit its profile.
- Staff record private day/week work blocks, client/project references, notes and billable status. A block is wholly billable or non-billable; split mixed work into separate blocks. Owners see all staff; managers see only assigned staff plus themselves; staff see themselves.
- Changes use optimistic versions and reject overlaps. Corrections or entries on another person's behalf require a reason, and all changes append immutable revision history. Delete is a history-preserving soft delete.
- Reports and CSV use exactly the same scoped entries and elapsed-minute allocation. CSV cells are protected against spreadsheet formulas. Exports explicitly distinguish full-entry duration from duration within the selected window.

## Exact time

The increment constrains elapsed duration, not wall-clock start positions. A 09:07–09:22 block is valid at 15 minutes. A 16-minute block is rejected, never rounded. Starts and ends must be whole minutes, positive and no more than 24 elapsed hours apart.

Nonexistent local times are rejected. Repeated DST times require an explicit earlier/later selection. Day and week totals allocate real elapsed time across local reporting dates, including overnight entries. Changing the organisation increment/timezone never rewrites saved entry instants or snapshots. Notes-only edits with unchanged instants retain the old increment/timezone; timing changes use current settings. Settings changes during a save produce a conflict rather than an interpretation change.

## Data and security

Migration `0036_timesheets.sql` adds ten tables, eight SECURITY INVOKER functions, three triggers and the `timesheets` enum value. It does not change existing domain rows. Composite foreign keys bind staff, memberships, clients, projects, entries, invitations and revisions to one organisation. The organisation has exactly one linked calendar.

Calendar-row then organisation-row locking serializes Timesheets settings, permissions, invitations and entries. A Timesheets-only Core membership trigger shares that lock, so generic membership revocation cannot race a mutation. Other calendar types are a no-op for this trigger.

The server supplies authenticated actor identity. Browser payloads cannot supply user IDs, organisation IDs, permissions, computed durations or invitation hashes. Generic editor permission does not grant Timesheets access. Reads, details, revisions, exports and mutations all resolve current domain authority, including archived/inactive access. API responses are private/no-store and bind the browser's expected calendar header to its current session. UI responses are identity-checked and superseded requests/drafts are discarded.

Raw invitation tokens are returned once to the authorised inviter, never stored or audited. Invitation landing pages reveal no target organisation or staff information before verified acceptance; they are no-store, no-referrer and noindex. The verified email is read from the existing non-secret Auth user profile. No Auth account/session/verification table writes or additional Auth privileges are used.

Clients and projects have stable local organisation-scoped UUIDs. Archival preserves history and blocks new use; historical unchanged classifications remain readable and editable for notes. A saved project cannot be reassigned to another client. No HubSpot credentials, OAuth, integration UI, jobs, webhooks or sync are implemented.

## Second slice

Optional weekly submission, approve/return/recall and locked-week workflow are deliberately a separate slice after this foundation is qualified. They are not part of the initial entry-lock semantics or a claimed completed feature. No live timer, rates, payroll, invoicing or full PSA features are included.

## Qualification

- `npm run test:timesheets`: focused contracts, time, policy, boundary and React interaction tests.
- `npm run test:timesheets-db`: explicitly configured synthetic SQL semantics; no production URL fallback. See the test header for tooling and native/PGlite distinctions.
- `npm run test:timesheets-native`: complete migrations, restricted runtime permissions, native races and actual service projections in a fresh local cluster. Prerequisites are installed PostgreSQL binaries (locally qualified with 17.11) and pg 8.23.1 in `build/timesheets-sql-tooling` or `COVIE_SQL_TOOLING`. Set `COVIE_TIMESHEETS_PG_BIN` and, for an unpacked toolchain, `COVIE_TIMESHEETS_PG_LIB`; otherwise `pg_config --bindir` is used. Runs as a non-root user, listens only on 127.0.0.1:55436, strips provider/production environment variables, preserves logs, and stops the cluster on exit.
- Full lint, typecheck, test, browser and build gates must also pass on the final release candidate.
- PGlite alone does not qualify native multi-connection concurrency. Native PostgreSQL locking, invitation redemption/revocation, overlapping writes and stale-version races require separate real-transaction tests.

Never execute the production migration, permissions bundle or real invitations as part of local verification.
