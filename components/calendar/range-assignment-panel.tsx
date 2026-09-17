"use client";

import { differenceInCalendarDays, eachDayOfInterval, format, parseISO } from "date-fns";
import { CalendarRange, LoaderCircle, X } from "lucide-react";
import { useMemo, useState } from "react";

type Participant = {
  id: string;
  displayName: string;
  colorKey: string;
};

type RangeAssignmentPanelProps = {
  participants: Participant[];
  onChanged: (message: string) => void;
};

function todayKey() {
  return format(new Date(), "yyyy-MM-dd");
}

export function RangeAssignmentPanel({ participants, onChanged }: RangeAssignmentPanelProps) {
  const [open, setOpen] = useState(false);
  const [startDate, setStartDate] = useState(todayKey);
  const [endDate, setEndDate] = useState(todayKey);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const rangeCount = useMemo(() => {
    if (!startDate || !endDate || endDate < startDate) return null;
    const difference = differenceInCalendarDays(parseISO(endDate), parseISO(startDate));
    return difference + 1;
  }, [startDate, endDate]);

  async function assignRange(parentId: string | null) {
    if (saving) return;

    if (!startDate || !endDate) {
      setMessage("Choose both a start date and an end date.");
      return;
    }
    if (endDate < startDate) {
      setMessage("The end date must be on or after the start date.");
      return;
    }

    const dayDifference = differenceInCalendarDays(parseISO(endDate), parseISO(startDate));
    if (dayDifference > 61) {
      setMessage("Choose a range of 62 days or fewer.");
      return;
    }

    const dates = eachDayOfInterval({ start: parseISO(startDate), end: parseISO(endDate) }).map(
      (day) => format(day, "yyyy-MM-dd"),
    );

    setSaving(true);
    setMessage(null);

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
        ? `assigned to ${participants.find((participant) => participant.id === parentId)?.displayName ?? "the selected parent"}`
        : "cleared";
      const savedMessage = `${dates.length} ${dates.length === 1 ? "day" : "days"} ${action}.`;
      onChanged(savedMessage);
      setOpen(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "That date range could not be updated.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setMessage(null);
          setOpen(true);
        }}
        className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
      >
        <CalendarRange className="h-4 w-4" aria-hidden="true" />
        Assign range
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/35 p-0 backdrop-blur-sm sm:items-center sm:p-6">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="range-title"
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
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  Choose a start and end date, then assign the whole range to a parent or clear it.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close date range panel"
                onClick={() => setOpen(false)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

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
              <p className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{message}</p>
            ) : null}

            <div className="mt-5 grid gap-2 sm:grid-cols-3">
              {participants.slice(0, 2).map((participant, index) => (
                <button
                  key={participant.id}
                  type="button"
                  disabled={saving || rangeCount === null || rangeCount > 62}
                  onClick={() => void assignRange(participant.id)}
                  className={`inline-flex min-h-12 items-center justify-center rounded-xl px-4 text-sm font-semibold transition disabled:opacity-40 ${
                    index === 0
                      ? "bg-emerald-100 text-emerald-900 hover:bg-emerald-200"
                      : "bg-violet-100 text-violet-900 hover:bg-violet-200"
                  }`}
                >
                  {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : participant.displayName}
                </button>
              ))}
              <button
                type="button"
                disabled={saving || rangeCount === null || rangeCount > 62}
                onClick={() => void assignRange(null)}
                className="inline-flex min-h-12 items-center justify-center rounded-xl bg-slate-100 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-200 disabled:opacity-40"
              >
                {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : "Clear range"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
