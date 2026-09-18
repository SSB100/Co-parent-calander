"use client";

import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  CircleDollarSign,
  Clock3,
  House,
  LoaderCircle,
  Pencil,
  Plus,
  ReceiptText,
  RotateCcw,
  Trash2,
  UsersRound,
  WalletCards,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { localDateInTimeZone } from "@/lib/calendar/time";
import { ProposalActions } from "@/components/approvals/proposal-actions";
import { ProposalCard } from "@/components/approvals/proposal-card";
import { AttachmentPanel } from "@/components/attachments/attachment-panel";
import { LinkedItemsPanel } from "@/components/links/linked-items-panel";

type Participant = {
  id: string;
  displayName: string;
  colorKey: string;
};

type Child = {
  id: string;
  displayName: string;
};

type ExpenseShare = {
  participantId: string;
  shareCents: number;
};

type Expense = {
  id: string;
  childId: string | null;
  expenseDate: string;
  title: string;
  category:
    | "school"
    | "childcare"
    | "medical"
    | "sport"
    | "clothing"
    | "activity"
    | "travel"
    | "essentials"
    | "other";
  amountCents: number;
  paidByParticipantId: string;
  dueDate: string | null;
  note: string | null;
  settlementStatus: "not_needed" | "outstanding" | "settled";
  settledAt: string | null;
  settledByParticipantId: string | null;
  shares: ExpenseShare[];
};

type PendingProposal = {
  id: string;
  entityId: string;
  action: "create" | "edit" | "delete";
  status: "waiting";
  proposedByMembershipId: string;
  approverMembershipId: string | null;
  proposedByName: string;
  approverName: string | null;
  reason: string | null;
  previousState: unknown;
  proposedState: unknown;
};

type ExpensePayload = {
  currentParticipantId: string | null;
  currentMembershipId: string;
  permission: "owner" | "editor" | "viewer";
  participants: Participant[];
  children: Child[];
  expenses: Expense[];
  pendingProposals: PendingProposal[];
};

type ExpenseFormState = {
  id: string | null;
  title: string;
  amount: string;
  category: Expense["category"];
  expenseDate: string;
  childId: string;
  paidByParticipantId: string;
  dueDate: string;
  note: string;
  reason: string;
  splitMode: "equal" | "payer_only" | "custom";
  customShares: Record<string, string>;
};

const categoryLabels: Record<Expense["category"], string> = {
  school: "School",
  childcare: "Childcare",
  medical: "Medical",
  sport: "Sport",
  clothing: "Clothing",
  activity: "Activities",
  travel: "Travel",
  essentials: "Essentials",
  other: "Other",
};

const currency = new Intl.NumberFormat("en-NZ", {
  style: "currency",
  currency: "NZD",
  minimumFractionDigits: 2,
});

function money(cents: number) {
  return currency.format(cents / 100);
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-NZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function amountToCents(value: string) {
  const cleaned = value.replace(/[^0-9.]/g, "");
  if (!cleaned || !/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  const amount = Number(cleaned);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount * 100);
}

function centsInput(cents: number) {
  return (cents / 100).toFixed(2);
}

function proposalExpense(value: unknown): (Expense & { shares: ExpenseShare[] }) | null {
  if (!value || typeof value !== "object") return null;
  const record = value as { kind?: unknown; expense?: unknown };
  if (record.kind !== "expense" || !record.expense || typeof record.expense !== "object") {
    return null;
  }
  return record.expense as Expense & { shares: ExpenseShare[] };
}

function proposalSummary(expense: ReturnType<typeof proposalExpense>, participants: Participant[]) {
  if (!expense) return "No expense";
  const payer = participants.find((participant) => participant.id === expense.paidByParticipantId);
  const split = expense.shares
    .map((share) => {
      const parent = participants.find((participant) => participant.id === share.participantId);
      return `${parent?.displayName ?? "Parent"} ${money(share.shareCents)}`;
    })
    .join(" · ");
  return `${expense.title} · ${money(expense.amountCents)} · paid by ${payer?.displayName ?? "Parent"} · ${split}`;
}

function owedAmount(expense: Expense) {
  const payerShare =
    expense.shares.find((share) => share.participantId === expense.paidByParticipantId)?.shareCents ?? 0;
  return Math.max(0, expense.amountCents - payerShare);
}

function blankForm(initialDate: string | null, participantId: string | null, timeZone: string): ExpenseFormState {
  return {
    id: null,
    title: "",
    amount: "",
    category: "other",
    expenseDate: initialDate ?? localDateInTimeZone(timeZone),
    childId: "",
    paidByParticipantId: participantId ?? "",
    dueDate: "",
    note: "",
    reason: "",
    splitMode: "equal",
    customShares: {},
  };
}

export function ExpensesShell({ initialDate, calendarTimezone }: { initialDate: string | null; calendarTimezone: string }) {
  const [data, setData] = useState<ExpensePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<ExpenseFormState>(() => blankForm(initialDate, null, calendarTimezone));
  const [dateFilter, setDateFilter] = useState<string | null>(initialDate);
  const [statusFilter, setStatusFilter] = useState<"all" | "outstanding" | "settled">("all");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const query = dateFilter ? `?date=${encodeURIComponent(dateFilter)}` : "";
      const response = await fetch(`/api/expenses${query}`, { cache: "no-store" });
      const body = (await response.json().catch(() => null)) as ExpensePayload | { error?: string } | null;
      if (!response.ok || !body || !("expenses" in body)) {
        throw new Error(body && "error" in body && body.error ? body.error : "Expenses could not be loaded.");
      }
      setData(body);
      setError(null);
      setForm((current) => ({
        ...current,
        paidByParticipantId:
          current.paidByParticipantId || body.currentParticipantId || body.participants[0]?.id || "",
      }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Expenses could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [dateFilter]);

  useEffect(() => {
    let cancelled = false;
    const query = dateFilter ? `?date=${encodeURIComponent(dateFilter)}` : "";

    fetch(`/api/expenses${query}`, { cache: "no-store" })
      .then(async (response) => ({
        response,
        body: (await response.json().catch(() => null)) as
          | ExpensePayload
          | { error?: string }
          | null,
      }))
      .then(({ response, body }) => {
        if (cancelled) return;
        if (!response.ok || !body || !("expenses" in body)) {
          setError(
            body && "error" in body && body.error
              ? body.error
              : "Expenses could not be loaded.",
          );
          return;
        }
        setData(body);
        setError(null);
        setForm((current) => ({
          ...current,
          paidByParticipantId:
            current.paidByParticipantId ||
            body.currentParticipantId ||
            body.participants[0]?.id ||
            "",
        }));
      })
      .catch(() => {
        if (!cancelled) setError("Expenses could not be loaded.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [dateFilter]);

  const participants = data?.participants ?? [];
  const children = data?.children ?? [];
  const editable = data?.permission === "owner" || data?.permission === "editor";

  const filteredExpenses = useMemo(() => {
    const rows = data?.expenses ?? [];
    if (statusFilter === "outstanding") {
      return rows.filter((expense) => expense.settlementStatus === "outstanding");
    }
    if (statusFilter === "settled") {
      return rows.filter((expense) => expense.settlementStatus === "settled");
    }
    return rows;
  }, [data?.expenses, statusFilter]);

  const summary = useMemo(() => {
    const rows = data?.expenses ?? [];
    return {
      recorded: rows.reduce((sum, expense) => sum + expense.amountCents, 0),
      outstanding: rows
        .filter((expense) => expense.settlementStatus === "outstanding")
        .reduce((sum, expense) => sum + owedAmount(expense), 0),
      settled: rows.filter((expense) => expense.settlementStatus === "settled").length,
    };
  }, [data?.expenses]);

  function openCreate() {
    const participantId = data?.currentParticipantId ?? participants[0]?.id ?? "";
    setForm(blankForm(dateFilter, participantId, calendarTimezone));
    setError(null);
    setFormOpen(true);
  }

  function openEdit(expense: Expense) {
    const payerShare =
      expense.shares.find((share) => share.participantId === expense.paidByParticipantId)?.shareCents ?? 0;
    const otherShares = expense.shares.filter((share) => share.participantId !== expense.paidByParticipantId);
    const payerOnly =
      payerShare === expense.amountCents && otherShares.every((share) => share.shareCents === 0);
    const values = expense.shares.map((share) => share.shareCents);
    const equal =
      values.length > 0 &&
      Math.max(...values) - Math.min(...values) <= 1 &&
      values.reduce((sum, value) => sum + value, 0) === expense.amountCents;

    setForm({
      id: expense.id,
      title: expense.title,
      amount: centsInput(expense.amountCents),
      category: expense.category,
      expenseDate: expense.expenseDate,
      childId: expense.childId ?? "",
      paidByParticipantId: expense.paidByParticipantId,
      dueDate: expense.dueDate ?? "",
      note: expense.note ?? "",
      reason: "",
      splitMode: payerOnly ? "payer_only" : equal ? "equal" : "custom",
      customShares: Object.fromEntries(
        expense.shares.map((share) => [share.participantId, centsInput(share.shareCents)]),
      ),
    });
    setError(null);
    setFormOpen(true);
  }

  function buildShares(amountCents: number) {
    const active = participants.slice(0, 2);
    if (active.length === 0 || !form.paidByParticipantId) {
      throw new Error("Add a parent before recording expenses.");
    }

    if (active.length === 1) {
      return [{ participantId: active[0].id, shareCents: amountCents }];
    }

    if (form.splitMode === "payer_only") {
      return active.map((participant) => ({
        participantId: participant.id,
        shareCents: participant.id === form.paidByParticipantId ? amountCents : 0,
      }));
    }

    if (form.splitMode === "equal") {
      const base = Math.floor(amountCents / active.length);
      let remainder = amountCents - base * active.length;
      return active.map((participant) => {
        const getsRemainder = participant.id === form.paidByParticipantId && remainder > 0;
        if (getsRemainder) remainder -= 1;
        return {
          participantId: participant.id,
          shareCents: base + (getsRemainder ? 1 : 0),
        };
      });
    }

    const shares = active.map((participant) => {
      const parsed = amountToCents(form.customShares[participant.id] ?? "0");
      return {
        participantId: participant.id,
        shareCents: parsed ?? 0,
      };
    });
    if (shares.reduce((sum, share) => sum + share.shareCents, 0) !== amountCents) {
      throw new Error("Custom parent shares must add up to the full expense.");
    }
    return shares;
  }

  async function saveExpense() {
    if (!editable || busy) return;
    const amountCents = amountToCents(form.amount);
    if (!amountCents) {
      setError("Enter a valid expense amount.");
      return;
    }
    if (!form.title.trim()) {
      setError("Add a short expense title.");
      return;
    }

    let shares: ExpenseShare[];
    try {
      shares = buildShares(amountCents);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Choose a valid split.");
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const payload = {
        title: form.title.trim(),
        amountCents,
        category: form.category,
        expenseDate: form.expenseDate,
        childId: form.childId || null,
        paidByParticipantId: form.paidByParticipantId,
        dueDate: form.dueDate || null,
        note: form.note.trim() || null,
        shares,
        reason: form.reason.trim() || null,
      };
      const response = await fetch("/api/expenses", {
        method: form.id ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form.id ? { id: form.id, ...payload } : payload),
      });
      const body = (await response.json().catch(() => null)) as
        | { error?: string; pending?: boolean; approverName?: string | null }
        | null;
      if (!response.ok) throw new Error(body?.error ?? "The expense could not be saved.");

      setFormOpen(false);
      setMessage(
        body?.pending
          ? body.approverName
            ? `Expense sent to ${body.approverName} for approval.`
            : "Expense sent for approval."
          : form.id
            ? "Expense updated."
            : "Expense added.",
      );
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The expense could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteExpense(expense: Expense) {
    if (!editable || busy) return;
    if (!window.confirm(`Remove “${expense.title}” from shared expenses?`)) return;

    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/expenses", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: expense.id, reason: null }),
      });
      const body = (await response.json().catch(() => null)) as
        | { error?: string; pending?: boolean; approverName?: string | null }
        | null;
      if (!response.ok) throw new Error(body?.error ?? "The expense could not be removed.");
      setMessage(
        body?.pending
          ? body.approverName
            ? `Removal sent to ${body.approverName} for approval.`
            : "Removal sent for approval."
          : "Expense removed.",
      );
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The expense could not be removed.");
    } finally {
      setBusy(false);
    }
  }

  async function updateSettlement(expense: Expense) {
    if (!editable || busy || expense.settlementStatus === "not_needed") return;
    const operation = expense.settlementStatus === "settled" ? "reopen" : "settle";

    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/expenses/${expense.id}/settlement`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ operation }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? "The settlement status could not be updated.");
      setMessage(operation === "settle" ? "Expense marked settled." : "Expense reopened.");
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "The settlement status could not be updated.",
      );
    } finally {
      setBusy(false);
    }
  }

  const formAmountCents = amountToCents(form.amount) ?? 0;

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-3 py-4 sm:px-6 sm:py-7 lg:px-8">
      <header className="rounded-3xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              <WalletCards className="h-4 w-4" aria-hidden="true" /> Covie expenses
            </div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
              Shared expenses
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              Keep the amount, who paid, each parent&apos;s share and reimbursement status clear.
              Covie records payments but does not move money.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/home"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <House className="h-4 w-4" aria-hidden="true" /> Home
            </Link>
            <Link
              href="/kids"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <UsersRound className="h-4 w-4" aria-hidden="true" /> Kids
            </Link>
            <Link
              href="/calendar"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Calendar
            </Link>
            {editable ? (
              <button
                type="button"
                onClick={openCreate}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800"
              >
                <Plus className="h-4 w-4" aria-hidden="true" /> Add expense
              </button>
            ) : null}
          </div>
        </div>
      </header>

      {dateFilter ? (
        <div className="mt-4 flex flex-col gap-2 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4" aria-hidden="true" />
            Showing expenses recorded or due on {dateLabel(dateFilter)}.
          </span>
          <button
            type="button"
            onClick={() => setDateFilter(null)}
            className="self-start font-semibold hover:underline sm:self-auto"
          >
            Show all expenses
          </button>
        </div>
      ) : null}

      {message ? (
        <div role="status" className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {message}
        </div>
      ) : null}
      {error ? (
        <div role="alert" className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {error}
        </div>
      ) : null}

      <section className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Recorded</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{money(summary.recorded)}</p>
          <p className="mt-1 text-xs text-slate-500">Total value in this view</p>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-700">Outstanding</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{money(summary.outstanding)}</p>
          <p className="mt-1 text-xs text-slate-500">Reimbursement still recorded as owing</p>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">Settled</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{summary.settled}</p>
          <p className="mt-1 text-xs text-slate-500">Expenses marked reimbursed</p>
        </div>
      </section>

      {(data?.pendingProposals.length ?? 0) > 0 ? (
        <section className="mt-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Waiting for agreement</h2>
            <p className="mt-1 text-sm text-slate-500">
              The agreed expense record stays unchanged until the proposal is accepted.
            </p>
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {data?.pendingProposals.map((proposal) => {
              const previous = proposalExpense(proposal.previousState);
              const proposed = proposalExpense(proposal.proposedState);
              const title =
                proposal.action === "create"
                  ? "New expense"
                  : proposal.action === "delete"
                    ? "Remove expense"
                    : "Expense change";
              return (
                <ProposalCard
                  key={proposal.id}
                  status={proposal.status}
                  title={title}
                  proposedByName={proposal.proposedByName}
                  approverName={proposal.approverName}
                  reason={proposal.reason}
                  agreedSummary={
                    proposal.action === "create"
                      ? "No agreed expense yet."
                      : proposalSummary(previous, participants)
                  }
                  proposedSummary={
                    proposal.action === "delete"
                      ? "Remove this expense."
                      : proposalSummary(proposed, participants)
                  }
                  actions={
                    <ProposalActions
                      proposalId={proposal.id}
                      currentMembershipId={data.currentMembershipId}
                      proposedByMembershipId={proposal.proposedByMembershipId}
                      approverMembershipId={proposal.approverMembershipId}
                      onChanged={() => {
                        setMessage("Expense proposal updated.");
                        void load();
                      }}
                    />
                  }
                />
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="mt-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Agreed expenses</h2>
            <p className="mt-1 text-sm text-slate-500">
              These are the current shared records. Pending changes are shown separately above.
            </p>
          </div>
          <div className="flex rounded-xl border border-slate-200 bg-white p-1">
            {(["all", "outstanding", "settled"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setStatusFilter(value)}
                className={`min-h-9 rounded-lg px-3 text-xs font-semibold capitalize ${
                  statusFilter === value ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                {value}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="mt-4 flex min-h-40 items-center justify-center rounded-2xl border border-slate-200 bg-white text-sm text-slate-500">
            <LoaderCircle className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> Loading expenses…
          </div>
        ) : filteredExpenses.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-8 text-center">
            <ReceiptText className="mx-auto h-7 w-7 text-slate-400" aria-hidden="true" />
            <p className="mt-2 font-semibold text-slate-800">No expenses here yet</p>
            <p className="mt-1 text-sm text-slate-500">
              {dateFilter
                ? "No agreed expenses are recorded or due on this date."
                : "Add a shared cost when there is something worth keeping clear."}
            </p>
          </div>
        ) : (
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {filteredExpenses.map((expense) => {
              const payer = participants.find(
                (participant) => participant.id === expense.paidByParticipantId,
              );
              const child = children.find((item) => item.id === expense.childId);
              return (
                <article key={expense.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                          {categoryLabels[expense.category]}
                        </span>
                        {child ? (
                          <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700">
                            {child.displayName}
                          </span>
                        ) : null}
                      </div>
                      <h3 className="mt-2 truncate text-lg font-semibold text-slate-950">{expense.title}</h3>
                      <p className="mt-1 text-sm text-slate-500">
                        {dateLabel(expense.expenseDate)} · Paid by {payer?.displayName ?? "Parent"}
                      </p>
                    </div>
                    <p className="shrink-0 text-xl font-semibold text-slate-950">{money(expense.amountCents)}</p>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {expense.shares.map((share) => {
                      const parent = participants.find((item) => item.id === share.participantId);
                      return (
                        <span key={share.participantId} className="rounded-xl bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">
                          {parent?.displayName ?? "Parent"} {money(share.shareCents)}
                        </span>
                      );
                    })}
                  </div>

                  <div className="mt-4 rounded-xl bg-slate-50 px-3 py-3 text-sm">
                    {expense.settlementStatus === "not_needed" ? (
                      <p className="flex items-center gap-2 font-semibold text-slate-700">
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> No reimbursement needed
                      </p>
                    ) : expense.settlementStatus === "settled" ? (
                      <p className="flex items-center gap-2 font-semibold text-emerald-700">
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Settled
                      </p>
                    ) : (
                      <p className="flex items-center gap-2 font-semibold text-amber-700">
                        <Clock3 className="h-4 w-4" aria-hidden="true" /> {money(owedAmount(expense))} reimbursement outstanding
                      </p>
                    )}
                    {expense.dueDate ? (
                      <p className="mt-1 text-xs text-slate-500">Due {dateLabel(expense.dueDate)}</p>
                    ) : null}
                  </div>

                  {expense.note ? <p className="mt-3 text-sm leading-5 text-slate-600">{expense.note}</p> : null}

                  <div className="mt-3 flex flex-wrap gap-2">
                    <AttachmentPanel
                      entityType="expense"
                      entityId={expense.id}
                      defaultCategory="receipt"
                      title="Receipts & documents"
                      compact
                    />
                    <LinkedItemsPanel
                      entityType="expense"
                      entityId={expense.id}
                      title="Related"
                      compact
                    />
                  </div>

                  {editable ? (
                    <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => openEdit(expense)}
                        className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Edit
                      </button>
                      {expense.settlementStatus !== "not_needed" ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void updateSettlement(expense)}
                          className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                        >
                          {expense.settlementStatus === "settled" ? (
                            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                          ) : (
                            <CircleDollarSign className="h-3.5 w-3.5" aria-hidden="true" />
                          )}
                          {expense.settlementStatus === "settled" ? "Reopen" : "Mark settled"}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void deleteExpense(expense)}
                        className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-rose-200 px-3 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Remove
                      </button>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {formOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/35 sm:items-center sm:p-4">
          <section role="dialog" aria-modal="true" aria-labelledby="expense-form-title" className="max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Shared expense</p>
                <h2 id="expense-form-title" className="mt-1 text-2xl font-semibold text-slate-950">
                  {form.id ? "Edit expense" : "Add expense"}
                </h2>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => setFormOpen(false)}
                aria-label="Close expense form"
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-50"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="sm:col-span-2">
                <span className="text-sm font-semibold text-slate-800">What was it for?</span>
                <input
                  type="text"
                  maxLength={100}
                  value={form.title}
                  onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                  placeholder="e.g. School shoes"
                  className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 px-4 text-base outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                />
              </label>

              <label>
                <span className="text-sm font-semibold text-slate-800">Amount</span>
                <div className="mt-2 flex min-h-12 items-center rounded-xl border border-slate-300 bg-white px-4 focus-within:border-slate-500 focus-within:ring-2 focus-within:ring-slate-200">
                  <span className="mr-2 text-slate-500">NZ$</span>
                  <input
                    inputMode="decimal"
                    value={form.amount}
                    onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))}
                    placeholder="0.00"
                    className="min-w-0 flex-1 border-0 bg-transparent text-base outline-none"
                  />
                </div>
              </label>

              <label>
                <span className="text-sm font-semibold text-slate-800">Category</span>
                <select
                  value={form.category}
                  onChange={(event) => setForm((current) => ({ ...current, category: event.target.value as Expense["category"] }))}
                  className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                >
                  {Object.entries(categoryLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>

              <label>
                <span className="text-sm font-semibold text-slate-800">Expense date</span>
                <input
                  type="date"
                  value={form.expenseDate}
                  onChange={(event) => setForm((current) => ({ ...current, expenseDate: event.target.value }))}
                  className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                />
              </label>

              <label>
                <span className="text-sm font-semibold text-slate-800">Child <span className="font-normal text-slate-400">(optional)</span></span>
                <select
                  value={form.childId}
                  onChange={(event) => setForm((current) => ({ ...current, childId: event.target.value }))}
                  className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                >
                  <option value="">General / all children</option>
                  {children.map((child) => <option key={child.id} value={child.id}>{child.displayName}</option>)}
                </select>
              </label>

              <label>
                <span className="text-sm font-semibold text-slate-800">Who paid?</span>
                <select
                  value={form.paidByParticipantId}
                  onChange={(event) => setForm((current) => ({ ...current, paidByParticipantId: event.target.value }))}
                  className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                >
                  {participants.map((participant) => (
                    <option key={participant.id} value={participant.id}>{participant.displayName}</option>
                  ))}
                </select>
              </label>

              <label>
                <span className="text-sm font-semibold text-slate-800">Reimbursement due <span className="font-normal text-slate-400">(optional)</span></span>
                <input
                  type="date"
                  value={form.dueDate}
                  onChange={(event) => setForm((current) => ({ ...current, dueDate: event.target.value }))}
                  className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                />
              </label>
            </div>

            <div className="mt-5">
              <p className="text-sm font-semibold text-slate-800">How should it be shared?</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                {[
                  ["equal", "50 / 50"],
                  ["payer_only", "Paid by payer only"],
                  ["custom", "Custom split"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setForm((current) => ({ ...current, splitMode: value as ExpenseFormState["splitMode"] }))}
                    className={`min-h-11 rounded-xl border px-3 text-sm font-semibold ${
                      form.splitMode === value
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {form.splitMode === "equal" && formAmountCents > 0 ? (
                <p className="mt-2 text-xs text-slate-500">
                  Covie keeps the full amount exact. If there is an odd cent, it stays with the parent who paid.
                </p>
              ) : null}

              {form.splitMode === "custom" ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {participants.slice(0, 2).map((participant) => (
                    <label key={participant.id}>
                      <span className="text-xs font-semibold text-slate-600">{participant.displayName}&apos;s share</span>
                      <div className="mt-1 flex min-h-11 items-center rounded-xl border border-slate-300 px-3">
                        <span className="mr-2 text-sm text-slate-500">NZ$</span>
                        <input
                          inputMode="decimal"
                          value={form.customShares[participant.id] ?? ""}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              customShares: {
                                ...current.customShares,
                                [participant.id]: event.target.value,
                              },
                            }))
                          }
                          placeholder="0.00"
                          className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none"
                        />
                      </div>
                    </label>
                  ))}
                </div>
              ) : null}
            </div>

            <label className="mt-5 block">
              <span className="text-sm font-semibold text-slate-800">Note <span className="font-normal text-slate-400">(optional)</span></span>
              <textarea
                rows={3}
                maxLength={500}
                value={form.note}
                onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
                placeholder="Short practical detail, reference or context"
                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-base outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              />
            </label>

            <label className="mt-4 block">
              <span className="text-sm font-semibold text-slate-800">Reason for change <span className="font-normal text-slate-400">(optional)</span></span>
              <textarea
                rows={2}
                maxLength={500}
                value={form.reason}
                onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))}
                placeholder="Only used if the other parent needs to approve this"
                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-base outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              />
            </label>

            <div className="mt-6 flex flex-col-reverse gap-2 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={busy}
                onClick={() => setFormOpen(false)}
                className="min-h-12 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void saveExpense()}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {busy ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                {form.id ? "Save change" : "Add expense"}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {!editable && data ? (
        <p className="mx-auto mt-5 max-w-2xl text-center text-xs leading-5 text-slate-400">
          You have view-only access to shared expenses.
        </p>
      ) : null}
    </main>
  );
}
