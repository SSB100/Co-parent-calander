# Legacy authentication retirement

Covie now uses Managed Neon Auth plus `calendar_memberships` for application access.

The former token/session authentication path is retired in application code and recorded by staged migration `0014_retire_legacy_auth.sql`.

## Runtime retirement

The application no longer authenticates through:

- `/access/editor/[token]`
- the `coparent_session` cookie
- legacy setup links
- legacy editor-session records

Old editor-link URLs redirect to managed sign-in and cannot create a legacy session.

The old setup API returns HTTP 410 with guidance to use the Covie dashboard.

## Recovery data retained

Migration `0014` is deliberately non-destructive.

It does **not** drop or delete:

- `access_tokens`
- `sessions`
- `access_token_type`
- calendars
- participants
- children
- parenting schedules or assignments
- events
- expenses
- responsibilities
- attachments
- audit history

The legacy credential tables are no longer part of the application runtime schema, but they remain in Postgres temporarily as recovery evidence for calendars that have not yet been attached to a Managed Neon Auth membership.

Legacy credentials must not be re-enabled for normal authentication.

## Recovery process

If a legacy-only calendar must be recovered:

1. identify the intended calendar and account owner
2. confirm the participant that should be linked to the account
3. create an explicit `calendar_memberships` record
4. verify the account can access the intended calendar through Managed Neon Auth
5. record the administrative recovery in audit/history where appropriate

Once every legacy-only calendar has either been recovered or explicitly approved for archival, a later migration may remove the retained credential tables and enum.

## Release verification

Before applying `0014` to Production:

1. confirm the current application does not read legacy token/session records
2. confirm the migration contains no `DROP TABLE`, `DROP TYPE` or credential-row deletion
3. apply `0013` before `0014`
4. confirm modern create/join/invite flows still work after migration
5. confirm legacy editor links no longer authenticate
6. confirm legacy credential row counts are unchanged
7. confirm calendar/domain row counts are unchanged
