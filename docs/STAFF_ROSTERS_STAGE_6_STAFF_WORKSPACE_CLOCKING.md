# Staff Rosters Stage 6 — Staff workspace & clocking qualification

Stage 6 qualifies the ordinary Staff-controlled daily experience without redesigning the Manager roster builder or expanding timesheet correction workflows.

## Scope

The Staff workspace remains separate from the Manager calendar experience and prioritises:

1. current server-authoritative clock state
2. today's published work
3. Clock in / Clock out
4. personal published roster
5. direct access to My time, Leave and roster updates

The Manager navigation hierarchy remains Calendar, Updates and Organiser. Staff never receives Manager Organiser, Team or Roles & locations access.

## Published roster boundary

Staff roster reads continue to select published-shift snapshots. Manager draft shifts remain visible only to Manager/Owner capabilities.

Clock matching also reads `staff_roster_published_shifts` joined to the selected calendar's publication. Browser-supplied member, shift or clock-session identity is not accepted by the clock action contract.

## Clock-in qualification

Clock-in policy now has an executable pure qualification boundary for:

- normal published-shift clock-in
- explicit unrostered confirmation
- duplicate active-session rejection

The authenticated selected-calendar membership is still resolved server-side to the Staff profile. Inactive Staff profiles are rejected by the existing member boundary.

The existing database partial unique index remains the final concurrency invariant preventing more than one active clock session per Staff profile.

## Clock-out qualification

Clock-out now performs the own-session end transition and its audit record as one data-modifying SQL statement.

The update is constrained by:

- selected calendar
- authenticated linked Staff member
- `clock_out_at IS NULL`

If no active own session is changed, the request does not report a false success. Completed clock rows are retained for the existing timesheet path.

## Client state and connection ambiguity

The Staff workspace does not infer clock status from browser state.

It:

- loads clock status separately from the personal roster
- shows an explicit clock-status loading state
- withholds Clock in / Clock out until server state is known
- re-reads the clock endpoint after successful mutations
- re-reads after an ambiguous/failing mutation response
- removes stale clock state if the authoritative re-read also fails
- offers a direct retry action

No optimistic clock-in or clock-out state is introduced.

## Self-service access

The Staff landing workspace now includes direct bounded links to:

- My time
- Leave
- Roster updates

Existing Staff navigation and server route guards remain authoritative.

## Database

Stage 6 introduces no schema change and no migration.

Production must remain on migration `0030`.

## Qualification coverage

`tests/staff-rosters-stage-6.test.ts` covers:

- Staff viewer / Manager editor capability boundaries
- rostered, unrostered and duplicate clock-in policy
- browser identity stripping from clock actions
- published-vs-draft separation
- selected-calendar / linked-Staff identity binding
- inactive Staff rejection
- active-session database uniqueness
- atomic repeated clock-out behavior
- authoritative refresh/recovery behavior
- Staff navigation and direct-route Manager guards
- existing own-timesheet published-work boundary
- absence of mock workforce records

All Stage 1–5 tests remain part of the normal `npm test` command.
