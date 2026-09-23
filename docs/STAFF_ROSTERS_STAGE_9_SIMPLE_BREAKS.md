# Stage 9 — Simple Breaks (awaiting Production migration approval)

Starting Production main: `1fa0dbaeddcf62a2367ab217f0220a89fe7bd5ac` (Stage 8 / PR 124).
Production was verified READY in syd1 and migration 0030 before work. Stage 10 is not started.

## Product and authority

Staff can start/end a break on their authenticated, selected-calendar active clock session. IDs never grant authority. Ending a break also matches its ID so a stale request cannot end a newer break. Manager timesheets show breaks read-only; attendance corrections still use the existing audited paths. Staff viewer/Manager editor capabilities are unchanged.

Clock-out policy: end the active break first. The UI explains this and the database enforces it, including races. No paid/unpaid, payroll, mandatory-break or compliance policy is introduced.

Timesheets show elapsed time, break time and worked time (elapsed minus breaks). Instants are subtracted across timezone/DST boundaries. Milliseconds are summed before converting to whole displayed minutes; worked minutes are displayed elapsed minus displayed break minutes so the visible figures reconcile. Open-session figures are provisional and excluded from completed totals. Calendar-local labels and Stage 7 correction behavior remain.

## Proposed migration 0031

`drizzle/0031_staff_roster_simple_breaks.sql` adds:

- `staff_roster_break_sessions`: UUID primary key, clock-session foreign key with cascade deletion, start/end timestamptz; nonnegative interval check.
- Partial unique index: one active break per clock session.
- Session/start index for reads.
- A break-write trigger that locks its parent clock session, rejects reassignment, overlaps and invalid bounds.
- A clock-update trigger that rejects closing/correcting attendance around an active or out-of-bounds break.
- Migration ledger entry 0031.

Existing schema has clock sessions but nowhere to durably store multiple breaks or enforce one active break. This additive table is the smallest independent durable model. It inherits calendar/Staff identity through its parent rather than duplicating those columns.

Start/end mutations and audit inserts are one SQL statement; only changed rows audit success. Database guards serialize breaks with clock changes. Invalid correction approval rolls back both the review and its audit, leaving the request pending. Existing Stage 7 JSON audit parameters needed explicit text casts, discovered by real database execution; no prior regression test was weakened.

## Qualification and preservation

Fresh Production clone: `staff-stage-9-breaks-qualification-2026-09-23`, branch `br-fancy-sunset-a7dbx27p`, created from `br-quiet-sea-a7duq4r3` at LSN `0/3243B98`.

Migration applied only to this clone using a direct connection and transaction. All 18 pre-existing table counts/fingerprints matched before/after migration and after test-fixture cleanup. Clone is 0031. Production migration has NOT been applied.

The fresh clone reflects newer user data than the Stage 8 handoff (10 calendars, 11 memberships, 12 Staff profiles, 171 audit rows across the full database). These are observations, not fixtures or overwrite instructions.

- New normal-suite tests: seven, covering action contracts, durations/DST/rounding, schema and transport boundaries.
- Real clone suite: four scenarios plus parent, 5/5 passing. Covers actual start/end/clock-out races, repeated/stale IDs, own/calendar isolation, private reads, audits, correction bounds and competing review.
- Focused schema and Stage 6–9 tests: 58/58 passing.
- Typecheck passes. Whole lint retains the known pre-existing operational-hours effect error and warnings.
- Full regression retains seven previously documented source-assertion failures. Migration sequence expectation extended from 0030 to 0031; previous Staff tests unchanged.
- High-severity audit gate passes; five moderate transitive advisories remain.
- Local build compiles and typechecks, then page-data collection lacks local NEON_AUTH_BASE_URL. Production READY is still required after approved migration/release.
- Responsive fixture-browser checks rendered the actual components with generated application CSS at 320/375/390/430/768/1280px. No horizontal overflow; End break is 44px high. Start/end actions refreshed their visible authoritative fixture state, and Staff/Manager timesheets showed reconciled break/worked totals. These were isolated fixtures, not authenticated live journeys or physical-device keyboard testing.

## Owner approval and release order

STOP before applying 0031 to Production. Obtain explicit owner approval for this exact migration.

After approval: re-fetch main and verify deployment; obtain a new read-only Production preservation snapshot and ledger; create a rollback branch at exact safe main; apply the reviewed migration transaction to Production; compare preservation; merge the reviewed Stage 9 PR; require exact-SHA Vercel Production READY; smoke-test and scan runtime logs; compare preservation again. Do not merge code that queries the new table before the approved migration exists.

The Neon connector began returning an argument-validation error after clone creation. Clone qualification used its already retrieved direct connection. Restore working Production read access before any migration/release; do not infer final Production state from the clone.

## Rollback

Before application deployment, the additive empty table/triggers can remain in place while Stage 8 continues running. Do not drop records or reverse the ledger as an automatic rollback.

After breaks are used, preserve all break rows and audits. Prefer a forward fix. A code rollback to Stage 8 is safe only after verifying zero active breaks: Stage 8 has no End break control, while the database correctly blocks clock-out with an active break. If active breaks exist, retain a compatible End break path until resolved; never fabricate end times to permit rollback. Completed break records and constraints remain preserved even after a code rollback. Any destructive schema reversal requires separate reviewed owner approval.

Next authoritative stage is Stage 10 — Mobile, Accessibility, Security & Production Qualification. Generate its full prompt only after Stage 9 is released; do not start it here.
