# Legacy authentication retirement

Covie uses Managed Neon Auth plus `calendar_memberships` for application access.

The former token/session authentication path was retired from runtime code by migration `0014_retire_legacy_auth.sql` on 19 September 2026.

## Final cleanup

After the account migration was validated, the retained recovery credential tables were no longer needed by the current application.

Migration `0017_remove_retired_schema.sql` removes:

- `access_tokens`
- legacy public-schema `sessions`
- `access_token_type`

It also removes the first-generation recurring schedule storage that had already been migrated into first-class parenting schedules by migration `0013`:

- `recurring_rules`
- `recurring_rule_children`
- `parenting_assignments.recurring_rule_id`
- `parenting_assignments.source`
- `assignment_source`

The active schedule model remains:

- `parenting_schedules`
- `parenting_schedule_slots`
- `parenting_schedule_children`
- `parenting_assignments` for manual date overrides only

## Current authentication boundary

The application does not authenticate through:

- `/access/editor/[token]`
- the `coparent_session` cookie
- legacy setup links
- legacy editor-session records
- public share tokens

Old editor-link URLs redirect to managed sign-in and cannot create a legacy session.

The old setup API returns HTTP 410 with guidance to use the Covie calendar/account flow.

## Production verification before cleanup

Before preparing migration `0017`, Production was checked to confirm:

1. there were exactly two active Neon Auth users with calendar membership;
2. both active users were marked email verified;
3. no persisted parenting assignment referenced `recurring_rule_id`;
4. no persisted parenting assignment used the retired `recurring` source;
5. the first-class parenting schedule tables contained the migrated schedule data; and
6. the cleanup migration applied successfully on an isolated Neon migration branch without changing active schedule or manual assignment row counts.
