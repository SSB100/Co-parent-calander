"use client";

import {
  ArrowRight,
  CalendarClock,
  CircleDollarSign,
  Clock3,
  ListChecks,
} from "lucide-react";
import Link from "next/link";

type EventItem = {
  id: string;
  title: string;
  date: string;
  time: string | null;
  kind: "Event" | "Handover";
  category: string;
  href: string;
};

type ResponsibilityItem = {
  id: string;
  title: string;
  date: string;
  time: string | null;
  overdue: boolean;
  href: string;
};

type ExpenseItem = {
  id: string;
  title: string;
  amountCents: number;
  dueDate: string | null;
  overdue: boolean;
  href: string;
};

export type ComingUpPayload = {
  organiser: {
    responsibilities: ResponsibilityItem[];
    responsibilityTotal: number;
    expenses: ExpenseItem[];
    expenseTotal: number;
  };
  items: EventItem[];
  total: number;
};

const currency = new Intl.NumberFormat("en-NZ", {
  style: "currency",
  currency: "NZD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

function shortDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("en-NZ", {
    day: "numeric",
    month: "short",
  });
}

function eventDate(item: EventItem) {
  const date = new Date(`${item.date}T12:00:00`);
  const day = date.toLocaleDateString("en-NZ", {
    weekday: "short",
    day: "numeric",
  });
  return item.time ? `${day} · ${item.time}` : day;
}

export function ComingUp({
  variant = "default",
  data,
  loading = false,
  error = false,
}: {
  variant?: "default" | "menu";
  data: ComingUpPayload | null;
  loading?: boolean;
  error?: boolean;
}) {
  const idPrefix = variant === "menu" ? "workspace-menu" : "workspace";

  const content = (
    <div className="workspace-context-content">
      {error ? (
        <p role="status" className="workspace-context-empty">
          Unable to load your organiser right now.
        </p>
      ) : !data ? (
        <p className="workspace-context-empty">
          {loading ? "Loading…" : "Open Quick view to load upcoming items."}
        </p>
      ) : (
        <>
          {variant === "menu" ? (
            data.organiser.responsibilities.length > 0 ||
            data.organiser.expenses.length > 0 ? (
              <section
                className="workspace-context-section"
                aria-labelledby={`${idPrefix}-priorities-title`}
              >
                <div className="workspace-context-heading">
                  <h2 id={`${idPrefix}-priorities-title`}>Needs attention</h2>
                </div>

                {data.organiser.responsibilities.map((item) => (
                  <Link
                    key={item.id}
                    href={item.href}
                    className="workspace-priority-row"
                  >
                    <span
                      className={
                        item.overdue
                          ? "workspace-date-chip is-overdue"
                          : "workspace-date-chip"
                      }
                    >
                      {shortDate(item.date)}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{item.title}</span>
                  </Link>
                ))}

                {data.organiser.expenses.map((item) => (
                  <Link
                    key={item.id}
                    href={item.href}
                    className="workspace-priority-row"
                  >
                    <span
                      className={
                        item.overdue
                          ? "workspace-date-chip is-overdue"
                          : "workspace-date-chip"
                      }
                    >
                      {item.dueDate ? shortDate(item.dueDate) : "Open"}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{item.title}</span>
                    <strong className="shrink-0 text-[11px]">
                      {currency.format(item.amountCents / 100)}
                    </strong>
                  </Link>
                ))}
              </section>
            ) : null
          ) : (
            <section
              className="workspace-context-section"
              aria-labelledby={`${idPrefix}-priorities-title`}
            >
              <div className="workspace-context-heading">
                <h2 id={`${idPrefix}-priorities-title`}>Organiser</h2>
                <Link href="/organiser">Open</Link>
              </div>

              <Link
                href="/responsibilities"
                className="workspace-priority-card workspace-priority-responsibility"
              >
                <span className="workspace-priority-icon">
                  <ListChecks aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <strong>Tasks</strong>
                  <span>
                    {data.organiser.responsibilityTotal === 0
                      ? "Nothing open"
                      : `${data.organiser.responsibilityTotal} open`}
                  </span>
                </span>
                <ArrowRight aria-hidden="true" />
              </Link>

              {data.organiser.responsibilities.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  className="workspace-priority-row"
                >
                  <span
                    className={
                      item.overdue
                        ? "workspace-date-chip is-overdue"
                        : "workspace-date-chip"
                    }
                  >
                    {shortDate(item.date)}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{item.title}</span>
                </Link>
              ))}

              <Link
                href="/expenses"
                className="workspace-priority-card workspace-priority-expense"
              >
                <span className="workspace-priority-icon">
                  <CircleDollarSign aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <strong>Shared costs</strong>
                  <span>
                    {data.organiser.expenseTotal === 0
                      ? "Nothing outstanding"
                      : `${data.organiser.expenseTotal} outstanding`}
                  </span>
                </span>
                <ArrowRight aria-hidden="true" />
              </Link>

              {data.organiser.expenses.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  className="workspace-priority-row"
                >
                  <span
                    className={
                      item.overdue
                        ? "workspace-date-chip is-overdue"
                        : "workspace-date-chip"
                    }
                  >
                    {item.dueDate ? shortDate(item.dueDate) : "Open"}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{item.title}</span>
                  <strong className="shrink-0 text-[11px]">
                    {currency.format(item.amountCents / 100)}
                  </strong>
                </Link>
              ))}
            </section>
          )}

          <section
            className="workspace-context-section"
            aria-labelledby={`${idPrefix}-events-title`}
          >
            <div className="workspace-context-heading">
              <h2 id={`${idPrefix}-events-title`}>Your Events</h2>
              <Link href="/calendar">
                {data.total > 3 ? `+${data.total - 3}` : "Calendar"}
              </Link>
            </div>

            {data.items.length === 0 ? (
              <p className="workspace-context-empty">Nothing coming up.</p>
            ) : (
              <div className="workspace-event-stack">
                {data.items.map((item, index) => (
                  <Link
                    key={item.id}
                    href={item.href}
                    className={`workspace-event-card workspace-event-tone-${
                      index % 3
                    }`}
                  >
                    <span className="workspace-event-icon">
                      {item.kind === "Handover" ? (
                        <Clock3 aria-hidden="true" />
                      ) : (
                        <CalendarClock aria-hidden="true" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <strong>{item.title}</strong>
                      <span>{eventDate(item)}</span>
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );

  if (variant === "menu") {
    return (
      <section
        className="workspace-coming-up workspace-coming-up-menu"
        aria-labelledby="workspace-glance-title"
      >
        <div className="workspace-menu-section-heading">
          <h2 id="workspace-glance-title">Quick view</h2>
          <span>Upcoming & outstanding</span>
        </div>
        {content}
      </section>
    );
  }

  return (
    <details className="workspace-coming-up" open>
      <summary>At a glance</summary>
      {content}
    </details>
  );
}
