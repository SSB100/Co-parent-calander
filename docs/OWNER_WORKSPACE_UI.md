# Owner calendar workspace review

Scope: Personal, Shared Facilities, Social Groups and Salon Bookings. Co-parenting and Staff Rosters are reference patterns and remain unchanged. Recurring Facilities bookings remain a separate, paused draft.

## Observed baseline

Measured on the production UI in a cloud browser at 1165 × 757 CSS pixels, using isolated QA calendars. The width was 1180 pixels when no vertical scrollbar was present.

| Workspace | Observed page height | Main issue |
| --- | ---: | --- |
| Facilities, complete future day | 2020 px | 53 repeated start-time cards; booking rules below the calendar at y=1866 |
| Salon, service selected | 1540 px | 30 time cards begin at y=589; calendar is a small date picker |
| Social, empty October | 1025 px | Selected-day events begin at y=807, below the viewport |
| Personal Month, empty QA source | 1197 px | Month grid begins at y=435; attention begins at y=1068 |
| Personal Overview, empty QA source | 757 px | Fits only because the sections are empty; populated sections stack vertically |

All three shared-calendar owner screens put their organiser tools in a menu and separate routes. Useful actions should have visible, labelled entries aligned beside the calendar. Compactness must come from hierarchy and layout, not smaller text or hidden controls.

## Social first slice manifest

- Primary entity: group event, with its existing source ID and RSVP state
- Identity: existing group/calendar; Coral and Violet accents; Coral remains the primary action
- Visible tools: Members, Availability, Group settings; one primary Create event action; Refresh, month navigation, Today and cancelled-event filter
- Main view: fluid month grid with an adjacent selected-day panel on sufficiently wide/tall desktops
- Interaction: choose a day, inspect its events, open the existing event dialog; organiser tools open existing forms in Covie dialogs without leaving the calendar
- History: tool overlays use a scoped URL parameter; Back/Forward closes/reopens them; direct tool URLs close in place and preserve source parameters
- Authority: existing server-resolved role and API checks; only owners get this redesigned workspace; demotion/revocation closes owner tools and removes owner-only controls
- States: empty, populated, loading, transient failure, unavailable source and removed access stay explicit
- Schedule unit: existing local calendar day/month; no recurrence or data model changes
- Components: existing Covie controls/dialogs; reusable owner workspace layout and panel-history hook
- Responsive behavior: width and height determine the available calendar canvas; side panel stacks below at narrower widths, and short/zoomed windows use normal document flow; controls remain at least 44px
- Existing direct organiser routes remain available; mobile bottom navigation and other roles retain their existing behavior

## Subsequent slices

1. Facilities: central resource/day timetable, clear busy periods and precise start-time selection, visible Resources/Booking rules/Members/My bookings
2. Salon: central practitioner/day schedule, visible appointment and organiser actions, booking details in a side panel
3. Personal: calendar-centred view with compact Today/attention/upcoming context and visible source controls

Each slice requires role/history regression checks and visual measurements before release. Synthetic browser fixtures establish layout behavior; authenticated production QA establishes real data/API behavior. They are separate kinds of evidence. Actual phone-device testing has not been completed.

## Facilities owner slice manifest

- Primary entity: a persisted resource booking or an exact candidate start returned by the existing slot engine
- Identity: existing resources; Violet and Teal accents, Coral confirmation actions
- Visible controls: Resources, Booking rules, Members, My bookings, Requests to review, Refresh, day navigation, resource filter and booking duration
- Main view: one selected-day timetable with sticky resource/time headers; long days and resource sets scroll inside the calendar canvas
- Scheduling: hour bands group exact candidate starts without rounding or dropping off-grid availability; a precise-start chooser leads to the existing confirmation dialog
- Busy state: confirmed bookings alone reserve time; pending requests stay distinct and remain reviewable through existing authority checks
- Context: selected-day booking summaries and selected booking actions stay beside the timetable; source links retain cancelled/archived booking detail and honest unavailable fallback
- Organising: existing resource/rule/member/request flows open from labelled buttons in Covie dialogs; direct organiser routes and non-owner views retain their current behavior
- Authority: current owner role required; stale selection, changed membership, removed resources and failed refresh disable slot confirmation; denied embedded access clears the parent workspace
- Data: no schema changes, copied events, recurrence, backfill or new permissions
- Responsive behavior: shared fluid owner layout, readable hour bands and at least44px controls; narrow and short windows use natural flow


## Salon owner slice manifest

- Scope: strict `role === "owner"` calendar branch; managers and practitioners keep the existing planner and direct organiser pages
- Visible controls: Team, Services, Booking settings, Updates, Book an appointment, Refresh, day navigation, Today, labelled date/practitioner filters and cancelled appointments
- Main view: practitioner/day timetable with sticky time/practitioner headings, a bounded desktop scroll region and a current authorized appointment detail panel
- Timeline records: service and buffer intervals use the complete `busyStart`/`busyEnd` overlap, exclusive endpoints and actual timezone instants, including DST folds/gaps; inactive and missing profiles with retained records remain visible
- Density and access: one full appointment card at its first displayed row; subsequent rows use compact selectable controls with client identity and exact row segment ranges. Full date, offset, status and practitioner remain in accessible labels. Appointment segments use explicit labels rather than incorrectly proportioned strips within stacked cards
- Privacy: timeline and day summaries project display fields at runtime; contact details, notes and block reasons stay outside the timeline. Selected detail resolves its record against each authorized snapshot, preserving current capabilities
- Booking authority: blank timetable space is descriptive, never an available slot. The existing service/practitioner selection calls the existing slot endpoint; its exact returned candidate opens the existing confirmation. Reviewed terms, versions, request IDs, reschedule and cancellation flows remain authoritative
- Organising: the existing team, services, settings, booking and update content is reused in history-backed Covie dialogs. Back, Forward, Close and direct panel URLs preserve the calendar/source query; leaving a panel drops nested drafts
- Freshness: the owner timeline mounts only when loading has finished and the snapshot date matches the selected date; old private detail is hidden during a day change. Failed revalidation clears the workspace; role reduction closes owner tools and restores the existing non-owner planner
- Source links: Personal-selected appointments remain inspectable even if cancelled or on an inactive profile; removed records show an unavailable message instead of stale details
- Responsive behavior: the shared owner shell supplies remaining viewport height at widths at least 1100px and heights at least 560px. Narrower, shorter and zoomed windows use natural document flow; horizontal timeline overflow stays contained and controls remain at least 44px
- Data: no schema, environment, security, public-booking, recurrence, Staff or co-parenting changes

Focused verification: `npm run test:salon-owner` covers the pure model, timeline DOM and owner page/history/authority flows. The existing Salon schema/slot/interface/component suites also remain relevant. DOM tests do not measure browser layout. Production-first hosted checks and browser QA must separately verify 1440×900, 1100×560, narrow and short windows, zoom, long names, many practitioners, overlapping appointments, selected-detail overflow and keyboard navigation before release is considered verified.

## Creative refinement checkpoint, 1 October 2026

Production screens were inspected in an authenticated cloud browser at 1363 × 936. Personal, Social, Facilities, Salon, co-parenting and Staff were captured. The latter two remain reference-only. Brand Bible v2 takes precedence over older family-only repository wording.

Decisions: calendar-first Personal with adjacent day/attention context instead of a default stacked overview; a month and selected-event panel for Social members with strict owner-only tools; a next-available jump for Facilities owners and available-first member start selection; grouped exact Salon client candidates with time-of-day filtering, retaining the owner timetable handoff. Overview remains an explicit Personal option.

No domain rules, APIs, schema, auth, recurrence or environment changes. Source navigation and existing confirmation/mutation boundaries remain. Time filters classify server-returned instants in the salon timezone and pass the original candidate unchanged. Short/narrow layouts use document flow.

Verification pending: hosted release gate, synthetic browser layouts and interactions, and exact production commit verification. Browser controls lack native viewport resizing; the QA-only iframe harness supplies exact CSS viewport sizes without claiming physical-device testing.

