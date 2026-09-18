# Expenses

> **Current release status — 18 September 2026:** This feature is live in Covie Production and its required migration(s) are already applied through production schema version `0011`. Any older “do not apply”, “GitHub-only”, or “not yet deployed” wording below is retained only as historical phase context and is not the current operating state.

Phase 3 adds shared expense tracking to Covie without turning the product into a payment service.

## Product boundary

Covie records what was spent, who paid, how the cost is shared, whether reimbursement is still outstanding, and whether the parents have agreed to changes.

Covie does not transfer money, connect bank accounts, collect payments, or treat expense history as a legal evidence system.

## Expense fields

Each agreed expense stores:

- short title
- amount in integer cents
- category
- expense date
- optional child
- parent who paid
- explicit share amount for each parent
- optional reimbursement due date
- optional practical note
- settlement status
- settlement timestamp and actor when applicable

Categories are intentionally practical rather than exhaustive:

- School
- Childcare
- Medical
- Sport
- Clothing
- Activities
- Travel
- Essentials
- Other

## Splits

The UI offers three simple split patterns:

- 50 / 50
- paid by payer only
- custom split

The API always receives explicit per-parent share amounts and validates that the shares add up to the full expense. Odd cents in an equal split remain with the parent who paid so the accounting stays exact.

## Agreement rules

When two active co-parents both have linked edit-capable accounts:

- creating an expense creates a Waiting proposal
- changing an agreed expense creates a Waiting proposal
- removing an agreed expense creates a Waiting proposal
- the current agreed expense stays active until the proposal is accepted

When there is no other linked edit-capable parent, those same operations remain immediately usable so a solo Covie user is not blocked.

Viewer memberships can read expenses and proposals but cannot mutate them.

Expense proposals use:

- entity type: `expense`
- entity id: the future/current expense UUID
- reusable proposal history and audit log from the approval engine

Acceptance is applied transactionally in `lib/approvals/expense-apply.ts`.

## Settlement status

Settlement is deliberately separate from agreement.

- `not_needed`: the parent who paid owns the full share
- `outstanding`: another parent has a reimbursement share
- `settled`: reimbursement has been recorded as complete

Marking an expense settled or reopening it is an operational status update, not a second approval proposal. The change is still written to the audit log.

If an approved edit changes the amount, payer, or share amounts, settlement resets to the appropriate fresh state. Non-financial edits preserve the current settlement state.

## Calendar connection

Expenses are date-linked.

Day Details loads expenses recorded or due on that date and provides a direct link into the Expenses screen with the date filter already selected. Parenting colours and Google Calendar syncing remain independent from expenses.

Expense proposals and settlement records are never sent to Google Calendar.

## Database migration

Phase 3 introduces, but does not apply:

- `drizzle/0007_expenses.sql`
- `expense_category`
- `expense_settlement_status`
- `expenses`
- `expense_shares`

Do not apply this migration until the full staged build is approved for deployment.

## Deployment verification later

After all stages are complete and deployment is explicitly approved, verify:

1. Solo-parent expense create/edit/delete works immediately.
2. Two linked editors create Waiting proposals instead of mutating agreed expenses.
3. Accept applies create/edit/delete exactly once.
4. Decline and withdraw leave the agreed expense unchanged.
5. Viewer access is read-only.
6. Equal split handles odd cents exactly.
7. Custom split rejects totals that do not equal the expense.
8. Payer-only expense shows no reimbursement needed.
9. Outstanding reimbursement can be marked settled and reopened.
10. Financial edits reset settlement appropriately.
11. Non-financial edits preserve settlement.
12. Day Details shows expenses recorded or due on that date.
13. Pending expense changes never appear as agreed expense rows.
14. Expense activity never creates Google Calendar jobs.
