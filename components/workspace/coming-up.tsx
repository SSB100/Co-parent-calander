"use client";

import { CalendarClock, Clock3 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

type EventItem = {
  id: string;
  title: string;
  date: string;
  time: string | null;
  kind: "Event" | "Handover";
  category: string;
  href: string;
};
type Payload = { items: EventItem[]; total: number };

function eventDate(item: EventItem) {
  const date = new Date(`${item.date}T12:00:00`);
  const label = date.toLocaleDateString("en-NZ", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  return item.time ? `${label} · ${item.time}` : label;
}

export function ComingUp({ variant = "nav" }: { variant?: "nav" | "rail" }) {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    document
      .querySelectorAll(".mobile-coming-up details")
      .forEach((element) => element.removeAttribute("open"));

    const controller = new AbortController();
    async function refresh() {
      try {
        const response = await fetch("/api/coming-up", {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok) throw new Error();
        const result: Payload = await response.json();
        if (!controller.signal.aborted) {
          setData(result);
          setError(false);
        }
      } catch {
        if (!controller.signal.aborted) {
          setData(null);
          setError(true);
        }
      }
    }

    void refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("covie-records-updated", refresh);
    return () => {
      controller.abort();
      window.removeEventListener("focus", refresh);
      window.removeEventListener("covie-records-updated", refresh);
    };
  }, []);

  const content = (
    <div className="coming-up-content">
      {error ? (
        <p role="status">Unable to load events right now.</p>
      ) : !data ? (
        <p>Loading…</p>
      ) : (
        <>
          {data.items.length === 0 ? <p>No upcoming events or handovers.</p> : null}
          {data.items.map((item) => (
            <Link key={item.id} href={item.href} className="coming-up-item">
              <span className="flex items-start gap-2 font-medium">
                {item.kind === "Handover" ? (
                  <Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                ) : (
                  <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                )}
                <span>{item.title}</span>
              </span>
              <span className="text-xs">
                {item.kind} · {eventDate(item)}
              </span>
            </Link>
          ))}
          {data.total > data.items.length ? (
            <Link className="coming-up-item text-xs underline" href="/calendar">
              View more in Calendar
            </Link>
          ) : null}
        </>
      )}
    </div>
  );

  if (variant === "rail") {
    return (
      <section className="workspace-coming-up covie-events-rail" aria-labelledby="your-events-title">
        <h2 id="your-events-title" className="text-sm font-bold text-slate-900">
          Your Events
        </h2>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          Next events and handovers in date order.
        </p>
        {content}
      </section>
    );
  }

  return (
    <details className="workspace-coming-up" open>
      <summary>Your Events</summary>
      {content}
    </details>
  );
}
