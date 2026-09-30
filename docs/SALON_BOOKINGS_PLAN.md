# Salon bookings

## Manifest and first complete slice

Salon is an optional calendar preset with a business workspace and a separate opt-in client booking view. The primary entity is an appointment with one service and one practitioner. Practitioners have stable identities distinct from confirmed/cancelled state. Coral primary actions, Teal + Violet accents, canonical Covie pages/forms/dialogs and calendar-first day/time selection apply. Owner/manager tools: Team, Services, Booking settings. Practitioners see My appointments and their own hours/time off. Clients see services, eligible practitioners and available slots, then their own appointments only.

The business owner controls business booking settings/publication and can invite managers or practitioners. Managers can invite practitioners; only the owner grants manager authority. Active practitioners can work across independent businesses. Joining Salon never creates or changes a co-parent profile. There are no payroll, commission, accounting, POS, stock, marketing or payment features.

Scheduling intersects a practitioner's weekly hours, date-specific time off/busy blocks, service eligibility, service duration and before/after buffers. Published availability is disabled by default for the business and practitioner. The owner explicitly enables the business booking page and decides which practitioner profiles are offered. A public page exposes only an allowlisted business/service/practitioner/available-slot projection. It never exposes membership IDs, other client bookings or contact details, notes or source busy reasons. Public controls do not read unrelated Covie calendars.

Clients sign into their existing Covie account to create/manage appointments. Bookings are associated with verified authenticated user IDs, not email matching or calendar membership. The booking form clearly identifies the business/practitioner receiving the submitted name/contact details. The implementation does not enable publication or send real client messages on the user's behalf. Transactions revalidate eligibility/rules/current membership/public toggles and lock the practitioner before overlap checking. Retries retain an idempotency key. Rescheduling is atomic and keeps the old booking if the replacement slot fails. Appointment service name, duration, buffers and optional displayed price are snapshots; edits to the menu never rewrite booked terms.

Personal adapters add only appointments assigned to the current practitioner or booked by the current client. Their private projection does not change public bookability or automatically share cross-calendar busy data. Public-off businesses still allow clients to view/manage their own existing bookings within the policy.

## Migration 0035

Add `salon_bookings` to the existing `calendar_type` enum. Add nine domain tables:

1. `salon_settings`: business publication/display details, lead time/horizon, slot interval and cancellation policy
2. `salon_practitioners`: account membership link, owner/manager/practitioner role, active/bookable flags and public display name
3. `salon_services`: service name, duration, before/after padding, optional displayed price/currency and active/bookable flags
4. `salon_practitioner_services`: same-calendar practitioner eligibility for services
5. `salon_working_hours`: weekly practitioner local-time intervals
6. `salon_time_blocks`: practitioner time off/busy intervals, private reasons
7. `salon_appointments`: practitioner/service/client identity, service/policy snapshots, appointment interval/status, revision and idempotency key
8. `salon_updates`: appointment change history
9. `salon_invite_roles`: typed roles bound to existing calendar invitation primitives

Foreign keys and guards enforce same-calendar references, current role capabilities, booking-time conflicts and private client ownership. Existing `covie_app` default privileges grant CRUD on these new tables; no credentials, OAuth grants or external payment access are created. The enum addition extends creation options but does not alter existing calendar records. All live co-parent records, memberships, schedules, costs, tasks, parent/child profiles and sync settings remain untouched.

The migration also adds the `(id, calendar_id)` unique key on `calendar_invites` for the typed invite foreign key. Two shared-table row triggers, `salon_membership_serialization` on `calendar_memberships` and `salon_invite_serialization` on `calendar_invites`, run before insert/update/delete. Their `salon_serialize_core_mutation` function locks matching Salon calendar rows so membership and invitation changes serialize against bookings. It performs no row writes and short-circuits all other calendar types. These shared-table changes are part of the production migration approval scope.

## Review and rollout

Qualify on an isolated current-production branch with synthetic users/calendars only. Verify practitioner/client/member isolation, owner/manager invite transitions, public allowlist/toggles, concurrent reservations/rescheduling, padding, hours/time off, DST/invalid times, duplicates/revisions and service snapshot preservation. Keep a fresh current-production rollback branch before any approved production migration. Production enablement and client messages are excluded from the release smoke scope. Paid transactions and processing gaps/multiple services/providers remain later work.

Reference: Timely official staff-access, service, booking-flow, padding and online-booking policy documentation reviewed 2026-09-30. Processing time (the provider can serve someone else) is not padding (provider unavailable); this initial slice conservatively reserves the full appointment plus its padding.

## Qualification on 30 September 2026

The isolated branch passed 28 Salon database tests covering authority, conflicts, concurrent changes, service snapshots, expected terms, idempotency, private client management, invitations, DST and non-Salon preservation. Four Personal-Salon projection checks passed, including client-only accounts, assigned practitioners, internal-name/contact exclusion and publication withdrawal. Existing co-parent fingerprints were unchanged.

The release suite passed 520 tests, including seven component DOM regressions and four authentication/error-diagnostic cases. Typecheck, lint, dependency audit and hosted production build passed. Eight existing lint warnings and moderate development-tool audit findings remain. Component tests cover interrupted retries, refreshed booking terms, reviewed confirmation versions, practitioner links, keyboard selection, failed access revalidation and an open editor during role demotion.

Migration `0035` was specifically approved and applied atomically after isolated qualification and a verified current-production rollback branch. Its ledger, nine tables, shared-table Salon-only triggers and runtime table/function ACLs were checked. No credentials or existing co-parent records were changed.

The owner selected production-first release after the code, test and database gates. [PR135](https://github.com/SSB100/Co-parent-calander/pull/135) deployed as `8046f5d06fc46a276f8dc8cdfffdb3c753b6fe54`, with the final PR and main CI both passing. Environment variables were left unchanged. Production qualification used only a newly labelled QA Salon: owner practitioner setup, a private service and eligibility, weekly hours, day/slot booking, occupied-time and buffer exclusion, rescheduling, Personal projection/source navigation, reload and Back/Forward, cancellation and retained history all passed. Cancellation removed the appointment from Personal; the QA calendar has no active appointments and remains unpublished. Anonymous booking access correctly returned 404. No error or fatal logs appeared during the qualification window.

This live check covers the owner workflow. Practitioner/client isolation and concurrent changes were qualified with isolated database and component tests; separate live accounts and public business publication were not used. No external invitations, client messages or payments were performed. Live co-parenting data remains untouched.
