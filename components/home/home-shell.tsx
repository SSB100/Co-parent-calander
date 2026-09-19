"use client";

import {
  CalendarDays,
  CheckCircle2,
  CheckSquare2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  ListChecks,
  LoaderCircle,
  MapPin,
  ReceiptText,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ProposalActions } from "@/components/approvals/proposal-actions";
import { ProposalCard } from "@/components/approvals/proposal-card";
import { EventCategoryIcon } from "@/components/calendar/event-category-icon";
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

type HomePayload = {
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
    expense: HomeExpense | null;
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

function shortDateLabel(value: string) {
  return new Intl.DateTimeFormat("en-NZ", {
    weekday: "short",
    day: "numeric",
    month: "short",
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

function eventIcon(category: string) { return <EventCategoryIcon category={category} />; }

export function HomeShell() {
  const [data, setData] = useState<HomePayload | null>(null);
  const [loading, setLoading] = useState(true);
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

  useEffect(() => {
    let cancelled = false;

    fetch("/api/home", { cache: "no-store" })
      .then(async (response) => ({
        response,
        body: (await response.json().catch(() => null)) as
          | HomePayload
          | { error?: string }
          | null,
      }))
      .then(({ response, body }) => {
        if (cancelled) return;
        if (!response.ok || !body || !("calendar" in body)) {
          setError(
            body && "error" in body && body.error
              ? body.error
              : "Updates could not be loaded.",
          );
          return;
        }
        setData(body);
        setError(null);
      })
      .catch(() => {
        if (!cancelled) setError("Updates could not be loaded.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
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

  if (loading && !data) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-6xl items-center justify-center px-4">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
          Loading Updates…
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-3 py-4 sm:px-6 sm:py-7 lg:px-8">
      <header className="covie-page-header">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="covie-page-title text-3xl sm:text-4xl">Updates</h1>
            <p className="mt-1 text-sm text-slate-500">
              {data
                ? `${data.calendar.name} · ${weekdayDateLabel(data.today.date)} · Hi, ${data.currentUserName}`
                : "Your shared updates"}
            </p>
          </div>

          <WorkspaceNav active="home" />
        </div>
      </header>

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

      <section className="mt-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-950">Needs attention</h2>
            <p className="mt-1 text-sm text-slate-500">
              {attentionCount > 0
                ? `${attentionCount} ${attentionCount === 1 ? "item" : "items"} to look at`
                : "You're all caught up."}
            </p>
          </div>
        </div>

        {data && attentionCount === 0 ? (
          <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-emerald-600">
                <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <p className="font-semibold text-slate-900">Nothing needs action right now.</p>
                <p className="mt-1 text-sm text-slate-600">
                  No approvals are waiting on you, and there are no urgent expenses or overdue responsibilities.
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {data && attentionCount > 0 ? (
          <div className="mt-3 grid gap-3 xl:grid-cols-2">
            {data.needsAttention.approvals.map((proposal) => (
              <ProposalCard
                key={proposal.id}
                status="waiting"
                title={proposal.title}
                proposedByName={proposal.proposedByName}
                approverName={proposal.approverName}
                reason={proposal.reason}
                proposedSummary={proposal.summary}
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
                    : `${money(expense.reimbursement.amountCents)} reimbursement outstanding`;

              return (
                <Link
                  key={expense.id}
                  href={`/expenses?date=${encodeURIComponent(expense.dueDate)}`}
                  className="group rounded-2xl border border-amber-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                        <CircleDollarSign className="h-5 w-5" aria-hidden="true" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full px-2 py-1 text-[10px] font-semibold ${urgencyClass(
                              expense.urgency,
                            )}`}
                          >
                            {urgencyLabel(expense.urgency)}
                          </span>
                          <span className="text-xs text-slate-500">
                            {dateLabel(expense.dueDate)}
                          </span>
                        </div>
                        <h3 className="mt-2 truncate font-semibold text-slate-950">
                          {expense.title}
                        </h3>
                        <p className="mt-1 text-sm text-slate-600">
                          {moneyText} · paid by {payerName}
                        </p>
                      </div>
                    </div>
                    <ChevronRight
                      className="mt-1 h-4 w-4 shrink-0 text-slate-400 transition group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  </div>
                </Link>
              );
            })}

            {data.needsAttention.responsibilities.map((item) => (
              <Link
                key={item.id}
                href={`/responsibilities?date=${encodeURIComponent(item.dueDate)}`}
                className="group rounded-lg border-b border-slate-200 px-4 py-5 transition hover:bg-white"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                      <CheckSquare2 className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-2 py-1 text-[10px] font-semibold ${urgencyClass(
                            item.urgency,
                          )}`}
                        >
                          {urgencyLabel(item.urgency)}
                        </span>
                        <span className="text-xs text-slate-500">
                          {item.dueTime
                            ? `${dateLabel(item.dueDate)} · ${item.dueTime}`
                            : dateLabel(item.dueDate)}
                        </span>
                      </div>
                      <h3 className="mt-2 truncate font-semibold text-slate-950">
                        {item.title}
                      </h3>
                      <p className="mt-1 text-sm text-slate-600">
                        Responsible: {participantName(item.responsibleParticipantId)}
                      </p>
                    </div>
                  </div>
                  <ChevronRight
                    className="mt-1 h-4 w-4 shrink-0 text-slate-400 transition group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </div>
              </Link>
            ))}
          </div>
        ) : null}
      </section>

      {data ? (
        <section className="mt-8">
          <div>
            <h2 className="text-xl font-semibold text-slate-950">Today</h2>
            <p className="mt-1 text-sm text-slate-500">{weekdayDateLabel(data.today.date)}</p>
          </div>

          <div className="mt-3 grid gap-x-6 md:grid-cols-2">
            <Link
              href="/calendar"
              className="rounded-lg border-b border-slate-200 px-4 py-5 transition hover:bg-white"
            >
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                <CalendarDays className="h-4 w-4" aria-hidden="true" />
                Parenting
              </div>
              <p className="mt-3 font-semibold text-slate-950">
                {data.today.parentingLabel}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Open the calendar for full day details.
              </p>
            </Link>

            <Link
              href="/calendar"
              className="rounded-lg border-b border-slate-200 px-4 py-5 transition hover:bg-white"
            >
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                <Clock3 className="h-4 w-4" aria-hidden="true" />
                Handover
              </div>
              {data.today.handover ? (
                <>
                  <p className="mt-3 font-semibold text-slate-950">
                    {data.today.handover.handoverTime?.slice(0, 5) ?? "Split day"}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    {participantName(data.today.handover.morningParentId)} →{" "}
                    {participantName(data.today.handover.afternoonParentId)}
                  </p>
                  {data.today.handover.handoverLocation ? (
                    <p className="mt-2 flex items-center gap-1 text-xs text-slate-500">
                      <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                      {data.today.handover.handoverLocation}
                    </p>
                  ) : null}
                </>
              ) : (
                <>
                  <p className="mt-3 font-semibold text-slate-950">No handover today</p>
                  <p className="mt-1 text-sm text-slate-500">
                    Nothing practical is recorded for today.
                  </p>
                </>
              )}
            </Link>

            <Link
              href="/calendar"
              className="rounded-lg border-b border-slate-200 px-4 py-5 transition hover:bg-white"
            >
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                <ReceiptText className="h-4 w-4" aria-hidden="true" />
                Events
              </div>
              {data.today.events.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {data.today.events.slice(0, 3).map((event) => (
                    <div key={event.id}>
                      <p className="truncate text-sm font-semibold text-slate-900">
                        <span className="mr-1" aria-hidden="true">
                          {eventIcon(event.category)}
                        </span>
                        {event.title}
                      </p>
                    </div>
                  ))}
                  {data.today.events.length > 3 ? (
                    <p className="text-xs text-slate-500">
                      +{data.today.events.length - 3} more
                    </p>
                  ) : null}
                </div>
              ) : (
                <>
                  <p className="mt-3 font-semibold text-slate-950">No events today</p>
                  <p className="mt-1 text-sm text-slate-500">
                    Shared plans are clear.
                  </p>
                </>
              )}
            </Link>

            <Link
              href={`/responsibilities?date=${encodeURIComponent(data.today.date)}`}
              className="rounded-lg border-b border-slate-200 px-4 py-5 transition hover:bg-white"
            >
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                <ListChecks className="h-4 w-4" aria-hidden="true" />
                Responsibilities
              </div>
              {data.today.responsibilities.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {data.today.responsibilities.slice(0, 3).map((item) => (
                    <div key={item.id} className="flex items-center gap-2">
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full ${
                          item.completedAt ? "bg-emerald-500" : "bg-slate-500"
                        }`}
                        aria-hidden="true"
                      />
                      <p
                        className={`truncate text-sm font-semibold ${
                          item.completedAt
                            ? "text-slate-500 line-through"
                            : "text-slate-900"
                        }`}
                      >
                        {item.title}
                      </p>
                    </div>
                  ))}
                  {data.today.responsibilities.length > 3 ? (
                    <p className="text-xs text-slate-500">
                      +{data.today.responsibilities.length - 3} more
                    </p>
                  ) : null}
                </div>
              ) : (
                <>
                  <p className="mt-3 font-semibold text-slate-950">Nothing due today</p>
                  <p className="mt-1 text-sm text-slate-500">
                    No responsibilities are due today.
                  </p>
                </>
              )}
            </Link>
          </div>
        </section>
      ) : null}

      {data ? (
        <section className="mt-8 pb-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Coming up
            </p>
            <h2 className="mt-1 text-xl font-semibold text-slate-950">
              Upcoming
            </h2>
          </div>

          <div className="mt-3 grid gap-x-6 md:grid-cols-2">
            <Link
              href="/calendar"
              className="rounded-lg border-b border-slate-200 px-4 py-5 transition hover:bg-white"
            >
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                <Clock3 className="h-4 w-4" aria-hidden="true" />
                Next handover
              </div>
              {data.comingUp.handover ? (
                <>
                  <p className="mt-3 font-semibold text-slate-950">
                    {shortDateLabel(data.comingUp.handover.date)}
                    {data.comingUp.handover.handoverTime
                      ? ` · ${data.comingUp.handover.handoverTime.slice(0, 5)}`
                      : ""}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    {participantName(data.comingUp.handover.morningParentId)} →{" "}
                    {participantName(data.comingUp.handover.afternoonParentId)}
                  </p>
                </>
              ) : (
                <p className="mt-3 text-sm font-semibold text-slate-700">
                  No handover scheduled
                </p>
              )}
            </Link>

            <Link
              href="/calendar"
              className="rounded-lg border-b border-slate-200 px-4 py-5 transition hover:bg-white"
            >
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                <CalendarDays className="h-4 w-4" aria-hidden="true" />
                Next event
              </div>
              {data.comingUp.event ? (
                <>
                  <p className="mt-3 truncate font-semibold text-slate-950">
                    {eventIcon(data.comingUp.event.category)}{" "}
                    {data.comingUp.event.title}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    {shortDateLabel(data.comingUp.event.startDate)}
                  </p>
                </>
              ) : (
                <p className="mt-3 text-sm font-semibold text-slate-700">
                  Nothing scheduled
                </p>
              )}
            </Link>

            <Link
              href={
                data.comingUp.expense
                  ? `/expenses?date=${encodeURIComponent(
                      data.comingUp.expense.dueDate,
                    )}`
                  : "/expenses"
              }
              className="rounded-lg border-b border-slate-200 px-4 py-5 transition hover:bg-white"
            >
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                <CircleDollarSign className="h-4 w-4" aria-hidden="true" />
                Next expense
              </div>
              {data.comingUp.expense ? (
                <>
                  <p className="mt-3 truncate font-semibold text-slate-950">
                    {data.comingUp.expense.title}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    Due {shortDateLabel(data.comingUp.expense.dueDate)}
                  </p>
                </>
              ) : (
                <p className="mt-3 text-sm font-semibold text-slate-700">
                  Nothing due later
                </p>
              )}
            </Link>

            <Link
              href={
                data.comingUp.responsibility
                  ? `/responsibilities?date=${encodeURIComponent(
                      data.comingUp.responsibility.dueDate,
                    )}`
                  : "/responsibilities"
              }
              className="rounded-lg border-b border-slate-200 px-4 py-5 transition hover:bg-white"
            >
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                <CheckSquare2 className="h-4 w-4" aria-hidden="true" />
                Next responsibility
              </div>
              {data.comingUp.responsibility ? (
                <>
                  <p className="mt-3 truncate font-semibold text-slate-950">
                    {data.comingUp.responsibility.title}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    {shortDateLabel(data.comingUp.responsibility.dueDate)}
                    {data.comingUp.responsibility.dueTime
                      ? ` · ${data.comingUp.responsibility.dueTime}`
                      : ""}
                  </p>
                </>
              ) : (
                <p className="mt-3 text-sm font-semibold text-slate-700">
                  Nothing due next
                </p>
              )}
            </Link>
          </div>
        </section>
      ) : null}

      {data && data.children.length > 0 ? (
        <section className="mt-8 pb-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Kids
            </p>
            <h2 className="mt-1 text-xl font-semibold text-slate-950">
              Your child profiles
            </h2>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {data.children.map((child) => (
              <Link
                key={child.id}
                href={`/kids/${child.id}`}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
              >
                <UsersRound className="h-4 w-4 text-slate-500" aria-hidden="true" />
                {child.displayName}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {data?.permission === "viewer" ? (
        <p className="mx-auto mb-6 max-w-2xl text-center text-xs leading-5 text-slate-400">
          You have view-only access. Home still shows the shared picture, but editing actions are hidden.
        </p>
      ) : null}

      <div className="sr-only" aria-live="polite">
        {data && attentionCount === 0
          ? "You're all caught up."
          : data
            ? `${attentionCount} items need attention.`
            : ""}
      </div>
    </main>
  );
}
