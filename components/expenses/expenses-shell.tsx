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
  Repeat2,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { localDateInTimeZone } from "@/lib/calendar/time";
import { ProposalActions } from "@/components/approvals/proposal-actions";
import { ProposalCard } from "@/components/approvals/proposal-card";
import { AttachmentPanel } from "@/components/attachments/attachment-panel";
import { LinkedItemsPanel } from "@/components/links/linked-items-panel";
import { CoviePage, CoviePageHeader } from "@/components/ui/covie";
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
  seriesId: string | null;
  seriesOccurrenceDate: string | null;
  recurrenceFrequency: "weekly" | "fortnightly" | "monthly" | "yearly" | null;
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
  recurrenceFrequency: "none" | "weekly" | "fortnightly" | "monthly" | "yearly";
  recurrenceEndDate: string;
  splitMode: "equal" | "reimbursement" | "custom";
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

const recurrenceLabels = {
  weekly: "Weekly",
  fortnightly: "Every 2 weeks",
  monthly: "Monthly",
  yearly: "Yearly",
} as const;

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

function proposalRecurrence(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const record = value as {
    recurrence?: {
      frequency?: keyof typeof recurrenceLabels;
      endDate?: string | null;
    } | null;
  };
  const frequency = record.recurrence?.frequency;
  return frequency && frequency in recurrenceLabels
    ? {
        frequency,
        endDate: record.recurrence?.endDate ?? null,
      }
    : null;
}

function proposalSummary(
  expense: ReturnType<typeof proposalExpense>,
  participants: Participant[],
  recurrence?: ReturnType<typeof proposalRecurrence>,
) {
  if (!expense) return "No shared cost";
  const payer = participants.find((participant) => participant.id === expense.paidByParticipantId);
  const split = expense.shares
    .map((share) => {
      const parent = participants.find((participant) => participant.id === share.participantId);
      return `${parent?.displayName ?? "Parent"} ${money(share.shareCents)}`;
    })
    .join(" · ");
  const cadence = recurrence
    ? ` · ${recurrenceLabels[recurrence.frequency]}${recurrence.endDate ? ` until ${dateLabel(recurrence.endDate)}` : ""}`
    : "";
  return `${expense.title} · ${money(expense.amountCents)} · paid by ${payer?.displayName ?? "Parent"} · ${split}${cadence}`;
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
    recurrenceFrequency: "none",
    recurrenceEndDate: "",
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
  const today = localDateInTimeZone(calendarTimezone);

  const filteredExpenses = useMemo(() => {
    const rows = data?.expenses ?? [];
    return statusFilter === "current"
      ? rows.filter(
          (expense) =>
            expense.settlementStatus === "outstanding" &&
            (Boolean(dateFilter) ||
              !expense.seriesOccurrenceDate ||
              expense.seriesOccurrenceDate <= today),
        )
      : rows.filter((expense) => expense.settlementStatus !== "outstanding");
  }, [data?.expenses, dateFilter, statusFilter, today]);

  const summary = useMemo(() => {
    const rows = (data?.expenses ?? []).filter(
      (expense) =>
        Boolean(dateFilter) ||
        !expense.seriesOccurrenceDate ||
        expense.seriesOccurrenceDate <= today,
    );
    return {
      recorded: rows.reduce((sum, expense) => sum + expense.amountCents, 0),
      outstanding: rows
        .filter((expense) => expense.settlementStatus === "outstanding")
        .reduce((sum, expense) => sum + unpaidAmount(expense), 0),
      archived: rows.filter((expense) => expense.settlementStatus !== "outstanding").length,
    };
  }, [data?.expenses, dateFilter, today]);

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
    const reimbursement =
      payerShare === 0 &&
      otherShares.length === 1 &&
      otherShares[0]?.shareCents === expense.amountCents;
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
      recurrenceFrequency: "none",
      recurrenceEndDate: "",
      splitMode: reimbursement ? "reimbursement" : equal ? "equal" : "custom",
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
      if (form.splitMode === "reimbursement") {
        throw new Error("Add the other parent before requesting reimbursement.");
      }
      return [{ participantId: active[0].id, shareCents: amountCents }];
    }

    if (form.splitMode === "reimbursement") {
      return active.map((participant) => ({
        participantId: participant.id,
        shareCents: participant.id === form.paidByParticipantId ? 0 : amountCents,
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
        ...(!form.id
          ? {
              recurrence:
                form.recurrenceFrequency === "none"
                  ? null
                  : {
                      frequency: form.recurrenceFrequency,
                      endDate: form.recurrenceEndDate || null,
                    },
            }
          : {}),
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

    const inputValue = paymentAmounts[expense.id] ?? "";
    const paymentCents = paymentAmountToCents(inputValue);
    if (paymentCents === null) {
      setError("Enter a payment amount greater than zero.");
      return;
    }

    const remainingCents = Math.max(0, share.shareCents - share.paidCents);
    if (paymentCents > remainingCents) {
      setError(
        `You only have ${money(remainingCents)} left to pay on your share.`,
      );
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/expenses/${expense.id}/settlement`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ paymentCents }),
      });
      const body = (await response.json().catch(() => null)) as
        | {
            error?: string;
            settlementStatus?: string;
            paidCents?: number;
            shareCents?: number;
          }
        | null;
      if (!response.ok) {
        throw new Error(body?.error ?? "Your payment could not be added.");
      }
      setPaymentAmounts((current) => {
        const next = { ...current };
        delete next[expense.id];
        return next;
      });
      const nextPaid = body?.paidCents ?? share.paidCents + paymentCents;
      const shareTotal = body?.shareCents ?? share.shareCents;
      setMessage(
        nextPaid >= shareTotal
          ? `${money(paymentCents)} added. Your share is now fully paid.`
          : `${money(paymentCents)} added. You have paid ${money(nextPaid)} of ${money(shareTotal)}.`,
      );
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Your payment could not be added.",
      );
    } finally {
      setBusy(false);
    }
  }

  const formAmountCents = amountToCents(form.amount) ?? 0;
  const originalPayer = participants.find(
    (participant) => participant.id === form.paidByParticipantId,
  );
  const reimbursingParticipant = participants
    .slice(0, 2)
    .find((participant) => participant.id !== form.paidByParticipantId);

  return (
    <CoviePage>
      <RecordFocus ready={Boolean(data)} />
      <CoviePageHeader
        accent="sunshine"
        title="Shared costs"
        context={
          <>
            Keep the amount, who paid and each parent&apos;s share clear. Each parent records
            only what they have paid toward their own share. Covie records payments but does not move money.
          </>
        }
        actions={
          <WorkspaceNav
            active="expenses"
            actions={
              editable ? (
                <button
                  type="button"
                  onClick={openCreate}
                  className="covie-primary-action inline-flex min-h-11 items-center gap-2 rounded-[10px] px-4 text-sm"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" /> Add shared cost
                </button>
              ) : null
            }
          />
        }
      />

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
              const previousRecurrence = proposalRecurrence(proposal.previousState);
              const proposedRecurrence = proposalRecurrence(proposal.proposedState);
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
                      : proposalSummary(previous, participants, previousRecurrence)
                  }
                  proposedSummary={
                    proposal.action === "delete"
                      ? "Remove this shared cost."
                      : proposalSummary(proposed, participants, proposedRecurrence)
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
                <article key={expense.id} id={`record-${expense.id}`} tabIndex={-1} className="rounded-[22px] border-2 border-[#243139] bg-[#FFFDF9] p-4 shadow-[5px_5px_0_#E9DED2] sm:p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-[#243139] bg-[#F7DC86] px-2.5 py-1 text-[11px] font-bold text-[#5F4709]">
                          {categoryLabels[expense.category]}
                        </span>
                        {child ? (
                          <span className="rounded-full border border-[#19A897] bg-[#BFEDE6] px-2.5 py-1 text-[11px] font-bold text-[#0B665C]">
                            {child.displayName}
                          </span>
                        ) : null}
                        {expense.recurrenceFrequency ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-[#765ED6] bg-[#DDD3FA] px-2.5 py-1 text-[11px] font-bold text-[#544394]">
                            <Repeat2 className="h-3 w-3" aria-hidden="true" />
                            {recurrenceLabels[expense.recurrenceFrequency]}
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
                          className={`rounded-xl border px-3 py-2 text-xs font-bold ${
                            share.participantId === data.currentParticipantId
                              ? "border-[#19A897] bg-[#E8F8F4] text-[#0B665C]"
                              : "border-[#C9BDF1] bg-[#F1ECFD] text-[#544394]"
                          }`}
                        >
                          {parent?.displayName ?? "Parent"} · {status}
                        </span>
                      );
                    })}
                  </div>

                  <div className={`mt-4 rounded-xl border-2 px-3 py-3 text-sm ${
                    expense.settlementStatus === "settled"
                      ? "border-[#19A897] bg-[#E8F8F4]"
                      : "border-[#F4C64E] bg-[#FFF9DF]"
                  }`}>
                    {expense.settlementStatus === "settled" ? (
                      <p className="flex items-center gap-2 font-bold text-[#0B665C]">
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> All shares paid in full
                      </p>
                    ) : (
                      <p className="flex items-center gap-2 font-bold text-[#6E5411]">
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
                    <div className="mt-4 flex flex-wrap gap-2 border-t-2 border-[#E9DED2] pt-4">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => openEdit(expense)}
                        className="covie-action-secondary inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-xs disabled:opacity-50"
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Edit
                      </button>
                      {(() => {
                        const myShare = expense.shares.find(
                          (share) => share.participantId === data.currentParticipantId,
                        );
                        if (!myShare || myShare.shareCents <= 0) return null;
                        if (myShare.paidCents >= myShare.shareCents) return null;
                        const value = paymentAmounts[expense.id] ?? "";
                        return (
                          <div className="w-full rounded-2xl border-2 border-[#19A897] bg-[#E8F8F4] p-3 shadow-[3px_3px_0_#BFEDE6] sm:max-w-sm">
                            <div className="flex items-center justify-between gap-3">
                              <label className="text-xs font-black uppercase tracking-[0.08em] text-[#0B665C]">
                                Your payment
                              </label>
                              <span className="text-xs font-bold text-[#243139]">
                                {money(myShare.paidCents)} / {money(myShare.shareCents)}
                              </span>
                            </div>
                            <div className="mt-2 h-2 overflow-hidden rounded-full border border-[#74C9BD] bg-white">
                              <div
                                className="h-full bg-[#19A897]"
                                style={{
                                  width: `${Math.min(
                                    100,
                                    Math.round(
                                      (myShare.paidCents / myShare.shareCents) * 100,
                                    ),
                                  )}%`,
                                }}
                              />
                            </div>
                            <p className="mt-3 text-xs font-bold text-[#243139]">Add payment</p>
                            <div className="mt-2 flex items-center gap-2">
                              <div className="flex min-h-10 min-w-0 flex-1 items-center rounded-xl border-2 border-[#9FD7CE] bg-white px-3 focus-within:border-[#19A897]">
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
                                  aria-label="Add a payment toward your share"
                                  className="min-w-0 flex-1 border-0 bg-transparent text-sm font-semibold text-[#243139] outline-none"
                                />
                              </div>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void updateSettlement(expense)}
                                className="covie-action-teal inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-xs disabled:opacity-50"
                              >
                                <CircleDollarSign className="h-3.5 w-3.5" aria-hidden="true" />
                                Add
                              </button>
                            </div>
                            <p className="mt-2 text-[11px] font-medium text-[#43535A]">
                              Paid {money(myShare.paidCents)} of {money(myShare.shareCents)}. Add another payment of up to {money(Math.max(0, myShare.shareCents - myShare.paidCents))}.
                            </p>
                          </div>
                        );
                      })()}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void deleteExpense(expense)}
                        className="inline-flex min-h-10 items-center gap-2 rounded-xl border-2 border-[#FFB5AE] bg-[#FFF3F1] px-3 text-xs font-bold text-[#A73E36] hover:bg-[#FFE6E2] disabled:opacity-50"
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
                <span className="text-sm font-semibold text-slate-800">
                  {form.splitMode === "reimbursement" ? "Amount to reimburse" : "Total amount"}
                </span>
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

            {!form.id ? (
              <section className="mt-5 rounded-2xl border-2 border-[#765ED6] bg-[#F6F2FF] p-4 shadow-[3px_3px_0_#DDD3FA]">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#765ED6] bg-white text-[#6651B7]">
                    <Repeat2 className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-black text-[#243139]">Does this repeat?</p>
                    <p className="mt-1 text-xs leading-5 text-[#5B6670]">
                      Each occurrence becomes its own Shared Cost with separate payment progress.
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label>
                    <span className="text-xs font-bold text-[#544394]">Frequency</span>
                    <select
                      value={form.recurrenceFrequency}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          recurrenceFrequency:
                            event.target.value as ExpenseFormState["recurrenceFrequency"],
                        }))
                      }
                      className="mt-1 min-h-11 w-full rounded-xl border-2 border-[#C9BDF1] bg-white px-3 text-sm font-semibold text-[#243139] outline-none focus:border-[#765ED6]"
                    >
                      <option value="none">One-off</option>
                      <option value="weekly">Weekly</option>
                      <option value="fortnightly">Every 2 weeks</option>
                      <option value="monthly">Monthly</option>
                      <option value="yearly">Yearly</option>
                    </select>
                  </label>

                  {form.recurrenceFrequency !== "none" ? (
                    <label>
                      <span className="text-xs font-bold text-[#544394]">
                        Ends <span className="font-medium text-[#7B728F]">(optional)</span>
                      </span>
                      <input
                        type="date"
                        min={form.expenseDate}
                        value={form.recurrenceEndDate}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            recurrenceEndDate: event.target.value,
                          }))
                        }
                        className="mt-1 min-h-11 w-full rounded-xl border-2 border-[#C9BDF1] bg-white px-3 text-sm font-semibold text-[#243139] outline-none focus:border-[#765ED6]"
                      />
                    </label>
                  ) : null}
                </div>

                {form.recurrenceFrequency !== "none" ? (
                  <p className="mt-3 text-xs font-semibold text-[#544394]">
                    Starts {dateLabel(form.expenseDate)} · {recurrenceLabels[form.recurrenceFrequency]}
                    {form.recurrenceEndDate
                      ? ` · ends ${dateLabel(form.recurrenceEndDate)}`
                      : " · no end date set"}
                  </p>
                ) : null}
              </section>
            ) : data.expenses.find((expense) => expense.id === form.id)?.seriesId ? (
              <div className="mt-5 rounded-xl border-2 border-[#C9BDF1] bg-[#F6F2FF] px-4 py-3 text-xs font-semibold text-[#544394]">
                <span className="inline-flex items-center gap-1.5">
                  <Repeat2 className="h-3.5 w-3.5" aria-hidden="true" />
                  This is one occurrence in a recurring series. This edit changes this occurrence only.
                </span>
              </div>
            ) : null}

            <div className="mt-5">
              <p className="text-sm font-semibold text-slate-800">How should this cost be handled?</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() =>
                    setForm((current) => ({
                      ...current,
                      splitMode: current.splitMode === "custom" ? "custom" : "equal",
                    }))
                  }
                  className={`rounded-xl border px-4 py-3 text-left ${
                    form.splitMode !== "reimbursement"
                      ? "border-[#243139] bg-[#BFEDE6] text-[#243139] ring-2 ring-[#19A897]"
                      : "border-[#E6DBCF] bg-[#FFF9F2] text-[#243139] hover:bg-[#F7EFE5]"
                  }`}
                >
                  <span className="block text-sm font-bold">Split between us</span>
                  <span className="mt-1 block text-xs font-medium opacity-75">
                    Choose 50 / 50 or set a custom amount for each parent.
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setForm((current) => ({ ...current, splitMode: "reimbursement" }))
                  }
                  className={`rounded-xl border px-4 py-3 text-left ${
                    form.splitMode === "reimbursement"
                      ? "border-[#243139] bg-[#F7DC86] text-[#243139] ring-2 ring-[#F4C64E]"
                      : "border-[#E6DBCF] bg-[#FFF9F2] text-[#243139] hover:bg-[#F7EFE5]"
                  }`}
                >
                  <span className="block text-sm font-bold">Reimbursement</span>
                  <span className="mt-1 block text-xs font-medium opacity-75">
                    One parent already paid and the other parent owes them money back.
                  </span>
                </button>
              </div>

              {form.splitMode === "reimbursement" ? (
                <div className="mt-3 rounded-xl border-2 border-[#F4C64E] bg-[#FFF9DF] px-4 py-3 text-sm text-[#5F4709]">
                  {originalPayer && reimbursingParticipant && formAmountCents > 0 ? (
                    <p className="font-semibold">
                      {reimbursingParticipant.displayName} will be asked to reimburse{" "}
                      {originalPayer.displayName} {money(formAmountCents)}.
                    </p>
                  ) : (
                    <p className="font-semibold">
                      The parent who did not pay the bill will owe the full reimbursement amount.
                    </p>
                  )}
                  <p className="mt-1 text-xs">
                    The parent who already paid has no amount owing. The reimbursement still needs
                    the other parent&apos;s approval.
                  </p>
                </div>
              ) : (
                <div className="mt-3 rounded-xl border border-[#C9BDF1] bg-[#F6F2FF] p-3">
                  <p className="text-xs font-bold text-[#544394]">How should the split work?</p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {[
                      ["equal", "50 / 50"],
                      ["custom", "Custom split"],
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() =>
                          setForm((current) => ({
                            ...current,
                            splitMode: value as ExpenseFormState["splitMode"],
                          }))
                        }
                        className={`min-h-11 rounded-xl border px-3 text-sm font-semibold ${
                          form.splitMode === value
                            ? value === "equal"
                              ? "border-[#243139] bg-[#BFEDE6] text-[#243139] ring-2 ring-[#19A897]"
                              : "border-[#243139] bg-[#DDD3FA] text-[#243139] ring-2 ring-[#765ED6]"
                            : "border-[#E6DBCF] bg-white text-[#243139] hover:bg-[#FFF9F2]"
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
                          <span className="text-xs font-semibold text-slate-600">
                            {participant.displayName}&apos;s share
                          </span>
                          <div className="mt-1 flex min-h-11 items-center rounded-xl border border-slate-300 bg-white px-3">
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
              )}
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
    </CoviePage>
  );
}
