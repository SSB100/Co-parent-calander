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

Verification milestone: the first refinement commit eb9bf30 passed hosted lint, full TypeScript, 629 configured tests, audit and production build (run 36823002499). Browser QA exercised Personal date keyboard navigation, Social member/viewer boundaries and Escape, Facilities next-start focus and exact 8:07 confirmation, available/unavailable filtering, Salon candidate filtering and failed-submit recovery, and organiser Back/Forward. Synthetic layouts were inspected at 1440×900, 1100×560, 1000×700, 1440×480, 390×844 and 320×568. This found and corrected compressed Personal context controls, clipped month summaries and calendar overflow affecting booking controls. The QA-only branch contains fabricated records and intercepts mutations; it must never be merged into production. Browser controls lack native viewport resizing, so these are exact CSS iframe viewports, not physical-device tests. Final responsive commit CI and exact deployment verification are recorded in PR #142. Live database suites and authenticated write journeys remain separate from these fixture checks.


## Calendar identity and mobile navigation checkpoint, 1 October 2026

Follow-up to PR #142: match the co-parenting calendar’s colourful rounded tiles and balanced spacing. Personal and Social now use softly coloured day cells with white date markers. Booking timetables keep their occupancy meanings with clearer teal/violet surfaces. Canonical Covie branding is visible above mobile calendar pages and standalone Personal/customer views.

Mobile navigation: Personal has Month, Agenda, Attention and Calendars. Shared template calendars use Calendar, Personal, Updates and role-filtered Organiser tools; members without tools get three equal destinations. Staff keep their existing My roster/Timesheet/Leave/Updates destinations; manager secondary destinations remain directly accessible on desktop and move into the mobile Organiser menu. Footer menus open above navigation, safe-area padding remains, and the footer hides for the mobile keyboard. No domain, permission or scheduling changes. Co-parenting stays the reference and its components are unchanged.

Verification is recorded in the follow-up PR; the synthetic browser harness remains separate from production.


## Personal desktop fit checkpoint, 1 October 2026

Personal now uses the co-parenting shell as the desktop reference: a branded left rail contains view navigation, calendar links, source/timezone controls and the selected-day/attention context. The remaining width is dedicated to the month. Desktop grid height uses the available dynamic viewport; month rows divide the remaining space with 44px minimum day targets, while long sidebar content and agenda/overview lists scroll independently. Mobile keeps its logo, footer and details below the month. No shared styles, domain logic or source actions change. Browser and hosted release evidence is recorded in the follow-up PR.

## Owner setup readiness, 8 October 2026

Owner calendars now retain type-specific setup guidance in their selected-day sidebar, independently of the dismissible first-run guide. Expanded checklists scroll in the existing sidebar without reducing the calendar canvas. Readiness is derived from the current authorized snapshot, not a new saved task record: manual settings/member reviews are labelled as untracked; Social counts describe only the loaded month; Facilities counts exclude archived resources.

Salon distinguishes configured internal booking basics from online service/practitioner/hours configuration and the saved client-page enabled state. Its next action leads to the missing existing form. Booking settings offers a private saved-display preview, and copy/open booking-link controls only when the saved page is enabled. The website integration is a normal external Book now link to the existing authenticated booking flow. The preview does not request live slots, publish the page, expose client/private appointment data, or create bookings. The booking service remains authoritative for current memberships and exact availability. Back, Close, Escape, refresh and loss of owner access withdraw nested previews.

Staff Team distinguishes roster profiles, linked accounts, active invitations awaiting acceptance and profiles without account access. Active staff/manager counts exclude the owner. An invitation alone does not prove access, expired invitations do not remain pending, and optional locations/leave do not claim completion. The owner summary is withheld after failed refresh. Account linkage and roster publication are separate steps.

No database/API/auth/permissions/embedding/recurrence changes are included; no live records or invitations are created by this qualification. Existing co-parenting and Personal workspaces are unchanged.

Verification: new model/DOM cases cover dependency order, private versus enabled state, clipboard failure, private-data projection, saved versus unsaved details, dismissal/history, failed revalidation and role reduction. The browser harness in `tests/browser/owner-readiness` uses actual components and CSS with fabricated read-only transport; it defines 36 cases across desktop, short and narrow viewports. Local browser execution is blocked by runtime socket restrictions and a disconnected cloud browser. Exact-lockfile hosted checks and screenshot review are release gates. Local dependency install/typecheck attempts hit shared memory pressure; copied development dependencies are used only for preliminary checks, not as exact-lockfile release evidence.
