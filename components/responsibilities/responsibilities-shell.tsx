"use client";

import {
  CalendarDays,
  Check,
  CheckCircle2,
  CheckSquare2,
  ChevronLeft,
  Clock3,
  Link2,
  ListChecks,
  House,
  LoaderCircle,
  Pencil,
  Plus,
  Repeat2,
  RotateCcw,
  Trash2,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ProposalActions } from "@/components/approvals/proposal-actions";
import { ProposalCard } from "@/components/approvals/proposal-card";
import { AttachmentPanel } from "@/components/attachments/attachment-panel";

type Participant = {
  id: string;
  displayName: string;
  colorKey: string;
};

type Child = {
  id: string;
  displayName: string;
};

type LinkedEvent = {
  id: string;
  title: string;
  startDate: string;
};

type LinkedExpense = {
  id: string;
  title: string;
  expenseDate: string;
};

type ResponsibilityStatus =
  | "upcoming"
  | "due_soon"
  | "due_today"
  | "overdue"
  | "completed";

type ResponsibilityCategory =
  | "school"
  | "medical"
  | "sport"
  | "activity"
  | "transport"
  | "shopping"
  | "forms_permissions"
  | "appointment"
  | "home_admin"
  | "other";

type ResponsibilityRecurrence =
  | "none"
  | "weekly"
  | "fortnightly"
  | "monthly"
  | "yearly";

type Responsibility = {
  id: string;
  seriesId: string;
  title: string;
  childIds: string[];
  responsibleParticipantId: string;
  dueDate: string;
  dueTime: string | null;
  category: ResponsibilityCategory;
  note: string | null;
  recurrence: ResponsibilityRecurrence;
  recurrenceEndDate: string | null;
  linkedEventId: string | null;
  linkedExpenseId: string | null;
  completedAt: string | null;
  completedByParticipantId: string | null;
  nextOccurrenceId: string | null;
  status: ResponsibilityStatus;
};

type PendingProposal = {
  id: string;
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

type ResponsibilityPayload = {
  currentParticipantId: string | null;
  currentMembershipId: string;
  permission: "owner" | "editor" | "viewer";
  participants: Participant[];
  children: Child[];
  events: LinkedEvent[];
  expenses: LinkedExpense[];
  responsibilities: Responsibility[];
  pendingProposals: PendingProposal[];
};

type FormState = {
  id: string | null;
  title: string;
  childIds: string[];
  responsibleParticipantId: string;
  dueDate: string;
  dueTime: string;
  category: ResponsibilityCategory;
  note: string;
  recurrence: ResponsibilityRecurrence;
  recurrenceEndDate: string;
  linkedEventId: string;
  linkedExpenseId: string;
  reason: string;
};

const categoryLabels: Record<ResponsibilityCategory, string> = {
  school: "School",
  medical: "Medical",
  sport: "Sport",
  activity: "Activity",
  transport: "Transport",
  shopping: "Shopping",
  forms_permissions: "Forms & Permissions",
  appointment: "Appointment",
  home_admin: "Home / Admin",
  other: "Other",
};

const recurrenceLabels: Record<ResponsibilityRecurrence, string> = {
  none: "Does not repeat",
  weekly: "Weekly",
  fortnightly: "Fortnightly",
  monthly: "Monthly",
  yearly: "Yearly",
};

const statusLabels: Record<ResponsibilityStatus, string> = {
  upcoming: "Upcoming",
  due_soon: "Due soon",
  due_today: "Due today",
  overdue: "Overdue",
  completed: "Completed",
};

const templates: Array<{
  key: string;
  label: string;
  title: string;
  category: ResponsibilityCategory;
}> = [
  { key: "book_appointment", label: "Book appointment", title: "Book appointment", category: "appointment" },
  { key: "buy_item", label: "Buy item", title: "Buy item", category: "shopping" },
  { key: "return_form", label: "Sign/return form", title: "Sign/return form", category: "forms_permissions" },
  { key: "drop_off", label: "Drop off", title: "Drop off", category: "transport" },
  { key: "pick_up", label: "Pick up", title: "Pick up", category: "transport" },
  { key: "bring_item", label: "Bring/pack item", title: "Bring/pack item", category: "other" },
  { key: "register", label: "Register/enrol", title: "Register/enrol", category: "activity" },
  { key: "renew", label: "Renew", title: "Renew", category: "home_admin" },
  { key: "other", label: "Other", title: "", category: "other" },
];

function todayDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Pacific/Auckland",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-NZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function blankForm(initialDate: string | null, participantId: string | null): FormState {
  return {
    id: null,
    title: "",
    childIds: [],
    responsibleParticipantId: participantId ?? "",
    dueDate: initialDate ?? todayDate(),
    dueTime: "",
    category: "other",
    note: "",
    recurrence: "none",
    recurrenceEndDate: "",
    linkedEventId: "",
    linkedExpenseId: "",
    reason: "",
  };
}

function proposalResponsibility(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const record = value as { kind?: unknown; responsibility?: unknown };
  if (
    record.kind !== "responsibility" ||
    !record.responsibility ||
    typeof record.responsibility !== "object"
  ) {
    return null;
  }
  return record.responsibility as {
    title: string;
    responsibleParticipantId: string;
    dueDate: string;
    dueTime: string | null;
    recurrence: ResponsibilityRecurrence;
  };
}

function proposalSummary(
  item: ReturnType<typeof proposalResponsibility>,
  participants: Participant[],
) {
  if (!item) return "No responsibility";
  const parent = participants.find(
    (participant) => participant.id === item.responsibleParticipantId,
  );
  return `${item.title} · ${parent?.displayName ?? "Parent"} · due ${dateLabel(item.dueDate)}${
    item.dueTime ? ` at ${item.dueTime}` : ""
  }${item.recurrence !== "none" ? ` · ${recurrenceLabels[item.recurrence]}` : ""}`;
}

function statusClass(status: ResponsibilityStatus) {
  if (status === "completed") return "bg-emerald-100 text-emerald-700";
  if (status === "overdue") return "bg-rose-100 text-rose-700";
  if (status === "due_today" || status === "due_soon") return "bg-amber-100 text-amber-700";
  return "bg-slate-100 text-slate-600";
}

export function ResponsibilitiesShell({ initialDate }: { initialDate: string | null }) {
  const [data, setData] = useState<ResponsibilityPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(() => blankForm(initialDate, null));
  const [dateFilter, setDateFilter] = useState<string | null>(initialDate);
  const [statusFilter, setStatusFilter] = useState<"all" | ResponsibilityStatus>("all");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const query = dateFilter ? `?date=${encodeURIComponent(dateFilter)}` : "";
    const response = await fetch(`/api/responsibilities${query}`, { cache: "no-store" });
    const body = (await response.json().catch(() => null)) as
      | ResponsibilityPayload
      | { error?: string }
      | null;
    if (!response.ok || !body || !("responsibilities" in body)) {
      throw new Error(
        body && "error" in body && body.error
          ? body.error
          : "Responsibilities could not be loaded.",
      );
    }
    setData(body);
    setError(null);
    setForm((current) => ({
      ...current,
      responsibleParticipantId:
        current.responsibleParticipantId ||
        body.currentParticipantId ||
        body.participants[0]?.id ||
        "",
    }));
  }, [dateFilter]);

  useEffect(() => {
    let cancelled = false;
    const query = dateFilter ? `?date=${encodeURIComponent(dateFilter)}` : "";

    fetch(`/api/responsibilities${query}`, { cache: "no-store" })
      .then(async (response) => ({
        response,
        body: (await response.json().catch(() => null)) as
          | ResponsibilityPayload
          | { error?: string }
          | null,
      }))
      .then(({ response, body }) => {
        if (cancelled) return;
        if (!response.ok || !body || !("responsibilities" in body)) {
          setError(
            body && "error" in body && body.error
              ? body.error
              : "Responsibilities could not be loaded.",
          );
          return;
        }
        setData(body);
        setError(null);
        setForm((current) => ({
          ...current,
          responsibleParticipantId:
            current.responsibleParticipantId ||
            body.currentParticipantId ||
            body.participants[0]?.id ||
            "",
        }));
      })
      .catch(() => {
        if (!cancelled) setError("Responsibilities could not be loaded.");
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

  const filtered = useMemo(() => {
    const rows = data?.responsibilities ?? [];
    return statusFilter === "all"
      ? rows
      : rows.filter((item) => item.status === statusFilter);
  }, [data?.responsibilities, statusFilter]);

  const summary = useMemo(() => {
    const rows = data?.responsibilities ?? [];
    return {
      open: rows.filter((item) => item.status !== "completed").length,
      dueToday: rows.filter((item) => item.status === "due_today").length,
      overdue: rows.filter((item) => item.status === "overdue").length,
      completed: rows.filter((item) => item.status === "completed").length,
    };
  }, [data?.responsibilities]);

  function openCreate() {
    setForm(
      blankForm(
        dateFilter,
        data?.currentParticipantId ?? participants[0]?.id ?? null,
      ),
    );
    setError(null);
    setFormOpen(true);
  }

  function openEdit(item: Responsibility) {
    setForm({
      id: item.id,
      title: item.title,
      childIds: item.childIds,
      responsibleParticipantId: item.responsibleParticipantId,
      dueDate: item.dueDate,
      dueTime: item.dueTime ?? "",
      category: item.category,
      note: item.note ?? "",
      recurrence: item.recurrence,
      recurrenceEndDate: item.recurrenceEndDate ?? "",
      linkedEventId: item.linkedEventId ?? "",
      linkedExpenseId: item.linkedExpenseId ?? "",
      reason: "",
    });
    setError(null);
    setFormOpen(true);
  }

  function applyTemplate(template: (typeof templates)[number]) {
    setForm((current) => ({
      ...current,
      title: template.title,
      category: template.category,
    }));
  }

  function toggleChild(childId: string) {
    setForm((current) => ({
      ...current,
      childIds: current.childIds.includes(childId)
        ? current.childIds.filter((id) => id !== childId)
        : [...current.childIds, childId],
    }));
  }

  async function save() {
    if (!editable || busyId) return;
    if (!form.title.trim()) {
      setError("Add a responsibility title.");
      return;
    }
    if (!form.responsibleParticipantId) {
      setError("Choose the responsible parent.");
      return;
    }
    if (!form.dueDate) {
      setError("Choose a due date.");
      return;
    }

    setBusyId(form.id ?? "new");
    setError(null);
    setMessage(null);
    try {
      const payload = {
        title: form.title.trim(),
        childIds: form.childIds,
        responsibleParticipantId: form.responsibleParticipantId,
        dueDate: form.dueDate,
        dueTime: form.dueTime || null,
        category: form.category,
        note: form.note.trim() || null,
        recurrence: form.recurrence,
        recurrenceEndDate:
          form.recurrence === "none" ? null : form.recurrenceEndDate || null,
        linkedEventId: form.linkedEventId || null,
        linkedExpenseId: form.linkedExpenseId || null,
        reason: form.reason.trim() || null,
      };

      const response = await fetch("/api/responsibilities", {
        method: form.id ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form.id ? { id: form.id, ...payload } : payload),
      });
      const body = (await response.json().catch(() => null)) as
        | { error?: string; pending?: boolean; approverName?: string | null }
        | null;
      if (!response.ok) {
        throw new Error(body?.error ?? "The responsibility could not be saved.");
      }

      setFormOpen(false);
      setMessage(
        body?.pending
          ? body.approverName
            ? `Responsibility sent to ${body.approverName} for approval.`
            : "Responsibility sent for approval."
          : form.id
            ? "Responsibility updated."
            : "Responsibility added.",
      );
      await refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The responsibility could not be saved.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function updateCompletion(item: Responsibility) {
    if (
      !editable ||
      busyId ||
      item.responsibleParticipantId !== data?.currentParticipantId
    ) {
      return;
    }

    const operation = item.status === "completed" ? "reopen" : "complete";
    setBusyId(item.id);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/responsibilities/${item.id}/completion`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ operation }),
        },
      );
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(
          body?.error ?? "The responsibility completion could not be updated.",
        );
      }
      setMessage(
        operation === "complete"
          ? item.recurrence === "none"
            ? "Responsibility completed."
            : "Responsibility completed. The next occurrence was created when applicable."
          : "Responsibility reopened.",
      );
      await refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The responsibility completion could not be updated.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function remove(item: Responsibility) {
    if (!editable || busyId || item.status === "completed") return;
    if (!window.confirm(`Remove “${item.title}” from responsibilities?`)) return;

    setBusyId(item.id);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/responsibilities", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: item.id, reason: null }),
      });
      const body = (await response.json().catch(() => null)) as
        | { error?: string; pending?: boolean; approverName?: string | null }
        | null;
      if (!response.ok) {
        throw new Error(body?.error ?? "The responsibility could not be removed.");
      }
      setMessage(
        body?.pending
          ? body.approverName
            ? `Removal sent to ${body.approverName} for approval.`
            : "Removal sent for approval."
          : "Responsibility removed.",
      );
      await refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The responsibility could not be removed.",
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-3 py-4 sm:px-6 sm:py-7 lg:px-8">
      <header className="rounded-3xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              <ListChecks className="h-4 w-4" aria-hidden="true" />
              Covie responsibilities
            </div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
              Responsibilities
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              Keep practical tasks clear: what needs doing, who owns it and when it is due.
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
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              Calendar
            </Link>
            {editable ? (
              <button
                type="button"
                onClick={openCreate}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add responsibility
              </button>
            ) : null}
          </div>
        </div>
      </header>

      {dateFilter ? (
        <div className="mt-4 flex flex-col gap-2 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4" aria-hidden="true" />
            Showing responsibilities due on {dateLabel(dateFilter)}.
          </span>
          <button
            type="button"
            onClick={() => setDateFilter(null)}
            className="self-start font-semibold hover:underline sm:self-auto"
          >
            Show all responsibilities
          </button>
        </div>
      ) : null}

      {message ? (
        <div
          role="status"
          className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
        >
          {message}
        </div>
      ) : null}
      {error ? (
        <div
          role="alert"
          className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900"
        >
          {error}
        </div>
      ) : null}

      <section className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            Open
          </p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{summary.open}</p>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-700">
            Due today
          </p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{summary.dueToday}</p>
        </div>
        <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-rose-700">
            Overdue
          </p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{summary.overdue}</p>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">
            Completed
          </p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{summary.completed}</p>
        </div>
      </section>

      {(data?.pendingProposals.length ?? 0) > 0 ? (
        <section className="mt-6">
          <h2 className="text-lg font-semibold text-slate-950">Waiting for agreement</h2>
          <p className="mt-1 text-sm text-slate-500">
            The agreed responsibility stays unchanged until the proposal is accepted.
          </p>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {data?.pendingProposals.map((proposal) => {
              const previous = proposalResponsibility(proposal.previousState);
              const proposed = proposalResponsibility(proposal.proposedState);
              return (
                <ProposalCard
                  key={proposal.id}
                  status={proposal.status}
                  title={
                    proposal.action === "create"
                      ? "New responsibility"
                      : proposal.action === "delete"
                        ? "Remove responsibility"
                        : "Responsibility change"
                  }
                  proposedByName={proposal.proposedByName}
                  approverName={proposal.approverName}
                  reason={proposal.reason}
                  agreedSummary={
                    proposal.action === "create"
                      ? "No agreed responsibility yet."
                      : proposalSummary(previous, participants)
                  }
                  proposedSummary={
                    proposal.action === "delete"
                      ? "Remove this responsibility."
                      : proposalSummary(proposed, participants)
                  }
                  actions={
                    <ProposalActions
                      proposalId={proposal.id}
                      currentMembershipId={data.currentMembershipId}
                      proposedByMembershipId={proposal.proposedByMembershipId}
                      approverMembershipId={proposal.approverMembershipId}
                      onChanged={() => {
                        setMessage("Responsibility proposal updated.");
                        void refresh().catch((caught) =>
                          setError(
                            caught instanceof Error
                              ? caught.message
                              : "Responsibilities could not be refreshed.",
                          ),
                        );
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
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Agreed responsibilities</h2>
            <p className="mt-1 text-sm text-slate-500">
              One parent owns each task. If both parents need separate actions, create two responsibilities.
            </p>
          </div>
          <div className="flex max-w-full gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1">
            {(["all", "upcoming", "due_soon", "due_today", "overdue", "completed"] as const).map(
              (value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setStatusFilter(value)}
                  className={`min-h-9 shrink-0 rounded-lg px-3 text-xs font-semibold ${
                    statusFilter === value
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {value === "all" ? "All" : statusLabels[value]}
                </button>
              ),
            )}
          </div>
        </div>

        {loading ? (
          <div className="mt-4 flex min-h-40 items-center justify-center rounded-2xl border border-slate-200 bg-white text-sm text-slate-500">
            <LoaderCircle className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            Loading responsibilities…
          </div>
        ) : filtered.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-8 text-center">
            <CheckSquare2 className="mx-auto h-7 w-7 text-slate-400" aria-hidden="true" />
            <p className="mt-2 font-semibold text-slate-800">Nothing here</p>
            <p className="mt-1 text-sm text-slate-500">
              {dateFilter
                ? "No agreed responsibilities are due on this date."
                : "Add a task when there is something useful to make clearly owned."}
            </p>
          </div>
        ) : (
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {filtered.map((item) => {
              const parent = participants.find(
                (participant) => participant.id === item.responsibleParticipantId,
              );
              const itemChildren = children.filter((child) =>
                item.childIds.includes(child.id),
              );
              const canComplete =
                editable &&
                item.responsibleParticipantId === data?.currentParticipantId;
              const linkedEvent = data?.events.find((event) => event.id === item.linkedEventId);
              const linkedExpense = data?.expenses.find(
                (expense) => expense.id === item.linkedExpenseId,
              );

              return (
                <article
                  key={item.id}
                  className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
                >
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      disabled={!canComplete || busyId === item.id}
                      onClick={() => void updateCompletion(item)}
                      aria-label={
                        item.status === "completed"
                          ? item.nextOccurrenceId
                            ? `${item.title} completed`
                            : `Reopen ${item.title}`
                          : canComplete
                            ? `Mark ${item.title} complete`
                            : `${item.title} is assigned to ${parent?.displayName ?? "the other parent"}`
                      }
                      className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${
                        item.status === "completed"
                          ? item.nextOccurrenceId
                            ? "border-emerald-200 bg-emerald-100 text-emerald-700"
                            : "border-emerald-300 bg-emerald-100 text-emerald-700 hover:bg-emerald-50"
                          : canComplete
                            ? "border-slate-300 bg-white text-slate-400 hover:border-emerald-400 hover:text-emerald-600"
                            : "border-slate-200 bg-slate-50 text-slate-300"
                      }`}
                    >
                      {busyId === item.id ? (
                        <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : item.status === "completed" ? (
                        item.nextOccurrenceId ? (
                          <Check className="h-4 w-4" aria-hidden="true" />
                        ) : (
                          <RotateCcw className="h-4 w-4" aria-hidden="true" />
                        )
                      ) : null}
                    </button>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusClass(
                            item.status,
                          )}`}
                        >
                          {statusLabels[item.status]}
                        </span>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                          {categoryLabels[item.category]}
                        </span>
                        {item.recurrence !== "none" ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-700">
                            <Repeat2 className="h-3 w-3" aria-hidden="true" />
                            {recurrenceLabels[item.recurrence]}
                          </span>
                        ) : null}
                      </div>
                      <h3
                        className={`mt-2 text-lg font-semibold ${
                          item.status === "completed"
                            ? "text-slate-500 line-through"
                            : "text-slate-950"
                        }`}
                      >
                        {item.title}
                      </h3>
                      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
                        <span className="inline-flex items-center gap-1">
                          <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
                          {parent?.id === data?.currentParticipantId
                            ? "You"
                            : parent?.displayName ?? "Parent"}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                          {dateLabel(item.dueDate)}
                        </span>
                        {item.dueTime ? (
                          <span className="inline-flex items-center gap-1">
                            <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                            {item.dueTime}
                          </span>
                        ) : null}
                      </p>
                    </div>
                  </div>

                  {itemChildren.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {itemChildren.map((child) => (
                        <span
                          key={child.id}
                          className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700"
                        >
                          {child.displayName}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  {item.note ? (
                    <p className="mt-3 text-sm leading-5 text-slate-600">{item.note}</p>
                  ) : null}

                  {linkedEvent || linkedExpense ? (
                    <div className="mt-3 space-y-1 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
                      {linkedEvent ? (
                        <p className="flex items-center gap-2">
                          <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
                          Event: {linkedEvent.title}
                        </p>
                      ) : null}
                      {linkedExpense ? (
                        <p className="flex items-center gap-2">
                          <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
                          Expense: {linkedExpense.title}
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  <AttachmentPanel
                    entityType="responsibility"
                    entityId={item.id}
                    defaultCategory="school_form"
                    title="Documents"
                    compact
                  />

                  {editable && item.status !== "completed" ? (
                    <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                      <button
                        type="button"
                        disabled={Boolean(busyId)}
                        onClick={() => openEdit(item)}
                        className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={Boolean(busyId)}
                        onClick={() => void remove(item)}
                        className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-rose-200 px-3 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        Remove
                      </button>
                    </div>
                  ) : item.status === "completed" ? (
                    <p className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-4 text-xs font-semibold text-emerald-700">
                      <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                      Completed tasks stay in history.
                    </p>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {formOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/35 sm:items-center sm:p-4">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="responsibility-form-title"
            className="max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Shared responsibility
                </p>
                <h2
                  id="responsibility-form-title"
                  className="mt-1 text-2xl font-semibold text-slate-950"
                >
                  {form.id ? "Edit responsibility" : "Add responsibility"}
                </h2>
              </div>
              <button
                type="button"
                disabled={Boolean(busyId)}
                onClick={() => setFormOpen(false)}
                aria-label="Close responsibility form"
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-50"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            {!form.id ? (
              <div className="mt-5">
                <p className="text-sm font-semibold text-slate-800">Quick start</p>
                <p className="mt-1 text-xs text-slate-500">
                  These only prefill the form. Everything stays editable.
                </p>
                <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                  {templates.map((template) => (
                    <button
                      key={template.key}
                      type="button"
                      onClick={() => applyTemplate(template)}
                      className="min-h-10 shrink-0 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      {template.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="sm:col-span-2">
                <span className="text-sm font-semibold text-slate-800">What needs doing?</span>
                <input
                  type="text"
                  maxLength={100}
                  value={form.title}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, title: event.target.value }))
                  }
                  placeholder="e.g. Return school permission form"
                  className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 px-4 text-base outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                />
              </label>

              <label>
                <span className="text-sm font-semibold text-slate-800">
                  Responsible parent
                </span>
                <select
                  value={form.responsibleParticipantId}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      responsibleParticipantId: event.target.value,
                    }))
                  }
                  className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                >
                  {participants.map((participant) => (
                    <option key={participant.id} value={participant.id}>
                      {participant.id === data?.currentParticipantId
                        ? "You"
                        : participant.displayName}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span className="text-sm font-semibold text-slate-800">Category</span>
                <select
                  value={form.category}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      category: event.target.value as ResponsibilityCategory,
                    }))
                  }
                  className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                >
                  {Object.entries(categoryLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span className="text-sm font-semibold text-slate-800">Due date</span>
                <input
                  type="date"
                  value={form.dueDate}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, dueDate: event.target.value }))
                  }
                  className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                />
              </label>

              <label>
                <span className="text-sm font-semibold text-slate-800">
                  Time <span className="font-normal text-slate-400">(optional)</span>
                </span>
                <input
                  type="time"
                  value={form.dueTime}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, dueTime: event.target.value }))
                  }
                  className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                />
              </label>
            </div>

            {children.length > 0 ? (
              <div className="mt-5">
                <p className="text-sm font-semibold text-slate-800">
                  Child / children <span className="font-normal text-slate-400">(optional)</span>
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {children.map((child) => {
                    const selected = form.childIds.includes(child.id);
                    return (
                      <button
                        key={child.id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => toggleChild(child.id)}
                        className={`min-h-10 rounded-xl border px-3 text-sm font-semibold ${
                          selected
                            ? "border-blue-600 bg-blue-600 text-white"
                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        {child.displayName}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label>
                <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                  <Repeat2 className="h-4 w-4" aria-hidden="true" />
                  Repeat
                </span>
                <select
                  value={form.recurrence}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      recurrence: event.target.value as ResponsibilityRecurrence,
                      recurrenceEndDate:
                        event.target.value === "none"
                          ? ""
                          : current.recurrenceEndDate,
                    }))
                  }
                  className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                >
                  {Object.entries(recurrenceLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>

              {form.recurrence !== "none" ? (
                <label>
                  <span className="text-sm font-semibold text-slate-800">
                    Repeat until{" "}
                    <span className="font-normal text-slate-400">(optional)</span>
                  </span>
                  <input
                    type="date"
                    value={form.recurrenceEndDate}
                    min={form.dueDate}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        recurrenceEndDate: event.target.value,
                      }))
                    }
                    className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  />
                </label>
              ) : null}
            </div>

            <label className="mt-5 block">
              <span className="text-sm font-semibold text-slate-800">
                Notes <span className="font-normal text-slate-400">(optional)</span>
              </span>
              <textarea
                rows={3}
                maxLength={500}
                value={form.note}
                onChange={(event) =>
                  setForm((current) => ({ ...current, note: event.target.value }))
                }
                placeholder="Short practical detail"
                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-base outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              />
            </label>

            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                <Link2 className="h-4 w-4" aria-hidden="true" />
                Related items <span className="font-normal text-slate-400">(optional)</span>
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label>
                  <span className="text-xs font-semibold text-slate-600">Calendar event</span>
                  <select
                    value={form.linkedEventId}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        linkedEventId: event.target.value,
                      }))
                    }
                    className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  >
                    <option value="">No linked event</option>
                    {data?.events.map((event) => (
                      <option key={event.id} value={event.id}>
                        {event.title} · {dateLabel(event.startDate)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="text-xs font-semibold text-slate-600">Expense</span>
                  <select
                    value={form.linkedExpenseId}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        linkedExpenseId: event.target.value,
                      }))
                    }
                    className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  >
                    <option value="">No linked expense</option>
                    {data?.expenses.map((expense) => (
                      <option key={expense.id} value={expense.id}>
                        {expense.title} · {dateLabel(expense.expenseDate)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            <label className="mt-5 block">
              <span className="text-sm font-semibold text-slate-800">
                Reason for change{" "}
                <span className="font-normal text-slate-400">(optional)</span>
              </span>
              <textarea
                rows={2}
                maxLength={500}
                value={form.reason}
                onChange={(event) =>
                  setForm((current) => ({ ...current, reason: event.target.value }))
                }
                placeholder="Used if this needs the other parent's approval"
                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-base outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              />
              <span className="mt-1 block text-xs text-slate-500">
                Assigning or changing work for the other linked parent requires their approval.
              </span>
            </label>

            <div className="mt-6 flex flex-col-reverse gap-2 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={Boolean(busyId)}
                onClick={() => setFormOpen(false)}
                className="min-h-12 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={Boolean(busyId)}
                onClick={() => void save()}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {busyId ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : null}
                {form.id ? "Save change" : "Add responsibility"}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {!editable && data ? (
        <p className="mx-auto mt-5 max-w-2xl text-center text-xs leading-5 text-slate-400">
          You have view-only access to responsibilities.
        </p>
      ) : null}
    </main>
  );
}
