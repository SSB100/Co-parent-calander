# Personal calendar

## Manifest

Personal is an account-private projection across optional Covie calendars. It is not a shared calendar type or a new membership container. A source commitment is the primary entity; source calendar identity remains visible and distinct from confirmed, tentative, care/background and needs-attention states. Coral remains the primary action. The overview uses canonical Covie page, controls, cards and dialogs, Fraunces/Geist, and solid brand colours.

Personal is the signed-in starting point for new and existing accounts. Default email and Google sign-in land here; explicit invitation and private booking destinations retain priority. `/calendar` still opens the last selected accessible calendar. Arriving in Personal never changes that selection.

The default Overview shows Today, Needs your attention and up to five upcoming confirmed or tentative plans in the selected month. Today is never inferred from a different loaded month. Care is distinct day context and remains available throughout Month and Agenda, without filling the upcoming list. Longer day and attention lists have explicit full-list controls. Source and display timezone remain visible in the collapsed filter control. Month/day keyboard navigation and Agenda remain available.

A source button rechecks current membership and opens the authoritative workspace. Source items are never copied or edited from Personal. There is no migration, persistent preference, new sharing or automatic source-calendar change on arrival. The client resets when the authenticated account changes and rechecks access on refresh, focus and page restoration.

Create or join is optional and accessible from Personal for every account through the existing onboarding flow. Onboarding has a direct return to Personal and keeps invitation entry intact. Co-parenting is an optional type, listed last; no family setup is required to use Personal.

## Inclusion and privacy

- Staff: only published shifts assigned to the current account's active linked roster member. Manager drafts and other staff are excluded.
- Facilities: the account's own confirmed bookings, with its pending requests marked tentative. Other people's reservations are excluded even for owners/managers.
- Social: Going commitments, Maybe plans, and self-created events needing organisation as separate attention items. Creation alone never implies attendance. Declined and cancelled events are excluded from commitments.
- Salon: own client appointments or appointments assigned to the account’s active practitioner profile. Client bookings appear without joining the business calendar; their source opens private appointment management. Client contact details stay at the source.
- Co-parenting: effective care assignments and handovers involving the account's active, same-calendar parent profile; incomplete responsibilities assigned to that profile; outstanding reimbursement shares with an unpaid balance only when the account is not the payer; waiting approvals assigned to the account's membership. Family-wide events without an explicit account assignment are not inferred as personal attendance.
- Archived calendars and removed memberships are excluded. Every source query uses current membership, and source navigation rechecks it. The API uses private no-store responses and never accepts a client-provided user ID. Source filters reduce results, never widen authority.

Care blocks are context and do not generate generic busy-time conflicts. Tentative and attention items never masquerade as confirmed appointments. Amounts, client/contact details, private notes and proposal payloads are not copied into the overview. Expense links say an item needs review rather than asserting a legal debt.

## Time and qualification

Source-local dates stay labelled with their source timezone. Timed commitments use absolute instants and can be displayed in the selected overview timezone. All-day care and due dates remain source-local instead of shifting at midnight. The query window is bounded to one selected month with explicit limits and a warning if capped.

Qualification covers memberships, parent/member links, published-only shifts, own bookings, RSVP states, archived/cancelled exclusion, date/time boundaries, duplicate identity, no write calls, source-navigation authorization and interrupted/repeated UI requests. Production smoke is limited to the new labelled qualification calendars; existing co-parenting records must not be changed.

## Salon extension

Salon client/practitioner projection requires migration0035 and ships with that batch. A client sees only their own appointments, without becoming a calendar member. An active practitioner sees only appointments assigned to them. The source action rechecks these relations and sends clients to private appointment management; practitioners enter the correctly selected business/day. Personal does not copy contact details, publish availability or change any source record.

## Optional calendar setup guidance

Calendar choice includes concrete examples and a short explanation of the selected calendar's purpose. An expandable “What happens next” lists three setup steps before creation. Existing invitation and booking return flows are unchanged.

After creating a non-parenting calendar, its owner sees an inline setup guide with one contextual first action. It is shown only for the explicit creation welcome route, never as a recurring Personal banner. Dismissal or following its action stores only a versioned dismissal flag scoped to the current account and calendar in browser storage. The guide stays hidden during server rendering so a dismissed prompt does not flash back during hydration. Blocked storage falls back to the current tab; no tracking or notifications are added. Co-parenting's existing welcome flow stays separate.
