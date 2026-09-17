# Google Calendar one-way sync

Google Calendar syncing is optional. Co-parent Calendar remains the authoritative source of truth. The integration does not import Google events and does not replace the existing email/password login.

## Privacy and permission model

- Each authenticated calendar membership connects its own Google account independently. This includes viewer memberships.
- The requested Google Calendar scope is only `https://www.googleapis.com/auth/calendar.app.created`.
- The app creates a dedicated secondary calendar named `Co-parent Calendar — <shared calendar name>`.
- The sync service addresses only that app-created calendar. It does not list, read, import, or modify the user's primary or personal calendars.
- One member's Google connection, token, account information, or personal calendar information is never returned to another member.
- Access and refresh tokens are encrypted at rest with AES-256-GCM using a server-only key.
- OAuth tokens, authorization codes, client secrets, and encryption keys must never be written to logs, audit records, source control, pull requests, or issue comments.
- Notes and shared-event descriptions are excluded by default. Handover locations sync only while that user's Locations setting is enabled.
- Disconnecting gives the user an explicit choice to leave the generated Google calendar in their account or remove it.

## Sync behavior

The sync uses a database-backed desired-state outbox.

Calendar mutations and their Google sync jobs are written in the same database transaction where practical. After a successful app mutation, the server makes a prompt attempt to process due work, but the durable job remains in the database until Google confirms success.

A daily Vercel cron also runs reconciliation and bounded retry processing. The app does not rely solely on the cron: users can select **Sync now**, and ordinary calendar changes enqueue work immediately.

Retry behavior uses exponential backoff beginning at 5 minutes, capped at 6 hours, with a maximum of six attempts for a job. Authorization failures move the connection to **Reconnect required** instead of retrying indefinitely.

The initial managed sync horizon is:

- 90 days in the past
- 18 months in the future

Incremental parenting changes recalculate the affected range plus one adjacent day on either side so consecutive all-day blocks can split and merge cleanly. Full reconciliation deliberately re-applies the authoritative desired state, which repairs missing or manually edited managed Google events.

Google all-day end dates are exclusive. For example, an event covering 18 through 20 September is sent with:

- `start.date = 2026-09-18`
- `end.date = 2026-09-21`

## Environment variables

The app still builds and runs when Google integration is disabled.

Required to enable Google Calendar:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_TOKEN_ENCRYPTION_KEY`
- `NEXT_PUBLIC_APP_URL`

Required for the scheduled reconciliation worker:

- `CRON_SECRET`

`GOOGLE_TOKEN_ENCRYPTION_KEY` must be a base64-encoded 32-byte random key. `CRON_SECRET` should be a separate long random value. Do not reuse `APP_SECRET`, Neon credentials, authentication cookie secrets, Google OAuth credentials, or database passwords.

## Google Cloud setup

1. Create a dedicated Google Cloud project for Co-parent Calendar.
2. Enable **Google Calendar API** under APIs & Services.
3. Configure the Google Auth Platform branding and audience.
4. During development, keep the app in Testing and add only the Google accounts that should test the feature.
5. Under Data Access, add only:
   `https://www.googleapis.com/auth/calendar.app.created`
6. Create an OAuth 2.0 Client ID with application type **Web application**.
7. Register every callback URL exactly. Google OAuth redirect URIs do not use wildcard subdomains.

Recommended callback URLs:

- Local: `http://localhost:3000/api/google-calendar/callback`
- Current feature-branch Preview: `https://co-parent-calander-git-feature-google-c-1d9c47-haakers-projects.vercel.app/api/google-calendar/callback`
- Other Preview branches: use the exact stable branch/preview domain Vercel assigns.
- Production: `https://co-parent-calander.vercel.app/api/google-calendar/callback`
- If a production custom domain becomes the value of `NEXT_PUBLIC_APP_URL`, register the same `/api/google-calendar/callback` path for that domain.

For preview OAuth testing, use a stable Vercel branch/preview domain, set that exact origin as the Preview value of `NEXT_PUBLIC_APP_URL`, and register its exact callback URL in Google Cloud.

## Google OAuth verification for public use

Before making Google Calendar connection broadly available:

1. Use the appropriate Google Auth Platform audience. Public consumer use normally requires an External audience.
2. Complete the branding information with the real app name, support email, developer contact, home page, privacy policy, and terms URLs as required by the Google console.
3. Verify ownership of authorized domains when Google requires it.
4. Confirm Data Access requests only the narrow `calendar.app.created` scope.
5. Review the Verification Center and follow the verification requirements Google shows for the production OAuth client and requested scope.
6. If Google requests scope justification or a demonstration video, explain and demonstrate that the app creates and manages only its own secondary calendar and never reads the user's personal calendars.
7. Do not add a broader Calendar scope simply to work around an API problem. Review the endpoint or architecture first.

Google's verification process can change, so re-check current Google Workspace OAuth documentation and the Auth Platform console before public production release.

## Vercel configuration

Use only the personal Vercel project **co-parent-calander**.

1. Open **Settings → Environment Variables**.
2. Add the Google variables and `CRON_SECRET` as protected environment values.
3. Add Google credentials to **Preview** first for development testing.
4. Keep Production Google values unset until the production release has been reviewed and approved.
5. Ensure the Preview environment uses the Neon development database branch rather than the production database.
6. Redeploy the feature-branch preview after environment changes.

Never put secret values in source files or documentation.

## Connection lifecycle

1. A logged-in calendar member opens Settings → Google Calendar.
2. **Connect Google Calendar** starts OAuth Authorization Code flow with CSRF state and PKCE.
3. The callback verifies that the logged-in membership is the same membership that started the flow.
4. Tokens are encrypted server-side and stored on that membership's connection.
5. The app creates the dedicated secondary Google calendar.
6. Initial reconciliation publishes parenting blocks, handovers, and enabled shared events.
7. App changes enqueue durable incremental jobs.
8. **Sync now** queues a full reconciliation.
9. Revoked or expired authorization that cannot be refreshed becomes **Reconnect required**.
10. Disconnect lets the user leave the generated calendar in Google or remove it.

## Intentionally not implemented

- Two-way synchronization
- Importing Google events
- Reading a primary or personal Google calendar
- Google Sign-In
- Sharing one member's Google connection with another member
- Syncing notes unless that member explicitly enables it
