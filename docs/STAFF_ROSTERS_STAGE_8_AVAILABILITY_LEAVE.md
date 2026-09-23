# Staff Rosters Stage 8 — Availability & Leave qualification

Baseline: Production `487bc00c1feff96437382c0346a77cf852a6392b`, Neon migration `0030`. This stage has no migration.

## Authority and privacy

Availability remains selected-calendar and linked-member bounded. Staff viewer membership permits own self-service only; Manager editor membership plus the existing capability permits selected-calendar team management. Active targets are requalified during availability insertion. Deletion checks calendar and ownership in the mutation itself. Leave creation always uses the authenticated linked member, cancellation is own-only, and review requires the existing Manager capability. Staff leave payloads omit review metadata and draft/published overlap context. No co-parenting authority is introduced.

## Submission and lifecycle rules

Availability entries may be whole-day or part-day, available or unavailable. New overlapping entries for the same member/day are rejected, including identical submissions and conflicting statuses. Adjacent part-day intervals remain valid. Remove an existing entry before replacing its overlapping interval; existing data is not rewritten.

Availability creation and exact pending leave duplication checks acquire a transaction advisory lock in a **separate statement before insertion**, so a waiting submitter gets a fresh READ COMMITTED snapshot. Distinct leave requests may overlap. Identical pending requests return a conflict without another row or audit.

Leave review/cancellation lock the request row and condition the transition on its current state. Exactly one pending review wins; repeated/stale review cannot change the decision or audit success. Cancellation permits pending or approved requests. Approval followed by approved-to-cancelled is a valid two-transition history; cancellation or decline winning first prevents a later review/cancellation from claiming success. Availability deletion and all leave audits are driven only by returned changed rows. Audit records retain actual before/after state and actor context.

## Roster integration

Unavailability and pending leave remain explicit Manager warning/override states. Approved leave cannot be overridden. Removed the arbitrary ten-row leave-conflict limit, which could hide approved leave behind pending requests; create/update SQL also rechecks approved leave at write time. Declined/cancelled requests do not influence roster conflicts.

Manager leave cards show factual live/draft and published shift overlaps. Approval does not remove/edit shifts, rewrite publication snapshots, or alter attendance/corrections. Existing published work that overlaps approved leave remains visible for deliberate Manager follow-up.

## Dates and interface

Both APIs return the roster timezone. Initial ranges are calculated server-side from calendar-local today: Availability next 30 days; Leave previous 30 through next 180 days. From/To controls expose other history/future ranges; creating an entry extends the selected range to include it. Form defaults wait for the authoritative timezone. Date-only and part-day wall-clock fields never pass through device timezone conversion.

Both screens refresh after successful, failed or ambiguous mutations. Failed refresh clears stale actionable data and offers retry. Stale reads cannot replace newer results. Status/history, dates, notes and whole/part-day meaning remain explicit. Manager tools remain in Organiser; no navigation or design-system replacement.

## Verification

- Eight focused Stage 8 capability/contract/security-boundary tests are in normal `npm test`.
- `npm run test:staff-stage-8-db` is opt-in via `STAGE8_TEST_DATABASE_URL`; it is pinned to the known non-Production qualification endpoint and never falls back to Production environment variables. Six nested scenarios plus their parent pass against real services/Postgres: concurrent submissions/deletions; own/cross-calendar authority; overlapping/adjacent availability; competing/repeated review; review/cancellation races and audit chains; warning/block/override integration and immutable published history.
- Fresh Neon branch creation was refused by the account branch limit. Tests used new UUID-scoped fixtures on existing `staff-rosters-calendar-first-final-qualify` (`br-steep-wind-a7m3o9et`), with unchanged Availability/Leave schema from migration 0026. This branch is at 0029; 0030 only adds operational-hours settings. Fixtures were removed; no Production records were manufactured or mutated.
- Full regression run: 357 tests, 350 pass, 7 pre-existing source-assertion failures verified against starting HEAD. Previous tests were not edited. Failures: template navigation literal, two handover source assertions, recurring-event approval source assertion, Stage 2 unrostered literal and Fix time label, Stage 3 unavailable-name literal.
- Typecheck passes. Changed-file lint passes. Whole-repository lint retains the pre-existing roster operational-hours effect error plus warnings.
- High-severity audit gate passes; five moderate transitive advisories remain.
- Local build compiles and completes TypeScript, then cannot collect page data without local `NEON_AUTH_BASE_URL`. Vercel Production READY for the exact merged SHA is the mandatory final build gate.
- Responsive fixture-browser verification uses real components and generated application CSS at 320/375/390/430/768/1280px. It does not replace authenticated Production or physical-device testing. Final release evidence is recorded in the completion report.

## Deferred

Stage 9 is Simple Breaks, with proposed migration 0031 requiring explicit owner approval before Production application. Stage 10 is Mobile, Accessibility, Security & Production Qualification. Neither stage is started here; existing broader lint/test debt is recorded without weakening tests or expanding Stage 8 into unrelated repairs.
