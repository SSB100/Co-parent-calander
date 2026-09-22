# Covie calendar template shells

This stage establishes the shared shell for Covie's additional calendar types before deeper domain behaviour is built.

## Authority

1. **Covie Brand Bible v2.0** is the UI and interaction source of truth.
2. **Calendar Template Specifications v0.1** defines the product boundaries and documented domain behaviour.
3. The manifests in `lib/templates/calendar-templates.ts` translate those sources into implementation data.
4. Feature-specific behaviour must stay inside those boundaries.

The shell stage deliberately does not add a database column, migrations or live domain records. It can therefore be reviewed on a Vercel Preview deployment without touching the production database.

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

## Shared implementation

The preview shells reuse:

- `CoviePage`
- `CoviePageHeader`
- `CovieCard` / `CovieStrongCard`
- `CovieStatusBadge` / `CovieNotice`
- `CovieDialog`
- `CovieInput` / `CovieSelect`
- `WorkspaceNav`

`WorkspaceNav` now accepts template-specific primary and Organiser items while retaining the current co-parenting defaults.

## Preview routes

- `/calendar-types`
- `/calendar-types/staff-rosters`
- `/calendar-types/shared-facilities`
- `/calendar-types/social-groups`

The create dialogs are intentionally non-persistent. They show the form geometry and interaction pattern only. Persistence, permissions and domain rules come in the detailed template passes.
