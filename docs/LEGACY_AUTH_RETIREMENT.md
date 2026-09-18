# Legacy authentication retirement

Covie now uses Managed Neon Auth plus `calendar_memberships` for application access.

The former token/session authentication path is retired in staged migration `0014_retire_legacy_auth.sql`.

## What is removed

The staged migration removes only obsolete credential infrastructure:

- `access_tokens`
- `sessions`
- `access_token_type`

The application no longer authenticates through:

- `/access/editor/[token]`
- the `coparent_session` cookie
- legacy setup links
- legacy editor-session records

Old editor-link URLs redirect to managed sign-in and cannot create a session.

The old setup API returns HTTP 410 with guidance to use the Covie dashboard.

## What is preserved

The migration does **not** delete:

- calendars
- participants
- children
- parenting schedules or assignments
- events
- expenses
- responsibilities
- attachments
- audit history

A calendar that existed only through the old token path therefore becomes inert/archive-only after `0014`, but its domain data remains in Neon.

If an archived calendar must later be recovered, restoration should be explicit: identify the calendar and intended account owner, create a `calendar_memberships` record linked to the correct participant, and audit that administrative recovery. Do not restore legacy token authentication.

## Release verification

Before applying `0014` to Production:

1. confirm any calendar that should remain user-accessible already has an intended Managed Neon Auth membership
2. record which legacy-only calendars are intentionally being archived
3. verify the migration drops only credential/session tables and enum
4. apply `0013` before `0014`
5. confirm modern create/join/invite flows still work after migration
6. confirm legacy editor links no longer authenticate
7. confirm archived calendar/domain row counts are unchanged
