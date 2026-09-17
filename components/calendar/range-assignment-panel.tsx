"use client";

import { differenceInCalendarDays, eachDayOfInterval, format, parseISO } from "date-fns";
import { CalendarRange, LoaderCircle, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { UndoBulkButton } from "@/components/calendar/undo-bulk-button";

type Parent = {
  id: string;
  displayName: string;
};

type RangeAssignmentPanelProps = {
  onChanged?: () => void;
};

const focusableSelector = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function todayKey() {
  return format(new Date(), "yyyy-MM-dd");
}

export function RangeAssignmentPanel({ onChanged }: RangeAssignmentPanelProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const savingRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [parents, setParents] = useState<Parent[]>([]);
  const [startDate, setStartDate] = useState(todayKey);
  const [endDate, setEndDate] = useState(todayKey);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    savingRef.current = saving;
  }, [saving]);

  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      const dialog = dialogRef.current;
      if (!dialog) return;

      if (event.key === "Escape") {
        if (!savingRef.current) {
          event.preventDefault();
          setOpen(false);
        }
        return;
      }

      if (event.key !== "Tab") return;

      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector)).filter(
        (element) => element.getClientRects().length > 0,
      );
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [open]);

  const rangeCount = useMemo(() => {
    if (!startDate || !endDate || endDate < startDate) return null;
    const difference = differenceInCalendarDays(parseISO(endDate), parseISO(startDate));
    return difference + 1;
  }, [startDate, endDate]);

  async function openPanel() {
    setOpen(true);
    setLoading(true);
    setMessage(null);
    setSuccess(false);

    try {
      const response = await fetch("/api/settings", { cache: "no-store" });
      const body = (await response.json().catch(() => null)) as
        | { parents?: Parent[]; error?: string }
        | null;
      if (!response.ok) {
        throw new Error(body?.error ?? "The family calendar could not be loaded.");
      }
      setParents((body?.parents ?? []).slice(0, 2));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The family calendar could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  async function assignRange(parentId: string | null) {
    if (saving) return;

    if (!startDate || !endDate) {
      setSuccess(false);
      setMessage("Choose both a start date and an end date.");
      return;
    }
    if (endDate < startDate) {
      setSuccess(false);
      setMessage("The end date must be on or after the start date.");
      return;
    }

    const dayDifference = differenceInCalendarDays(parseISO(endDate), parseISO(startDate));
    if (dayDifference > 61) {
      setSuccess(false);
      setMessage("Choose a range of 62 days or fewer.");
      return;
    }

    const dates = eachDayOfInterval({ start: parseISO(startDate), end: parseISO(endDate) }).map(
      (day) => format(day, "yyyy-MM-dd"),
    );

    setSaving(true);
    setMessage(null);
    setSuccess(false);

    try {
      const response = await fetch("/api/assignments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dates, parentId }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(body?.error ?? "That date range could not be updated.");
      }

      const action = parentId
        ? `assigned to ${parents.find((parent) => parent.id === parentId)?.displayName ?? "the selected parent"}`
        : "cleared";
      setSuccess(true);
      setMessage(`${dates.length} ${dates.length === 1 ? "day" : "days"} ${action}.`);
      onChanged?.();
    } catch (error) {
      setSuccess(false);
      setMessage(error instanceof Error ? error.message : "That date range could not be updated.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void openPanel()}
        className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
      >
        <CalendarRange className="h-4 w-4" aria-hidden="true" />
        Assign range
      </button>
      <UndoBulkButton onChanged={onChanged} />

      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/35 p-0 backdrop-blur-sm sm:items-center sm:p-6">
          <section
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="range-title"
            aria-describedby="range-description"
            aria-busy={loading || saving}
            tabIndex={-1}
            className="w-full max-w-lg rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                  <CalendarRange className="h-5 w-5" aria-hidden="true" />
                </div>
                <h2 id="range-title" className="text-xl font-semibold text-slate-900">
                  Assign date range
                </h2>
                <p id="range-description" className="mt-1 text-sm leading-6 text-slate-500">
                  Choose a start and end date, then assign the whole range to a parent or clear it.
                </p>
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                aria-label="Close date range panel"
                disabled={saving}
                onClick={() => setOpen(false)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            {loading ? (
              <div
                role="status"
                aria-live="polite"
                className="mt-6 flex items-center gap-2 rounded-2xl bg-slate-50 px-4 py-5 text-sm text-slate-600"
              >
                <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                Loading family calendar…
              </div>
            ) : (
              <>
                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-sm font-semibold text-slate-800">Start date</span>
                    <input
                      type="date"
                      value={startDate}
                      disabled={saving}
                      onChange={(event) => setStartDate(event.target.value)}
                      className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-semibold text-slate-800">End date</span>
                    <input
                      type="date"
                      value={endDate}
                      disabled={saving}
                      onChange={(event) => setEndDate(event.target.value)}
                      className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                    />
                  </label>
                </div>

                <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  {rangeCount === null
                    ? "Choose a valid date range."
                    : rangeCount > 62
                      ? "This range is too long. Choose 62 days or fewer."
                      : `${rangeCount} ${rangeCount === 1 ? "day" : "days"} will be updated.`}
                </div>

                {message ? (
                  <p
                    role={success ? "status" : "alert"}
                    aria-live={success ? "polite" : "assertive"}
                    className={`mt-4 rounded-xl px-4 py-3 text-sm ${
                      success ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-700"
                    }`}
                  >
                    {message}
                  </p>
                ) : null}

                <div className="mt-5 grid gap-2 sm:grid-cols-3">
                  {parents.map((parent, index) => (
                    <button
                      key={parent.id}
                      type="button"
                      disabled={saving || rangeCount === null || rangeCount > 62}
                      onClick={() => void assignRange(parent.id)}
                      className={`inline-flex min-h-12 items-center justify-center rounded-xl px-4 text-sm font-semibold transition disabled:opacity-40 ${
                        index === 0
                          ? "bg-emerald-100 text-emerald-900 hover:bg-emerald-200"
                          : "bg-violet-100 text-violet-900 hover:bg-violet-200"
                      }`}
                    >
                      {saving ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : parent.displayName}
                    </button>
                  ))}
                  <button
                    type="button"
                    disabled={saving || rangeCount === null || rangeCount > 62 || parents.length === 0}
                    onClick={() => void assignRange(null)}
                    className="inline-flex min-h-12 items-center justify-center rounded-xl bg-slate-100 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-200 disabled:opacity-40"
                  >
                    {saving ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : "Clear range"}
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      ) : null}
    </>
  );
}
