# Covie calendar template shells

This stage establishes the shell architecture for Covie's additional calendar types before deeper domain behaviour is built.

## Authority

1. **Covie Brand Bible v2.0** is the UI and interaction source of truth.
2. **Calendar Template Specifications v0.1** defines the product boundaries and documented domain behaviour.
3. The manifests in `lib/templates/calendar-templates.ts` translate those sources into implementation data.
4. Feature-specific behaviour must stay inside those boundaries.

The shell stage deliberately does not add a database column, migration or live domain record. Shipping the shell routes therefore does not alter the existing co-parenting data model.

## Architecture boundary

The existing co-parenting calendar is the proven product and is intentionally left on its current architecture:

- `app/calendar`
- `components/calendar`
- `components/workspace/workspace-nav.tsx`
- existing parenting, child, shared-cost and task services

The additional calendar families live behind their own implementation boundary:

- `app/calendar-types`
- `components/templates`
- `lib/templates`

The new calendars use `TemplateWorkspaceNav` rather than changing the co-parenting `WorkspaceNav`. Future work on roster, facilities and social-group navigation or shell behaviour should stay inside the template boundary.

Shared Covie Core primitives are still reused deliberately. Typography, colour semantics, forms, dialogs, cards, accessibility rules and responsive interaction grammar remain common product infrastructure as required by the Brand Bible.

A change should touch existing co-parenting feature code only when it is an intentional Covie Core improvement that should affect every calendar family.

## Shells

### Staff Rosters

- Accent pair: Teal + Sunshine
- Primary scheduled entity: Shift
- Identity: staff member / team / location
- Primary action: Create shift
- Organiser: Team / Availability / Roles & locations
- Schedule shell: staff rows across days
- Boundary: no payroll, wages, time clocks, HR, recruitment or performance management

### Shared Facilities

- Accent pair: Violet + Teal
- Primary scheduled entity: Booking
- Identity: resource / member / customer
- Primary action: Book resource
- Organiser: Resources / Booking rules / Members
- Schedule shell: resource lanes across time slots
- Boundary: paid bookings are optional within Facilities; this is not a venue ERP

### Social Groups

- Accent pair: Coral + Violet
- Primary scheduled entity: Event / activity
- Identity: group / member
- Primary action: Create event
- Organiser: Members / Availability / Group settings
- Schedule shell: shared event calendar
- Boundary: no payments and no social-network features in the initial template

## Category mapping at shell stage

The Brand Bible requires explicit category colour mapping. The source specifications do not yet define detailed categories for the three new templates, so the shells intentionally use one explicit default category per primary scheduled entity:

- Staff Rosters: Shift → Teal
- Shared Facilities: Booking → Violet
- Social Groups: Activity → Coral

These are shell baselines, not a hidden expansion of the product specification. Detailed categories should be decided during each template's feature pass and then updated in the manifest.

## Shared Covie Core used

The additional calendar shells reuse canonical Covie primitives:

- `CoviePage`
- `CoviePageHeader`
- `CovieCard` / `CovieStrongCard`
- `CovieStatusBadge` / `CovieNotice`
- `CovieDialog`
- `CovieInput` / `CovieSelect`
- Covie typography, palette, focus, spacing and mobile keyboard rules

Their app chrome and template behaviour remain isolated in `components/templates`.

## Routes

- `/calendar-types`
- `/calendar-types/staff-rosters`
- `/calendar-types/shared-facilities`
- `/calendar-types/social-groups`

The create dialogs are intentionally non-persistent in this shell stage. They demonstrate the form geometry and interaction pattern only. Persistence, permissions and domain rules come in the detailed template passes.
