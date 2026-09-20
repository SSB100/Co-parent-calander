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
- the cumulative amount each parent has recorded as paid toward their own share

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

Payment recording is deliberately different from editing. It is an operational action and does not create an approval proposal.

## Per-parent partial payments

Each parent can update only the amount paid on their own `expense_shares` row.

The settlement endpoint does not accept another participant id. The participant is always derived from the signed-in calendar session, so one parent cannot record a payment against the other parent's share.

For each share:

- `share_cents` is the agreed amount that parent is responsible for
- `paid_cents` is the cumulative amount that parent says they have paid so far
- `paid_cents` must stay between zero and `share_cents`
- `paid_at` is set only when `paid_cents` reaches the full share amount
- zero-value shares require no payment

The UI shows the signed-in parent an **Amount you've paid** field. It is the total paid so far, not an additional payment amount. For example, if the share is NZ$100 and the parent has paid NZ$50, they enter `50.00`. If they later finish paying, they change it to `100.00`.

The shared cost remains `outstanding` while any share has `paid_cents < share_cents`.

Once every share is paid in full, the expense becomes `settled` and moves into the Shared Cost archive automatically. Reducing a parent's own recorded amount below their full share reopens the cost.

Covie records these amounts but does not transfer money.

## Editing and payment state

Accepted edits that change the amount, payer or split are financial changes. They reset per-parent payment progress because the agreed amounts have changed.

Non-financial edits, such as changing a title, note or due date, preserve existing per-parent payment progress.

Payment amounts are never copied into an edit proposal, so one parent cannot alter the other parent's payment record through the approval flow.

## Existing data migrations

Migration `0018_expense_share_payment_confirmation.sql` introduced per-parent completion timestamps.

Migration `0019_expense_share_partial_payments.sql` adds `expense_shares.paid_cents` and makes partial progress first-class.

To preserve existing state:

- shares already marked fully paid are backfilled with `paid_cents = share_cents`
- outstanding unpaid shares start at zero
- existing expense archive state is recalculated from the per-share balances

## Calendar and Home

Shared costs remain linked to their expense/due dates but are not synced into Google Calendar.

Home and workspace summaries calculate outstanding amounts from `share_cents - paid_cents`.

The left **At a glance** / mobile Quick View surface shows actual active tasks and shared costs only. It does not duplicate Tasks or Shared Costs navigation cards; those feature entry points remain in Organiser.

## Verification checklist

1. A parent can edit only the paid amount for their own share.
2. One parent's request cannot include or mutate another participant id.
3. A NZ$100 share can record NZ$50 paid and remain active.
4. The remaining balance becomes NZ$50 for that parent.
5. A payment amount cannot exceed that parent's agreed share.
6. The shared cost archives only when every share reaches its full amount.
7. Reducing one parent's own amount below the full share reopens the cost.
8. Financial edits require approval and reset payment progress after acceptance.
9. Non-financial approved edits preserve payment progress.
10. Create/edit/delete approval behaviour remains unchanged.
11. Day Details and Home show remaining payment state.
12. Shared cost activity creates no Google Calendar jobs.
