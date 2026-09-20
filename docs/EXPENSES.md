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
- the running amount each parent has paid toward their own share
- an individual history row for every payment entered

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

Payment recording is deliberately separate from editing. Adding a payment does not create an approval proposal.

## Per-parent additive payments

Each payment entry is additive.

The signed-in parent enters the amount of the **new payment they are adding now**, not their total paid-to-date amount.

Example for a NZ$100 share:

1. enter NZ$50 and choose **Add**
2. Covie records a NZ$50 payment and the running total becomes NZ$50 of NZ$100
3. later enter NZ$50 again
4. Covie records a second NZ$50 payment and the running total becomes NZ$100 of NZ$100

Each parent can add payments only to their own share. The API never accepts a participant id from the client; it derives the participant from the signed-in calendar session.

For each share:

- `share_cents` is the agreed amount that parent is responsible for
- `paid_cents` is the running total of payments recorded for that share
- `paid_cents` cannot exceed `share_cents`
- each payment is stored in `expense_share_payments`
- `paid_at` is set when the running total reaches the full share
- zero-value shares require no payment

The shared cost remains `outstanding` while any share has `paid_cents < share_cents`.

Once every share is paid in full, the expense becomes `settled` and moves into the Shared Cost archive automatically.

Covie records these amounts but does not transfer money.

## Editing and payment state

Accepted edits that change the amount, payer or split are financial changes. They reset per-parent payment progress because the agreed amounts have changed.

Because `expense_share_payments` is linked to a share with cascading deletion, the old payment history is removed when a financial edit replaces the share rows.

Non-financial edits, such as changing a title, note or due date, preserve existing payment totals and payment history.

Payment amounts are never copied into an edit proposal, so one parent cannot alter the other parent's payment record through the approval flow.

## Existing data migrations

Migration `0018_expense_share_payment_confirmation.sql` introduced per-parent completion timestamps.

Migration `0019_expense_share_partial_payments.sql` added the running `paid_cents` total.

Migration `0020_expense_share_payment_history.sql` adds individual payment history. Existing positive `paid_cents` balances are preserved by backfilling one historical payment row per share.

## Calendar and Home

Shared costs remain linked to their expense/due dates but are not synced into Google Calendar.

Home and workspace summaries calculate outstanding amounts from `share_cents - paid_cents`.

The left **At a glance** / mobile Quick View surface shows actual active tasks and shared costs only. It does not duplicate Tasks or Shared Costs navigation cards; those feature entry points remain in Organiser.

## Verification checklist

1. A parent can add payments only to their own share.
2. NZ$50 + NZ$50 on a NZ$100 share records two payments and totals NZ$100.
3. A new payment cannot exceed the remaining amount on that parent's share.
4. The cost remains active after a partial payment.
5. The cost archives only when every share is fully paid.
6. Every accepted payment creates an `expense_share_payments` row.
7. Concurrent payment requests cannot silently overpay the share.
8. Financial edits require approval and reset payment history after acceptance.
9. Non-financial approved edits preserve payment history.
10. Create/edit/delete approval behaviour remains unchanged.
11. Day Details and Home show the remaining balance.
12. Shared cost activity creates no Google Calendar jobs.
