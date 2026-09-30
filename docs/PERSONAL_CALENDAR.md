# Personal calendar

## Manifest

Personal is an account-private projection across optional Covie calendars. It is not a shared calendar type or a new membership container. A source commitment is the primary entity; source calendar identity remains visible and distinct from confirmed, tentative, care/background and needs-attention states. Coral remains the primary action. The overview uses canonical Covie page, controls, cards and dialogs, Fraunces/Geist, and solid brand colours.

First release: interactive month/day and agenda, source filter, explicit timezone, confirmed commitments, tentative plans, care context and a separate needs-attention list. A source button rechecks current membership and opens the authoritative workspace. Source items are never copied or edited from Personal. There is no migration, persistent preference, new sharing or automatic source-calendar change on arrival. Existing login/default-calendar routing remains unchanged during initial verification.

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
