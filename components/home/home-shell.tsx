"use client";

import {
  CalendarDays,
  CheckCircle2,
  CheckSquare2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  ListChecks,
  ReceiptText,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { ProposalActions } from "@/components/approvals/proposal-actions";
import { ProposalCard } from "@/components/approvals/proposal-card";
import { CoviePage, CoviePageHeader } from "@/components/ui/covie";
import { WorkspaceNav } from "@/components/workspace/workspace-nav";

type Participant = {
  id: string;
  displayName: string;
  colorKey: string;
};

type HomeApproval = {
  id: string;
  entityType: string;
  action: "create" | "edit" | "delete";
  proposedByMembershipId: string;
  approverMembershipId: string | null;
  proposedByName: string;
  approverName: string | null;
  reason: string | null;
  title: string;
  summary: string;
  details: Array<{
    label: string;
    before: string | null;
    after: string | null;
  }>;
};

type HomeExpense = {
  id: string;
  title: string;
  amountCents: number;
  paidByParticipantId: string;
  dueDate: string;
  urgency: "overdue" | "due_today" | "due_soon" | "upcoming";
  reimbursement: {
    direction: "shared" | "owed_to_you" | "you_owe";
    amountCents: number;
  };
};

type HomeUpcomingExpense = Omit<HomeExpense, "urgency">;

type HomeResponsibility = {
  id: string;
  title: string;
  responsibleParticipantId: string;
  dueDate: string;
  dueTime: string | null;
  category: string;
  completedAt: string | null;
  urgency: "overdue" | "due_today" | "due_soon" | "upcoming";
};

type HomeEvent = {
  id: string;
  title: string;
  category: string;
  startDate: string;
  endDate: string | null;
};

type Handover = {
  date: string;
  morningParentId: string | null;
  afternoonParentId: string | null;
  handoverTime: string | null;
  handoverLocation: string | null;
  note: string | null;
};

export type HomePayload = {
  calendar: {
    id: string;
    name: string;
    timezone: string;
  };
  currentParticipantId: string | null;
  currentMembershipId: string;
  currentUserName: string;
  permission: "owner" | "editor" | "viewer";
  participants: Participant[];
  children: Array<{ id: string; displayName: string }>;
  today: {
    date: string;
    parentingLabel: string;
    handover: Handover | null;
    events: HomeEvent[];
    responsibilities: HomeResponsibility[];
  };
  needsAttention: {
    approvals: HomeApproval[];
    expenses: HomeExpense[];
    responsibilities: HomeResponsibility[];
  };
  comingUp: {
    handover: Handover | null;
    event: HomeEvent | null;
    expense: HomeUpcomingExpense | null;
    responsibility: HomeResponsibility | null;
  };
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

function weekdayDateLabel(value: string) {
  return new Intl.DateTimeFormat("en-NZ", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}


function urgencyLabel(value: HomeExpense["urgency"] | HomeResponsibility["urgency"]) {
  if (value === "overdue") return "Overdue";
  if (value === "due_today") return "Due today";
  if (value === "due_soon") return "Due soon";
  return "Upcoming";
}

function urgencyClass(value: HomeExpense["urgency"] | HomeResponsibility["urgency"]) {
  if (value === "overdue") return "bg-rose-100 text-rose-700";
  if (value === "due_today" || value === "due_soon") {
    return "bg-amber-100 text-amber-700";
  }
  return "bg-slate-100 text-slate-600";
}


export function HomeShell({ initialData }: { initialData: HomePayload }) {
  const [data, setData] = useState<HomePayload>(initialData);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/home", { cache: "no-store" });
    const body = (await response.json().catch(() => null)) as
      | HomePayload
      | { error?: string }
      | null;

    if (!response.ok || !body || !("calendar" in body)) {
      throw new Error(
        body && "error" in body && body.error
          ? body.error
          : "Updates could not be loaded.",
      );
    }

    setData(body);
    setError(null);
  }, []);

  const participantName = useCallback(
    (participantId: string | null) => {
      if (!participantId) return "Parent";
      if (participantId === data?.currentParticipantId) return "You";
      return (
        data?.participants.find((participant) => participant.id === participantId)
          ?.displayName ?? "Parent"
      );
    },
    [data],
  );

  const attentionCount = useMemo(() => {
    if (!data) return 0;
    return (
      data.needsAttention.approvals.length +
      data.needsAttention.expenses.length +
      data.needsAttention.responsibilities.length
    );
  }, [data]);

  return (
    <CoviePage className="lg:flex lg:h-screen lg:flex-col lg:overflow-hidden">
      <CoviePageHeader
        accent="coral"
        title="Updates"
        context={
          data
            ? `${data.calendar.name} · ${weekdayDateLabel(data.today.date)} · Hi, ${data.currentUserName}`
            : "Your shared updates"
        }
        actions={<WorkspaceNav active="home" />}
        className="shrink-0"
      />

      {message ? (
        <div role="status" className="mt-2 shrink-0 rounded-xl border border-[#19A897] bg-[#EAF8F5] px-3 py-2 text-sm text-[#0B665C]">
          {message}
        </div>
      ) : null}
      {error ? (
        <div role="alert" className="mt-2 shrink-0 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
          {error}
        </div>
      ) : null}

      <div className="mt-3 grid min-h-0 gap-3 lg:flex-1 lg:grid-cols-[1.12fr_0.88fr]">
        <section className="flex min-h-0 flex-col rounded-2xl border-2 border-[#243139] bg-white p-3 sm:p-4">
          <div className="flex shrink-0 items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-950">Open updates</h2>
              <p className="text-xs text-slate-500">
                {attentionCount > 0
                  ? `${attentionCount} ${attentionCount === 1 ? "item" : "items"} open or waiting`
                  : "You're all caught up."}
              </p>
            </div>
            <span className="rounded-full bg-[#FFD0CB] px-2.5 py-1 text-xs font-bold text-[#8C332D]">
              {attentionCount}
            </span>
          </div>

          {data && attentionCount === 0 ? (
            <div className="mt-3 flex items-center gap-3 rounded-xl border border-[#19A897] bg-[#BFEDE6] px-3 py-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white">
                <CheckCircle2 className="h-4 w-4 text-emerald-700" aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900">Nothing needs action right now.</p>
                <p className="text-xs text-slate-600">No approvals, urgent shared costs or overdue tasks.</p>
              </div>
            </div>
          ) : null}

          {data && attentionCount > 0 ? (
            <div className="mt-3 min-h-0 space-y-2 lg:flex-1 lg:overflow-y-auto lg:pr-1">
              {data.needsAttention.approvals.map((proposal) => (
                <ProposalCard
                  key={proposal.id}
                  status="waiting"
                  title={proposal.title}
                  proposedByName={proposal.proposedByName}
                  approverName={proposal.approverName}
                  reason={proposal.reason}
                  proposedSummary={proposal.summary}
                  changeDetails={proposal.details}
                  actions={
                    <ProposalActions
                      proposalId={proposal.id}
                      currentMembershipId={data.currentMembershipId}
                      proposedByMembershipId={proposal.proposedByMembershipId}
                      approverMembershipId={proposal.approverMembershipId}
                      onChanged={() => {
                        setMessage("Proposal updated.");
                        void refresh().catch((caught) =>
                          setError(
                            caught instanceof Error
                              ? caught.message
                              : "Updates could not be refreshed.",
                          ),
                        );
                      }}
                    />
                  }
                />
              ))}

              {data.needsAttention.expenses.map((expense) => {
                const payerName = participantName(expense.paidByParticipantId);
                const moneyText =
                  expense.reimbursement.direction === "owed_to_you"
                    ? `${money(expense.reimbursement.amountCents)} owed to you`
                    : expense.reimbursement.direction === "you_owe"
                      ? `You owe ${money(expense.reimbursement.amountCents)}`
                      : `${money(expense.reimbursement.amountCents)} outstanding`;

                return (
                  <Link
                    key={expense.id}
                    href={`/expenses?date=${encodeURIComponent(expense.dueDate)}`}
                    className="group flex items-center gap-3 rounded-xl border border-[#243139] bg-[#FFF9DF] p-3 transition hover:-translate-y-0.5"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white">
                      <CircleDollarSign className="h-4 w-4 text-amber-700" aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-sm font-bold text-slate-950">{expense.title}</h3>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${urgencyClass(expense.urgency)}`}>
                          {urgencyLabel(expense.urgency)}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-slate-600">
                        {moneyText} · paid by {payerName} · {dateLabel(expense.dueDate)}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                  </Link>
                );
              })}

              {data.needsAttention.responsibilities.map((item) => (
                <Link
                  key={item.id}
                  href={`/responsibilities?date=${encodeURIComponent(item.dueDate)}`}
                  className="group flex items-center gap-3 rounded-xl border border-[#243139] bg-[#EAF8F5] p-3 transition hover:-translate-y-0.5"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white">
                    <CheckSquare2 className="h-4 w-4 text-[#0D7A6D]" aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-sm font-bold text-slate-950">{item.title}</h3>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${urgencyClass(item.urgency)}`}>
                        {urgencyLabel(item.urgency)}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-slate-600">
                      {participantName(item.responsibleParticipantId)} · {dateLabel(item.dueDate)}
                      {item.dueTime ? ` · ${item.dueTime}` : ""}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                </Link>
              ))}
            </div>
          ) : null}
        </section>

        {data ? (
          <div className="flex min-h-0 flex-col gap-3">
            <section className="rounded-2xl border-2 border-[#243139] bg-[#FFF9F2] p-3 sm:p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-slate-950">Today</h2>
                  <p className="text-xs text-slate-500">{weekdayDateLabel(data.today.date)}</p>
                </div>
                <Link href="/calendar" className="text-xs font-bold text-[#0D7A6D] hover:underline">
                  Calendar
                </Link>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <Link href="/calendar" className="rounded-xl border border-[#243139] bg-[#BFEDE6] p-3">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-600">
                    <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                    Parenting
                  </div>
                  <p className="mt-2 truncate text-sm font-bold text-slate-950">{data.today.parentingLabel}</p>
                </Link>

                <Link href="/calendar" className="rounded-xl border border-[#243139] bg-[#DDD3FA] p-3">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-600">
                    <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                    Handover
                  </div>
                  <p className="mt-2 truncate text-sm font-bold text-slate-950">
                    {data.today.handover
                      ? data.today.handover.handoverTime?.slice(0, 5) ?? "Split day"
                      : "None today"}
                  </p>
                </Link>

                <Link href="/calendar" className="rounded-xl border border-[#243139] bg-[#F7DC86] p-3">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-600">
                    <ReceiptText className="h-3.5 w-3.5" aria-hidden="true" />
                    Events
                  </div>
                  <p className="mt-2 truncate text-sm font-bold text-slate-950">
                    {data.today.events[0]?.title ?? "No events"}
                  </p>
                  {data.today.events.length > 1 ? (
                    <p className="mt-0.5 text-[10px] text-slate-500">+{data.today.events.length - 1} more</p>
                  ) : null}
                </Link>

                <Link
                  href={`/responsibilities?date=${encodeURIComponent(data.today.date)}`}
                  className="rounded-xl border border-[#243139] bg-[#FFD0CB] p-3"
                >
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-600">
                    <ListChecks className="h-3.5 w-3.5" aria-hidden="true" />
                    Tasks
                  </div>
                  <p className="mt-2 truncate text-sm font-bold text-slate-950">
                    {data.today.responsibilities[0]?.title ?? "Nothing due"}
                  </p>
                  {data.today.responsibilities.length > 1 ? (
                    <p className="mt-0.5 text-[10px] text-slate-500">+{data.today.responsibilities.length - 1} more</p>
                  ) : null}
                </Link>
              </div>
            </section>

            <section className="rounded-2xl border border-[#E6DBCF] bg-white p-3 sm:p-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-bold text-slate-900">Children</h2>
                <Link href="/kids" className="text-xs font-bold text-[#6651B7] hover:underline">
                  Manage
                </Link>
              </div>
              {data.children.length === 0 ? (
                <p className="mt-2 text-xs text-slate-500">No child profiles yet.</p>
              ) : (
                <div className="mt-2 flex flex-wrap gap-2">
                  {data.children.map((child) => (
                    <Link
                      key={child.id}
                      href={`/kids/${child.id}`}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-[#243139] bg-[#F4F1FF] px-3 text-xs font-bold text-[#243139]"
                    >
                      <UsersRound className="h-3.5 w-3.5" aria-hidden="true" />
                      {child.displayName}
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </div>
        ) : null}
      </div>

      {data?.permission === "viewer" ? (
        <p className="mt-2 shrink-0 text-center text-[11px] text-slate-400">
          View-only access: editing actions are hidden.
        </p>
      ) : null}

      <div className="sr-only" aria-live="polite">
        {data && attentionCount === 0
          ? "You're all caught up."
          : data
            ? `${attentionCount} items need attention.`
            : ""}
      </div>
    </CoviePage>
  );
}
