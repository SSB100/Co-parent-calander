# Co-parent Calendar

A calm, mobile-first shared calendar for two co-parents to see and manage who has the children on each day.

## Current status

Development branch: `build/co-parent-calendar-mvp`

Milestone 1 foundation is in progress. The current UI is an interactive preview shell using local browser state while persistence and secure access are added in the next milestones.

## Product principles

- The month should be understandable within seconds.
- Editing should feel like painting days with each parent's colour.
- Mobile is a first-class interface.
- Read-only viewers never receive edit permissions.
- Important changes are auditable.
- Full-day parenting assignments are stored as calendar dates, not UTC instants.
- Child data is intentionally minimal.

## Stack

- Next.js 16.3.3 App Router
- React 19.2
- TypeScript (strict)
- Tailwind CSS 4
- Neon Postgres
- Drizzle ORM
- Zod
- date-fns
- Vercel-ready deployment architecture

## Data model

The schema lives in `lib/db/schema.ts` and the initial SQL migration is in `drizzle/0000_initial.sql`.

The key design decision is that parenting assignments are stored **per child per date**. The UI may offer an `All children` action, but that action writes one assignment row for every active child. This avoids an ambiguous nullable `child_id` and makes future split schedules safe.

Important tables:

- `calendars`
- `participants`
- `children`
- `parenting_assignments`
- `recurring_rules`
- `recurring_rule_children`
- `events`
- `access_tokens`
- `sessions`
- `audit_log`

Full-day assignments use Postgres `DATE`. The default calendar timezone is `Pacific/Auckland`. Session and audit timestamps use timezone-aware timestamps.

## Access architecture

The planned editor flow is passwordless and link-based:

1. Each parent receives a separate cryptographically random editor invite token.
2. Only a SHA-256-style hash of the raw token is stored.
3. Redeeming the editor link creates a secure HTTP-only session cookie.
4. Editor links and sessions can be revoked.
5. Read-only sharing uses a separate revocable viewer token.
6. All write operations will enforce authorization on the server, not just in the UI.

The current foundation includes the database structures for this flow; the route/session implementation is a later milestone.

## Local setup

Requirements:

- Node.js 20.9+ (Node 22 recommended)
- npm
- a Neon Postgres database when persistence work begins

Install dependencies:

```bash
npm install
```

Copy environment variables:

```bash
cp .env.example .env.local
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env.local
```

Fill in:

- `DATABASE_URL` – Neon Postgres connection string
- `APP_SECRET` – long random application secret
- `NEXT_PUBLIC_APP_URL` – canonical app URL

Run the app:

```bash
npm run dev
```

Then open `http://localhost:3000`.

## Database

Drizzle schema:

`lib/db/schema.ts`

Initial migration:

`drizzle/0000_initial.sql`

Useful commands:

```bash
npm run db:generate
npm run db:migrate
npm run db:studio
```

Do not commit `.env.local` or a live Neon connection string.

## Verification

```bash
npm run lint
npm run typecheck
npm run build
```

GitHub Actions runs these checks for `main`, `build/**`, and pull requests.

## Current UI checkpoint

The calendar shell currently supports preview-only interactions:

- responsive monthly grid
- previous/next month navigation
- Today jump
- accessible Parent A / Parent B visual treatments
- multi-day selection
- bulk assign to Parent A
- bulk assign to Parent B
- clear selected assignments
- selected-state indicators independent of parent colour
- mobile sticky bulk-action controls

Assignments currently live only in browser component state and reset on refresh. This is intentional for the foundation checkpoint.

## Planned milestones

1. Foundation and database architecture
2. Persistent calendar/parent/child data and secure editor sessions
3. Production-quality month calendar and single-day editing
4. Bulk editing, date ranges and undo
5. Secure read-only sharing
6. Handover details and notes
7. Recurring parenting schedules with manual overrides
8. Audit history, settings, accessibility and mobile polish
9. Production qualification and Vercel deployment

## Vercel

The app is structured for standard Next.js deployment to Vercel. Production deployment should happen only after the database-backed MVP passes lint, type checking, tests, build verification, migration checks and a security review.
