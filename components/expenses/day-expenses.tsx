"use client";

import { CircleDollarSign, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

type DayExpense = {
  id: string;
  title: string;
  amountCents: number;
  settlementStatus: "not_needed" | "outstanding" | "settled";
};

type ExpenseDayPayload = {
  expenses?: DayExpense[];
  pendingProposals?: Array<{ id: string }>;
};

const currency = new Intl.NumberFormat("en-NZ", {
  style: "currency",
  currency: "NZD",
  minimumFractionDigits: 2,
});

export function DayExpenses({ date, readOnly = false }: { date: string; readOnly?: boolean }) {
  const [payload, setPayload] = useState<ExpenseDayPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/expenses?date=${encodeURIComponent(date)}`, { cache: "no-store" })
      .then(async (response) => ({
        response,
        body: (await response.json().catch(() => null)) as ExpenseDayPayload | null,
      }))
      .then(({ response, body }) => {
        if (!cancelled && response.ok) setPayload(body);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [date]);

  const expenses = payload?.expenses ?? [];
  const pendingCount = payload?.pendingProposals?.length ?? 0;

  return (
    <div className="mt-6 border-t border-slate-200 pt-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 font-semibold text-slate-900">
            <CircleDollarSign className="h-4 w-4 text-[#0D7A6D]" aria-hidden="true" />
            Expenses on this day
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Costs recorded or reimbursement due on this date.
          </p>
        </div>
        <Link
          href={`/expenses?date=${encodeURIComponent(date)}`}
          className="covie-action-sunshine shrink-0 rounded-xl px-3 py-2 text-xs"
        >
          {readOnly ? "View expenses" : "Add / manage"}
        </Link>
      </div>

      {loading ? (
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading expenses…
        </div>
      ) : expenses.length === 0 ? (
        <p className="mt-3 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
          No agreed expenses are recorded or due on this day.
        </p>
      ) : (
        <div className="mt-3 space-y-2">
          {expenses.map((expense) => (
            <div key={expense.id} className="flex items-center justify-between gap-3 rounded-xl border border-emerald-100 bg-emerald-50/50 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">{expense.title}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {expense.settlementStatus === "settled"
                    ? "Settled"
                    : expense.settlementStatus === "outstanding"
                      ? "Reimbursement outstanding"
                      : "No reimbursement needed"}
                </p>
              </div>
              <p className="shrink-0 text-sm font-semibold text-slate-900">
                {currency.format(expense.amountCents / 100)}
              </p>
            </div>
          ))}
        </div>
      )}

      {pendingCount > 0 ? (
        <p className="mt-2 text-xs font-semibold text-amber-700">
          {pendingCount} expense {pendingCount === 1 ? "change is" : "changes are"} waiting for agreement.
        </p>
      ) : null}
    </div>
  );
}
