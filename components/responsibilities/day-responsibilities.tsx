"use client";

import { Check, CheckSquare2, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type DayResponsibility = {
  id: string;
  title: string;
  responsibleParticipantId: string;
  dueTime: string | null;
  status: "upcoming" | "due_soon" | "due_today" | "overdue" | "completed";
};

type DayPayload = {
  currentParticipantId: string | null;
  responsibilities: DayResponsibility[];
  pendingProposals: Array<{ id: string }>;
};

export function DayResponsibilities({
  date,
  readOnly = false,
  onChanged,
}: {
  date: string;
  readOnly?: boolean;
  onChanged?: () => void;
}) {
  const [payload, setPayload] = useState<DayPayload | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback((cancelled?: () => boolean) => {
    return fetch(`/api/responsibilities?date=${encodeURIComponent(date)}`, { cache: "no-store" })
      .then(async (response) => ({
        response,
        body: (await response.json().catch(() => null)) as DayPayload | { error?: string } | null,
      }))
      .then(({ response, body }) => {
        if (cancelled?.()) return;
        if (!response.ok || !body || !("responsibilities" in body)) {
          setError(body && "error" in body && body.error ? body.error : "Tasks could not be loaded.");
          return;
        }
        setPayload(body);
        setError(null);
      })
      .catch(() => {
        if (!cancelled?.()) setError("Tasks could not be loaded.");
      });
  }, [date]);

  useEffect(() => {
    let cancelled = false;
    void load(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [load]);

  async function complete(item: DayResponsibility) {
    if (
      readOnly ||
      busyId ||
      item.status === "completed" ||
      item.responsibleParticipantId !== payload?.currentParticipantId
    ) {
      return;
    }

    setBusyId(item.id);
    setError(null);
    try {
      const response = await fetch(`/api/responsibilities/${item.id}/completion`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ operation: "complete" }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? "The task could not be completed.");
      await load();
      onChanged?.();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The task could not be completed.");
    } finally {
      setBusyId(null);
    }
  }

  const responsibilities = payload?.responsibilities ?? [];
  const pendingCount = payload?.pendingProposals.length ?? 0;

  return (
    <div className="mt-6 border-t border-slate-200 pt-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 font-semibold text-slate-900">
            <CheckSquare2 className="h-4 w-4 text-[#6651B7]" aria-hidden="true" />
            Tasks
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Shared tasks due on this date.
          </p>
        </div>
        <Link
          href={`/responsibilities?date=${encodeURIComponent(date)}`}
          className="covie-action-violet shrink-0 rounded-xl px-3 py-2 text-xs"
        >
          {readOnly ? "View" : "Add / manage"}
        </Link>
      </div>

      {error ? (
        <p role="alert" className="mt-3 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </p>
      ) : payload === null ? (
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
          Loading tasks…
        </div>
      ) : responsibilities.length === 0 ? (
        <p className="mt-3 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
          No agreed tasks are due on this day.
        </p>
      ) : (
        <div className="mt-3 space-y-2">
          {responsibilities.map((item) => {
            const canComplete =
              !readOnly &&
              item.status !== "completed" &&
              item.responsibleParticipantId === payload.currentParticipantId;
            return (
              <div
                key={item.id}
                className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3"
              >
                <button
                  type="button"
                  disabled={!canComplete || busyId === item.id}
                  onClick={() => void complete(item)}
                  aria-label={
                    item.status === "completed"
                      ? `${item.title} completed`
                      : canComplete
                        ? `Mark ${item.title} complete`
                        : `${item.title} assigned to the other parent`
                  }
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${
                    item.status === "completed"
                      ? "border-emerald-300 bg-emerald-100 text-emerald-700"
                      : canComplete
                        ? "border-[#19A897] bg-[#EAF8F5] text-[#0D7A6D] hover:bg-[#BFEDE6]"
                        : "border-slate-200 bg-slate-50 text-slate-300"
                  }`}
                >
                  {busyId === item.id ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : item.status === "completed" ? (
                    <Check className="h-4 w-4" aria-hidden="true" />
                  ) : null}
                </button>
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-sm font-semibold ${
                    item.status === "completed" ? "text-slate-500 line-through" : "text-slate-900"
                  }`}>
                    {item.title}
                  </p>
                  {item.dueTime ? (
                    <p className="mt-0.5 text-xs text-slate-500">Due {item.dueTime}</p>
                  ) : null}
                </div>
                <span
                  className={`rounded-full px-2 py-1 text-[10px] font-semibold ${
                    item.status === "completed"
                      ? "bg-emerald-100 text-emerald-700"
                      : item.status === "overdue"
                        ? "bg-rose-100 text-rose-700"
                        : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {item.status === "completed"
                    ? "Complete"
                    : item.status === "overdue"
                      ? "Overdue"
                      : "Due"}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {pendingCount > 0 ? (
        <p className="mt-2 text-xs font-semibold text-amber-700">
          {pendingCount} task {pendingCount === 1 ? "change is" : "changes are"} waiting for agreement.
        </p>
      ) : null}
    </div>
  );
}
