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
