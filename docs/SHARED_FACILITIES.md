# Shared Facilities

## Template manifest and release boundary

The existing `shared_facilities` manifest in `lib/templates/calendar-templates.ts` remains authoritative for template identity. This implementation fills its existing three organiser tools: Resources, Booking rules and Members. It uses Violet + Teal accents, Coral primary actions, and canonical Covie controls/dialogs. A booking is the primary entity; resource identity, membership identity and booking status remain distinct. Mobile presents a resource-filtered day schedule and personal bookings without hiding the selected date or resource.

Owners administer resources and booking rules. Editors are members: they reserve and manage only their own bookings within the rules. Viewers can see availability but cannot book. Other members' bookings reveal only their occupied time by default; an owner can explicitly enable shared titles. Notes and account identifiers stay private to the booking owner and calendar owner. Pending requests are visible only to their creator and owner and do not reserve a slot. Only confirmed bookings occupy a resource, with database-serialized overlap protection. Owners approve or decline requests; approval rechecks conflicts.

Migration 0033 is additive and isolated: facility settings, resources, bookings and change history. It does not modify co-parenting or Staff domain records. Production application needs separate approval after qualification on a production clone. Existing calendars get default rules lazily on the first owner save or booking, not automatic membership or visibility changes.

Initial rules: calendar timezone, local opening/closing hours, open weekdays, minimum/maximum duration, minimum notice, advance window, cancellation cutoff, maximum active member bookings, optional approval and anonymous/shared-title visibility. Resources can be archived with history retained. Booking edits are version-checked; calendar membership and type are checked server-side for every request.

Paid/public checkout and recurring bookings remain separate integration work. This release accepts no payment, creates no payment-account credentials and exposes no public booking endpoint. Google Calendar remains the existing optional one-way co-parenting integration; this template does not imply a new sync integration.

## Qualification

Run the standard release gate plus `node --import tsx --test tests/shared-facilities.test.ts tests/calendar-sharing.test.ts`. Apply `0033_shared_facilities.sql` only to a verified development branch first. Database qualification must exercise concurrent overlaps, resource/calendar mismatch, member ownership, duplicate saves, approval conflicts, private projections, closed hours, duration/advance/cancellation limits and archive preservation.
