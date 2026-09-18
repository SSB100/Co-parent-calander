# Approval engine

> **Current release status — 18 September 2026:** This feature is live in Covie Production and its required migration(s) are already applied through production schema version `0011`. Any older “do not apply”, “GitHub-only”, or “not yet deployed” wording below is retained only as historical phase context and is not the current operating state.

Phase 1 introduces the reusable shared-agreement foundation. It does not change any existing calendar, event, handover or Google Calendar behaviour yet.

## Lifecycle

- Draft
- Waiting for approval
- Agreed
- Declined
- Withdrawn

The database stores the internal status as `approved`; user-facing UI renders that state as **Agreed**.

## Permission rules

- Owners and editors linked to a parent profile may create proposals.
- Viewers may read proposal state and history but cannot create, submit, approve, decline or withdraw.
- A proposal is sent to one specific other owner/editor parent.
- A proposer cannot approve their own proposal.
- Only the designated approver can accept or decline.
- Only the proposer can withdraw a draft or waiting proposal.
- If there is no other linked parent with edit access, a waiting proposal cannot be submitted. A draft may still be saved.

## State model

Every proposal records:

- target entity type and stable entity identifier
- create, edit or delete action
- proposer and approver memberships/parent profiles
- optional proposal reason
- previous agreed state
- proposed state
- lifecycle timestamps
- optional decline reason
- proposal-specific history
- matching audit-log events

The target `entityId` is stored as text on purpose. Calendar features include both UUID-backed records and logical records such as a dated parenting assignment. Phase 2 integrations must use a stable identifier for the same logical item so the pending-conflict guard works reliably.

Only one **waiting** proposal may exist for the same calendar + entity type + entity identifier. Drafts do not block another parent from submitting a real proposal.

## Google Calendar boundary

The proposal engine does not enqueue or execute Google Calendar sync jobs.

Pending or declined proposals therefore have no path to Google Calendar. Phase 2 feature adapters must continue to queue Google sync only after the approved state becomes effective.

## Applying approved changes

Phase 1 deliberately stops at the reusable proposal lifecycle. It does not mutate calendar feature tables.

During Phase 2, each calendar mutation will be converted from immediate mutation to:

1. preserve the currently agreed/effective record
2. create a proposal containing the current and proposed states
3. show the pending proposal alongside the agreed state
4. on approval, apply the feature-specific mutation
5. only then queue the Google Calendar sync for the effective state

The feature adapters must make the approval transition and the target mutation transactional/idempotent so an approved proposal cannot leave the visible agreed state half-applied.

## Migration

`drizzle/0005_approval_engine.sql` adds the proposal enums, proposal table, proposal history table, supporting indexes and the unique waiting-proposal guard.

This migration is committed to GitHub only. It has not been applied to Neon or Production.
