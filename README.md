# Co-parent Calendar

A mobile-first shared calendar for two co-parents to manage parenting assignments, handovers, repeating schedules, shared events, and read-only viewer access.

## Status

The application is database-backed and deployed from `main`. Milestones 1–8 and Node.js runtime parity are complete; Milestone 9 covers final production qualification.

Production is the Vercel project `co-parent-calander`, linked to `SSB100/Co-parent-calander`.

## Stack

- Node.js 24.x
- Next.js 16 App Router and React 19
- TypeScript and Tailwind CSS
- Neon Postgres and Drizzle ORM
- Zod and date-fns
- Vercel

## Local setup

Requirements:

- Node.js 24.x
- npm
- a Neon Postgres database

Install dependencies and create the local environment file:

```bash
npm install
cp .env.example .env.local
```

On Windows PowerShell, use `Copy-Item .env.example .env.local` instead of `cp`.

Configure:

- `DATABASE_URL` — server-only Neon Postgres connection string
- `APP_SECRET` — long, random application secret; never expose it to the browser
- `NEXT_PUBLIC_APP_URL` — canonical application URL, such as `http://localhost:3000` locally

Start the development server with `npm run dev` and open `http://localhost:3000`.

## Access and data model

Editor and viewer links use separate cryptographically random tokens. Only token hashes are stored. Redeeming an editor link creates a secure HTTP-only session; viewer links remain read-only and can be revoked or regenerated.

The schema is in `lib/db/schema.ts`. SQL migrations are in `drizzle/`:

- `0000_initial.sql` creates the application schema.
- `0001_nullable_assignment_parent.sql` supports explicit cleared recurring overrides.

Parenting assignments are stored per child and calendar date. Full-day dates use Postgres `DATE`; session and audit timestamps are timezone-aware.

Database commands:

```bash
npm run db:generate
npm run db:migrate
npm run db:studio
```

Inspect production schema state before running migrations. Never commit `.env.local` or a live database connection string.

## Verification

Run the same gate used by GitHub Actions:

```bash
npm install --no-audit --no-fund
npm run lint
npm run typecheck
npm test
npm run build
```

GitHub Actions runs this gate on pushes to `main`, pushes to `build/**`, and pull requests. Vercel deploys production from `main`.

## Implemented capabilities

- month navigation and Today jump
- single-day, range, and multi-day parenting assignments
- clearing assignments and undoing the latest bulk change
- handover time, location, and notes
- fortnightly recurring schedules, previews, end dates, and manual overrides
- shared events
- revocable read-only viewer links
- calendar settings and activity history
- responsive keyboard, touch, and dialog accessibility
