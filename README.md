# Co-parent Calendar

A small, mobile-first shared calendar for co-parents. People create an account with an email and password, create or join a calendar with a one-use code, and can install the site on iPhone, iPad, or Android as a web app.

Production is the Vercel project `co-parent-calander`, deployed from the `main` branch of `SSB100/Co-parent-calander` and backed by Neon Postgres.

## Product flow

- The public home page only offers log in and sign up.
- Email/password accounts are available immediately; email verification is not required.
- A signed-in user can create a calendar or join one with a unique invitation code.
- The calendar owner decides whether an invitation grants full editing or view-only access and can change that permission later.
- Invitation codes are hashed in the database, expire after 30 days, and can be redeemed once.
- Password reset email is handled by Neon Auth.
- The app manifest and service worker provide installation support without caching private calendar data.

## Local setup

Use Node.js 24 and npm. Copy `.env.example` to `.env.local`, then configure:

- `DATABASE_URL` — server-only Neon Postgres connection string
- `NEON_AUTH_BASE_URL` — the Managed Neon Auth endpoint for the same database branch
- `NEON_AUTH_COOKIE_SECRET` — a long random authentication-cookie secret
- `APP_SECRET` — legacy token secret retained while existing calendars are moved to accounts
- `NEXT_PUBLIC_APP_URL` — canonical site URL

Install and start with `npm install` and `npm run dev`.

## Database

Schema definitions live in `lib/db/schema.ts`. SQL migrations are in `drizzle/`:

- `0000_initial.sql` creates the original calendar schema.
- `0001_nullable_assignment_parent.sql` supports cleared recurring overrides.
- `0002_account_memberships.sql` adds account memberships, permissions, and invitation codes.\n- `0003_half_day_assignments.sql` adds split-day parenting support.\n- `0004_google_calendar_sync.sql` adds per-user Google Calendar sync state and the sync outbox.\n- `0005_approval_engine.sql` adds the reusable proposal lifecycle, history, and pending-conflict protection.

Inspect the target database before applying a production migration. Never commit `.env.local` or live credentials.

## Verification

Run the full release gate:

```bash
npm install --no-audit --no-fund
npm run lint
npm run typecheck
npm test
npm run build
```

GitHub Actions runs the same gate on pull requests and pushes to `main`; Vercel deploys production from `main`.
