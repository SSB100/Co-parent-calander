"use client";

import {
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  LoaderCircle,
  Pencil,
  Plus,
  ReceiptText,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { localDateInTimeZone } from "@/lib/calendar/time";
import { ProposalActions } from "@/components/approvals/proposal-actions";
import { ProposalCard } from "@/components/approvals/proposal-card";
import { AttachmentPanel } from "@/components/attachments/attachment-panel";
import { LinkedItemsPanel } from "@/components/links/linked-items-panel";
import { RecordFocus } from "@/components/workspace/record-focus";
import { WorkspaceNav } from "@/components/workspace/workspace-nav";

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
  paidCents: number;
  paidAt: string | null;
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

export type ExpensePayload = {
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

function paymentAmountToCents(value: string) {
  const cleaned = value.replace(/[^0-9.]/g, "");
  if (!cleaned || !/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  const amount = Number(cleaned);
  if (!Number.isFinite(amount) || amount < 0) return null;
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
  if (!expense) return "No shared cost";
  const payer = participants.find((participant) => participant.id === expense.paidByParticipantId);
  const split = expense.shares
    .map((share) => {
      const parent = participants.find((participant) => participant.id === share.participantId);
      return `${parent?.displayName ?? "Parent"} ${money(share.shareCents)}`;
    })
    .join(" · ");
  return `${expense.title} · ${money(expense.amountCents)} · paid by ${payer?.displayName ?? "Parent"} · ${split}`;
}

function unpaidAmount(expense: Expense) {
  return expense.shares.reduce(
    (sum, share) => sum + Math.max(0, share.shareCents - share.paidCents),
    0,
  );
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

export function ExpensesShell({
  initialDate,
  calendarTimezone,
  initialData,
}: {
  initialDate: string | null;
  calendarTimezone: string;
  initialData: ExpensePayload;
}) {
  const [data, setData] = useState<ExpensePayload>(initialData);
  const [busy, setBusy] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<ExpenseFormState>(() =>
    blankForm(
      initialDate,
      initialData.currentParticipantId ?? initialData.participants[0]?.id ?? null,
      calendarTimezone,
    ),
  );
  const [dateFilter, setDateFilter] = useState<string | null>(initialDate);
  const loadedDateRef = useRef<string | null>(initialDate);
  const [statusFilter, setStatusFilter] = useState<"current" | "archive">("current");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paymentAmounts, setPaymentAmounts] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const query = dateFilter ? `?date=${encodeURIComponent(dateFilter)}` : "";
      const response = await fetch(`/api/expenses${query}`, { cache: "no-store" });
      const body = (await response.json().catch(() => null)) as ExpensePayload | { error?: string } | null;
      if (!response.ok || !body || !("expenses" in body)) {
        throw new Error(body && "error" in body && body.error ? body.error : "Shared costs could not be loaded.");
      }
      setData(body);
      window.dispatchEvent(new Event("covie-records-updated"));
      setError(null);
      setForm((current) => ({
        ...current,
        paidByParticipantId:
          current.paidByParticipantId || body.currentParticipantId || body.participants[0]?.id || "",
      }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Shared costs could not be loaded.");
    }
  }, [dateFilter]);

  useEffect(() => {
    if (loadedDateRef.current === dateFilter) return;

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
              : "Shared costs could not be loaded.",
          );
          return;
        }
        setData(body);
        loadedDateRef.current = dateFilter;
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
        if (!cancelled) setError("Shared costs could not be loaded.");
      })
    return () => {
      cancelled = true;
    };
  }, [dateFilter]);

  const participants = data?.participants ?? [];
  const children = data?.children ?? [];
  const editable = data?.permission === "owner" || data?.permission === "editor";

  const filteredExpenses = useMemo(() => {
    const rows = data?.expenses ?? [];
    return statusFilter === "current"
      ? rows.filter((expense) => expense.settlementStatus === "outstanding")
      : rows.filter((expense) => expense.settlementStatus !== "outstanding");
  }, [data?.expenses, statusFilter]);

  const summary = useMemo(() => {
    const rows = data?.expenses ?? [];
    return {
      recorded: rows.reduce((sum, expense) => sum + expense.amountCents, 0),
      outstanding: rows
        .filter((expense) => expense.settlementStatus === "outstanding")
        .reduce((sum, expense) => sum + unpaidAmount(expense), 0),
      archived: rows.filter((expense) => expense.settlementStatus !== "outstanding").length,
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
      throw new Error("Add a parent before recording shared costs.");
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
      throw new Error("Custom parent shares must add up to the full shared cost.");
    }
    return shares;
  }

  async function saveExpense() {
    if (!editable || busy) return;
    const amountCents = amountToCents(form.amount);
    if (!amountCents) {
      setError("Enter a valid shared cost amount.");
      return;
    }
    if (!form.title.trim()) {
      setError("Add a short shared cost title.");
      return;
    }

    let shares: Array<{ participantId: string; shareCents: number }>;
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
      if (!response.ok) throw new Error(body?.error ?? "The shared cost could not be saved.");

      setFormOpen(false);
      setMessage(
        body?.pending
          ? body.approverName
            ? `Shared cost sent to ${body.approverName} for approval.`
            : "Shared cost sent for approval."
          : form.id
            ? "Shared cost updated."
            : "Shared cost added.",
      );
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The shared cost could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteExpense(expense: Expense) {
    if (!editable || busy) return;
    if (!window.confirm(`Remove “${expense.title}” from shared costs?`)) return;

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
      if (!response.ok) throw new Error(body?.error ?? "The shared cost could not be removed.");
      setMessage(
        body?.pending
          ? body.approverName
            ? `Removal sent to ${body.approverName} for approval.`
            : "Removal sent for approval."
          : "Shared cost removed.",
      );
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The shared cost could not be removed.");
    } finally {
      setBusy(false);
    }
  }

  async function updateSettlement(expense: Expense) {
    if (!editable || busy || !data.currentParticipantId) return;
    const share = expense.shares.find(
      (item) => item.participantId === data.currentParticipantId,
    );
    if (!share || share.shareCents <= 0) return;

    const inputValue =
      paymentAmounts[expense.id] ?? centsInput(share.paidCents);
    const paidCents = paymentAmountToCents(inputValue);
    if (paidCents === null) {
      setError("Enter a valid amount you have paid.");
      return;
    }
    if (paidCents > share.shareCents) {
      setError("The amount paid cannot be more than your share.");
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/expenses/${expense.id}/settlement`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ paidCents }),
      });
      const body = (await response.json().catch(() => null)) as
        | { error?: string; settlementStatus?: string }
        | null;
      if (!response.ok) {
        throw new Error(body?.error ?? "Your payment amount could not be updated.");
      }
      setPaymentAmounts((current) => {
        const next = { ...current };
        delete next[expense.id];
        return next;
      });
      setMessage(
        paidCents >= share.shareCents
          ? "Your share is fully paid."
          : `${money(paidCents)} recorded toward your ${money(share.shareCents)} share.`,
      );
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Your payment amount could not be updated.",
      );
    } finally {
      setBusy(false);
    }
  }

  const formAmountCents = amountToCents(form.amount) ?? 0;

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-3 py-4 sm:px-6 sm:py-7 lg:px-8">
      <header className="covie-page-header">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-2 h-2 w-16 rounded-full bg-[#F4C64E]" aria-hidden="true" />
            <h1 className="covie-page-title text-3xl sm:text-4xl">Shared costs</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              Keep the amount, who paid and each parent&apos;s share clear. Each parent records
              only what they have paid toward their own share. Covie records payments but does not move money.
            </p>
          </div>
          <RecordFocus ready={Boolean(data)} /><WorkspaceNav
            active="expenses"
            actions={
              editable ? (
                <button
                  type="button"
                  onClick={openCreate}
                  className="covie-primary-action inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" /> Add shared cost
                </button>
              ) : null
            }
          />
        </div>
      </header>

      {dateFilter ? (
        <div className="mt-4 flex flex-col gap-2 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4" aria-hidden="true" />
            Showing shared costs recorded or due on {dateLabel(dateFilter)}.
          </span>
          <button
            type="button"
            onClick={() => setDateFilter(null)}
            className="self-start font-semibold hover:underline sm:self-auto"
          >
            Show all shared costs
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

      <section className="mt-4 grid grid-cols-2 gap-2 sm:mt-5 sm:grid-cols-3 sm:gap-3">
        <div className="rounded-2xl border border-[#243139] bg-[#F7DC86] p-3 sm:p-4">
          <p className="text-xs font-bold text-[#5F4709]">Outstanding</p>
          <p className="mt-2 text-3xl font-semibold text-[#243139]">{money(summary.outstanding)}</p>
          <p className="mt-1 text-xs text-[#5F4709]">Still unpaid across active shares</p>
        </div>
        <div className="rounded-2xl border border-[#243139] bg-[#DDD3FA] p-3 sm:p-4">
          <p className="text-xs font-bold text-[#544394]">Recorded</p>
          <p className="mt-2 text-3xl font-semibold text-[#243139]">{money(summary.recorded)}</p>
          <p className="mt-1 text-xs text-[#544394]">Total shared cost value</p>
        </div>
        <div className="col-span-2 rounded-2xl border border-[#243139] bg-[#BFEDE6] p-3 sm:col-span-1 sm:p-4">
          <p className="text-xs font-bold text-[#0B665C]">Archived</p>
          <p className="mt-2 text-3xl font-semibold text-[#243139]">{summary.archived}</p>
          <p className="mt-1 text-xs text-[#0B665C]">All required shares confirmed paid</p>
        </div>
      </section>

      {(data?.pendingProposals.length ?? 0) > 0 ? (
        <section className="mt-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Waiting for agreement</h2>
            <p className="mt-1 text-sm text-slate-500">
              The agreed shared cost stays unchanged until the proposal is accepted.
            </p>
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {data?.pendingProposals.map((proposal) => {
              const previous = proposalExpense(proposal.previousState);
              const proposed = proposalExpense(proposal.proposedState);
              const title =
                proposal.action === "create"
                  ? "New shared cost"
                  : proposal.action === "delete"
                    ? "Remove shared cost"
                    : "Shared cost change";
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
                      ? "No agreed shared cost yet."
                      : proposalSummary(previous, participants)
                  }
                  proposedSummary={
                    proposal.action === "delete"
                      ? "Remove this shared cost."
                      : proposalSummary(proposed, participants)
                  }
                  actions={
                    <ProposalActions
                      proposalId={proposal.id}
                      currentMembershipId={data.currentMembershipId}
                      proposedByMembershipId={proposal.proposedByMembershipId}
                      approverMembershipId={proposal.approverMembershipId}
                      onChanged={() => {
                        setMessage("Shared cost proposal updated.");
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
            <h2 className="text-lg font-semibold text-slate-950">
              {statusFilter === "current" ? "Current shared costs" : "Shared cost archive"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {statusFilter === "current"
                ? "Only shared costs that still need attention stay here."
                : "Settled shared costs remain available as history without cluttering the active view."}
            </p>
          </div>
          <div className="flex rounded-xl border border-slate-200 bg-white p-1">
            {(["current", "archive"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setStatusFilter(value)}
                className={`min-h-9 rounded-lg px-3 text-xs font-semibold ${
                  statusFilter === value
                    ? value === "current"
                      ? "bg-[#F4C64E] text-[#243139]"
                      : "bg-[#765ED6] text-white"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                {value === "current" ? "Current" : "Archive"}
              </button>
            ))}
          </div>
        </div>

        {filteredExpenses.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-8 text-center">
            <ReceiptText className="mx-auto h-7 w-7 text-slate-400" aria-hidden="true" />
            <p className="mt-2 font-semibold text-slate-800">No shared costs here yet</p>
            <p className="mt-1 text-sm text-slate-500">
              {dateFilter
                ? "No agreed shared costs are recorded or due on this date."
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
                <article key={expense.id} id={`record-${expense.id}`} tabIndex={-1} className="rounded-2xl border border-[#E6DBCF] bg-white p-4 shadow-[4px_4px_0_#24313910] sm:p-5">
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
                      const status =
                        share.shareCents <= 0
                          ? "No amount due"
                          : share.paidCents >= share.shareCents
                            ? "Paid in full"
                            : `Paid ${money(share.paidCents)} of ${money(share.shareCents)}`;
                      return (
                        <span
                          key={share.participantId}
                          className="rounded-xl bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700"
                        >
                          {parent?.displayName ?? "Parent"} · {status}
                        </span>
                      );
                    })}
                  </div>

                  <div className="mt-4 rounded-xl bg-slate-50 px-3 py-3 text-sm">
                    {expense.settlementStatus === "settled" ? (
                      <p className="flex items-center gap-2 font-semibold text-emerald-700">
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> All shares paid in full
                      </p>
                    ) : (
                      <p className="flex items-center gap-2 font-semibold text-amber-700">
                        <Clock3 className="h-4 w-4" aria-hidden="true" /> {money(unpaidAmount(expense))} still unpaid
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
                      {(() => {
                        const myShare = expense.shares.find(
                          (share) => share.participantId === data.currentParticipantId,
                        );
                        if (!myShare || myShare.shareCents <= 0) return null;
                        const value =
                          paymentAmounts[expense.id] ?? centsInput(myShare.paidCents);
                        return (
                          <div className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 sm:max-w-sm">
                            <label className="block text-xs font-semibold text-slate-700">
                              Amount you&apos;ve paid
                            </label>
                            <div className="mt-2 flex items-center gap-2">
                              <div className="flex min-h-10 min-w-0 flex-1 items-center rounded-xl border border-slate-300 bg-white px-3">
                                <span className="mr-2 text-xs text-slate-500">NZ$</span>
                                <input
                                  inputMode="decimal"
                                  value={value}
                                  onChange={(event) =>
                                    setPaymentAmounts((current) => ({
                                      ...current,
                                      [expense.id]: event.target.value,
                                    }))
                                  }
                                  aria-label="Amount you have paid toward your share"
                                  className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none"
                                />
                              </div>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void updateSettlement(expense)}
                                className="covie-action-teal inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-xs disabled:opacity-50"
                              >
                                <CircleDollarSign className="h-3.5 w-3.5" aria-hidden="true" />
                                Save
                              </button>
                            </div>
                            <p className="mt-2 text-[11px] text-slate-500">
                              Your share is {money(myShare.shareCents)}. Enter the total you have paid so far.
                            </p>
                          </div>
                        );
                      })()}
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
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#243139]/35 sm:items-center sm:p-4">
          <section role="dialog" aria-modal="true" aria-labelledby="expense-form-title" className="max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl border-2 border-[#243139] bg-white p-5 shadow-[7px_7px_0_#F4C64E] sm:rounded-3xl sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Shared cost</p>
                <h2 id="expense-form-title" className="mt-1 text-2xl font-semibold text-slate-950">
                  {form.id ? "Edit shared cost" : "Add shared cost"}
                </h2>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => setFormOpen(false)}
                aria-label="Close shared cost form"
                className="covie-icon-button flex h-10 w-10 items-center justify-center rounded-xl disabled:opacity-50"
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
                <span className="text-sm font-semibold text-slate-800">Cost date</span>
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
                        ? value === "equal"
                          ? "border-[#243139] bg-[#BFEDE6] text-[#243139] ring-2 ring-[#19A897]"
                          : value === "payer_only"
                            ? "border-[#243139] bg-[#F7DC86] text-[#243139] ring-2 ring-[#F4C64E]"
                            : "border-[#243139] bg-[#DDD3FA] text-[#243139] ring-2 ring-[#765ED6]"
                        : "border-[#E6DBCF] bg-[#FFF9F2] text-[#243139] hover:bg-[#F7EFE5]"
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
                className="covie-action-secondary min-h-12 rounded-xl px-4 text-sm disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void saveExpense()}
                className="covie-primary-action inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-5 text-sm disabled:opacity-50"
              >
                {busy ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                {form.id ? "Save change" : "Add shared cost"}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {!editable && data ? (
        <p className="mx-auto mt-5 max-w-2xl text-center text-xs leading-5 text-slate-400">
          You have view-only access to shared costs.
        </p>
      ) : null}
    </main>
  );
}
