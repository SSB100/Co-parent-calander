"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { comingUp } from "@/lib/workspace/coming-up";

type Summary = ReturnType<typeof comingUp>;

export function ComingUp() {
  const [data, setData] = useState<Summary | null>(null);
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
        const result: Summary = await response.json();
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

  return (
    <details className="workspace-coming-up" open>
      <summary>Your Events</summary>
      <div className="coming-up-content">
        {error ? (
          <p role="status">Unable to load events. Open Calendar to check what’s next.</p>
        ) : !data ? (
          <p>Loading…</p>
        ) : (
          <>
            {data.items.length === 0 ? <p>No upcoming events or handovers.</p> : null}
            {data.items.map((item) => (
              <Link
                key={`${item.kind}-${item.id}`}
                href={item.href}
                className="coming-up-item"
              >
                <span className="font-medium">{item.title}</span>
                <span className="text-xs">
                  {item.kind} ·{" "}
                  {new Date(`${item.date}T12:00:00`).toLocaleDateString("en-NZ", {
                    day: "numeric",
                    month: "short",
                  })}
                </span>
              </Link>
            ))}
            {data.total > 6 ? (
              <Link className="coming-up-item text-xs underline" href="/calendar">
                View all in Calendar
              </Link>
            ) : null}
          </>
        )}
      </div>
    </details>
  );
}
