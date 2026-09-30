# Shared Facilities

## Template manifest and release boundary

The existing `shared_facilities` manifest in `lib/templates/calendar-templates.ts` remains authoritative for template identity. This implementation fills its existing three organiser tools: Resources, Booking rules and Members. It uses Violet + Teal accents, Coral primary actions, and canonical Covie controls/dialogs. A booking is the primary entity; resource identity, membership identity and booking status remain distinct. Mobile presents a resource-filtered day schedule and personal bookings without hiding the selected date or resource.

Owners administer resources, booking rules and membership. Resource managers organise only their assigned resources; they retain ordinary member booking access to other resources but cannot view the membership roster or invite people. Editors are members: they reserve and manage only their own bookings within the rules. Viewers can see availability but cannot book. Other members' bookings reveal only their occupied time by default; an owner can explicitly enable shared titles. Notes and account identifiers stay private to the booking owner and calendar owner. Pending requests are visible only to their creator and owner and do not reserve a slot. Only confirmed bookings occupy a resource, with database-serialized overlap protection. Owners approve or decline requests; approval rechecks conflicts.

Migration 0033 is additive and isolated: facility settings, resources, bookings and change history. It does not modify co-parenting or Staff domain records. Production application needs separate approval after qualification on a production clone. Existing calendars get default rules lazily on the first owner save or booking, not automatic membership or visibility changes.

Initial rules: calendar timezone, local opening/closing hours, open weekdays, minimum/maximum duration, minimum notice, advance window, cancellation cutoff, maximum active member bookings, optional approval and anonymous/shared-title visibility. Resources can be archived with history retained. Booking edits are version-checked; calendar membership and type are checked server-side for every request.

Paid/public checkout and recurring bookings remain separate integration work. This release accepts no payment, creates no payment-account credentials and exposes no public booking endpoint. Google Calendar remains the existing optional one-way co-parenting integration; this template does not imply a new sync integration.

## Qualification

Run the standard release gate plus `node --import tsx --test tests/shared-facilities.test.ts tests/calendar-sharing.test.ts`. Apply `0033_shared_facilities.sql` only to a verified development branch first. Database qualification must exercise concurrent overlaps, resource/calendar mismatch, member ownership, duplicate saves, approval conflicts, private projections, closed hours, duration/advance/cancellation limits and archive preservation.

## Calendar-first booking

Availability starts with a resource, an interactive month/day picker, and available start-time buttons. The chosen booking length determines each end time. Busy starts are visibly disabled. Confirmation shows the resource, local date, time, duration and timezone; title and notes are optional. Existing bookings retain their edit form.

The planner uses the complete selected-day occupancy, not the capped upcoming list. Date/resource changes invalidate open selections, and refresh failures block confirmation. Availability, rules and permissions are checked again immediately before submission, then authoritatively in the existing server transaction. A confirmation keeps the same request ID through retries.

Clock-change gaps, repeated local times and intervals crossing a timezone offset change are omitted because the current API accepts local times without an offset selector. This is explained beside the slots. Keyboard arrow keys move through days, mobile stacks the calendar above two-column time choices, and the existing cancellation and approval rules remain in force.

The aggregate suite includes `tests/facility-slots.test.ts` for stale selection, overlap/gap boundaries, booking rules, timezone/DST and same-tick submission protection. No schema or API change is required for this refinement.
