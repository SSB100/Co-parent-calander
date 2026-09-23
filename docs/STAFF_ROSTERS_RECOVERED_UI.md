# Staff Rosters recovered UI brief

This follow-up implements the original UI request in the archived “Continue Neon Migration” conversation (`6ab26041-e1cc-83ec-99c3-c6fcb798a138`) after the Stage 10 Production checkpoint. It changes presentation and onboarding while retaining the qualified Staff Rosters services, historic records, and Owner/Manager/Staff authority rules.

## Product changes

- Manager navigation has direct Calendar, Approvals, Team, Leave, Locations, and Time & attendance destinations. The old Organiser landing page redirects to Calendar. Staff retain My roster, Timesheet, Leave, and Updates. Approvals links to the existing leave and correction review screens while keeping the roster update history available.
- The visible Leave and Locations screens no longer offer Availability or custom job-role controls. Their existing records, API contracts, conflict checks, and audit history remain intact; no rows are removed.
- The Week calendar keeps its full 24-hour schedule and operational-hours crop. Copy previous week and Publish/Send updates sit beside Hours. The separate header Create shift action is removed. Managers can still drag a Staff tile onto the timeline, click an empty time slot, or use the mobile day action to create a shift. The Week arrows and Today occupy the Staff rail heading on desktop; Month and mobile navigation remain in the calendar header.
- Clicking a Staff tile opens a profile with private Manager-only contact details and assigned versus expected weekly hours. Team manages the durable contact and expected-hours values. Manager calendar days show actual clock-in and clock-out points in the roster timezone. Manager Timesheets can download the current team's report as CSV; cells are quoted and spreadsheet formulas are escaped.
- Creating a Staff Rosters calendar asks for the workplace name and initial Staff names. The calendar, owner membership, initial Staff profiles, and audit event are written in one transaction.

## Proposed migration 0032

The existing `staff_roster_members` table has no contact email, contact phone, or expected weekly hours. These cannot be saved reliably in existing columns or inferred for unlinked Staff. `0032_staff_roster_profile_details.sql` adds three nullable columns and one bounded-hours check. It does not change existing values, keys, memberships, shifts, attendance, or audit rows. Existing Staff profiles receive nulls. A new profile or edit can populate them after release.

Migration 0032 executed successfully on fresh Production-derived Neon branch `staff-recovered-ui-0032-qualify-2026-09-23` (`br-gentle-surf-a7fd8qb6`): three columns, one constraint, migration ledger 0032, and 10 Staff profiles remained. Production branch `br-quiet-sea-a7duq4r3` was checked separately and remained at migration 0031 with zero of these columns. **Do not apply 0032 to Production without explicit owner approval.**

Apply 0032 before releasing code that reads the new columns. Take and compare a fresh Production fingerprint snapshot before and after. The schema rollback is to return application code to the exact pre-release SHA while preserving the additive columns and any newly entered contact data. A destructive `DROP COLUMN` is not an acceptable routine rollback. Keep the rollback Git branch from the exact pre-merge Production SHA.
