# Shared costs

Covie records shared child-related costs without moving money or connecting to bank accounts.

## Core model

Each agreed shared cost stores:

- a short title
- amount in integer cents
- category and expense date
- optional child
- the parent who originally paid the bill
- an explicit share amount for each parent
- optional due date and note
- a separate paid confirmation for each parent share

The split options remain intentionally simple:

- 50 / 50
- paid by payer only
- custom split

All shares must add up to the full cost.

## Agreement rules

When two active co-parents have linked edit-capable accounts:

- creating a shared cost requires agreement
- editing an agreed shared cost requires agreement
- removing an agreed shared cost requires agreement
- the currently agreed record stays authoritative until the proposal is accepted

A solo Covie user is not blocked when there is no other linked edit-capable parent.

Payment confirmation is deliberately different from editing. It is an operational action and does not create an approval proposal.

## Per-parent payment confirmation

Each parent can update only the paid state of their own `expense_shares` row.

The settlement endpoint does not accept another participant id, so one parent cannot mark the other parent's share paid.

For positive shares:

- an unpaid share has `paid_at = NULL`
- choosing **Mark my share paid** records that parent's `paid_at`
- the same parent can undo their own confirmation with **Mark my share unpaid**
- zero-value shares require no confirmation

The expense remains `outstanding` while any positive share is unpaid.

Once every positive share has a `paid_at` timestamp, the expense becomes `settled` and moves into the Shared Cost archive automatically.

If a parent later marks their own share unpaid, the item becomes outstanding again.

Covie records these confirmations but does not transfer money.

## Editing and payment state

Accepted edits that change the amount, payer or split are financial changes. They reset all share payment confirmations because the amounts being confirmed have changed.

Non-financial edits, such as changing a title, note or due date, preserve the existing per-parent payment confirmations.

Payment confirmation itself is never copied into an edit proposal, so one parent cannot alter the other parent's paid acknowledgement through the approval flow.

## Existing data migration

Migration `0018_expense_share_payment_confirmation.sql` adds `expense_shares.paid_at`.

To preserve existing state:

- previously settled or `not_needed` costs have their positive shares backfilled as paid
- previously outstanding costs remain unpaid
- legacy `not_needed` rows are normalized to archived `settled` records

## Calendar and Home

Shared costs remain linked to their expense/due dates but are not synced into Google Calendar.

Home and workspace summaries use the new paid state when calculating outstanding amounts.

The left **At a glance** / mobile Quick View surface shows actual active tasks and shared costs only. It does not duplicate Tasks or Shared Costs navigation cards; those feature entry points remain in Organiser.

## Verification checklist

1. A parent can mark only their own positive share paid.
2. One parent's confirmation cannot mutate the other parent's share.
3. A 50 / 50 cost remains active after only one parent confirms payment.
4. The cost archives automatically after both positive shares are confirmed.
5. Undoing one parent's own confirmation reopens the cost.
6. Financial edits require approval and reset confirmations after acceptance.
7. Non-financial approved edits preserve confirmations.
8. Create/edit/delete approval behaviour remains unchanged.
9. Day Details and Home show the updated payment state.
10. Shared cost activity creates no Google Calendar jobs.
