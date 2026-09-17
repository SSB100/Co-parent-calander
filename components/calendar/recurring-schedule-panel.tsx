"use client";

import { format, startOfWeek } from "date-fns";
import { CalendarRange, LoaderCircle, Repeat2, Trash2, X } from "lucide-react";
import { useState } from "react";

const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type Participant = {
  id: string;
  displayName: string;
  colorKey: string;
};

type SchedulePayload = {
  active: boolean;
  anchorDate: string;
  pattern: Array<string | null>;
  participants: Participant[];
};

function defaultAnchorDate() {
  return format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");
}

function cellClasses(participants: Participant[], parentId: string | null) {
  const index = participants.findIndex((participant) => participant.id === parentId);
  if (index === 0) return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (index === 1) return "border-violet-200 bg-violet-50 text-violet-900";
  return "border-slate-200 bg-white text-slate-500 hover:bg-slate-50";
}

export function RecurringSchedulePanel() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [active, setActive] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [anchorDate, setAnchorDate] = useState(defaultAnchorDate);
  const [pattern, setPattern] = useState<Array<string | null>>(
    Array<string | null>(14).fill(null),
  );
  const [message, setMessage] = useState<string | null>(null);

  async function openPanel() {
    setOpen(true);
    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch("/api/recurring-schedule", { cache: "no-store" });
      const body = (await response.json().catch(() => null)) as
        | SchedulePayload
        | { error?: string }
        | null;

      if (!response.ok || !body || !("pattern" in body)) {
        throw new Error(
          body && "error" in body && body.error
            ? body.error
            : "The repeating schedule could not be loaded.",
        );
      }

      setActive(body.active);
      setParticipants(body.participants.slice(0, 2));
      setAnchorDate(body.anchorDate || defaultAnchorDate());
      setPattern(body.pattern.length === 14 ? body.pattern : Array<string | null>(14).fill(null));
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "The repeating schedule could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }

  function cycleSlot(slot: number) {
    if (participants.length === 0 || saving) return;
    const options: Array<string | null> = [null, ...participants.map((participant) => participant.id)];
    setPattern((current) => {
      const next = [...current];
      const currentIndex = Math.max(0, options.indexOf(next[slot]));
      next[slot] = options[(currentIndex + 1) % options.length];
      return next;
    });
  }

  function labelFor(parentId: string | null) {
    if (!parentId) return "Not set";
    return participants.find((participant) => participant.id === parentId)?.displayName ?? "Parent";
  }

  function applyWeekOnWeekOff() {
    if (participants.length < 2) return;
    setPattern([
      ...Array<string | null>(7).fill(participants[0].id),
      ...Array<string | null>(7).fill(participants[1].id),
    ]);
  }

  function applyAlternatingWeekends() {
    if (participants.length < 2) return;
    const next = Array<string | null>(14).fill(null);
    next[5] = participants[0].id;
    next[6] = participants[0].id;
    next[12] = participants[1].id;
    next[13] = participants[1].id;
    setPattern(next);
  }

  function copyWeekOne() {
    setPattern((current) => [...current.slice(0, 7), ...current.slice(0, 7)]);
  }

  async function saveSchedule() {
    if (saving) return;
    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch("/api/recurring-schedule", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ anchorDate, pattern }),
      });
      const body = (await response.json().catch(() => null)) as
        | { error?: string; anchorDate?: string }
        | null;
      if (!response.ok) {
        throw new Error(body?.error ?? "The repeating schedule could not be saved.");
      }

      setActive(true);
      if (body?.anchorDate) setAnchorDate(body.anchorDate);
      setMessage("Repeating schedule saved. Manual day changes will still override it.");
      window.setTimeout(() => window.location.reload(), 650);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "The repeating schedule could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function disableSchedule() {
    if (saving) return;
    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch("/api/recurring-schedule", { method: "DELETE" });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(body?.error ?? "The repeating schedule could not be turned off.");
      }

      setActive(false);
      setPattern(Array<string | null>(14).fill(null));
      setMessage("Repeating schedule turned off. Manual calendar days are unchanged.");
      window.setTimeout(() => window.location.reload(), 650);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "The repeating schedule could not be turned off.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void openPanel()}
        className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
      >
        <Repeat2 className="h-4 w-4" aria-hidden="true" />
        <span>Schedule</span>
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/35 p-0 backdrop-blur-sm sm:items-center sm:p-6">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="repeat-title"
            className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                  <CalendarRange className="h-5 w-5" aria-hidden="true" />
                </div>
                <h2 id="repeat-title" className="text-xl font-semibold text-slate-900">
                  Repeating schedule
                </h2>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  Set a two-week pattern. Tap any week cell to cycle between parents and “Not set”. Manual changes to individual calendar days always take priority.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close repeating schedule"
                onClick={() => setOpen(false)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            {loading ? (
              <div className="mt-8 flex items-center gap-2 rounded-2xl bg-slate-50 px-4 py-5 text-sm text-slate-600">
                <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                Loading repeating schedule…
              </div>
            ) : (
              <>
                <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
                  <label className="block">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      First week starts
                    </span>
                    <input
                      type="date"
                      value={anchorDate}
                      disabled={saving}
                      onChange={(event) => setAnchorDate(event.target.value)}
                      className="mt-2 min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                    />
                    <span className="mt-1 block text-xs text-slate-400">
                      We align the pattern to the Monday of this week.
                    </span>
                  </label>

                  <span
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                      active
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {active ? "Repeating schedule on" : "No repeating schedule"}
                  </span>
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={saving || participants.length < 2}
                    onClick={applyWeekOnWeekOff}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                  >
                    Week on / week off
                  </button>
                  <button
                    type="button"
                    disabled={saving || participants.length < 2}
                    onClick={applyAlternatingWeekends}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                  >
                    Alternate weekends
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={copyWeekOne}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                  >
                    Copy week 1 to week 2
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => setPattern(Array<string | null>(14).fill(null))}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50 disabled:opacity-40"
                  >
                    Clear pattern
                  </button>
                </div>

                <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
                  <div className="grid grid-cols-[3.5rem_1fr_1fr] bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <span>Day</span>
                    <span>Week 1</span>
                    <span>Week 2</span>
                  </div>
                  {weekdays.map((weekday, index) => (
                    <div
                      key={weekday}
                      className="grid grid-cols-[3.5rem_1fr_1fr] items-center gap-2 border-t border-slate-100 px-3 py-2"
                    >
                      <span className="text-sm font-semibold text-slate-600">{weekday}</span>
                      {[index, index + 7].map((slot) => (
                        <button
                          key={slot}
                          type="button"
                          disabled={saving || participants.length === 0}
                          onClick={() => cycleSlot(slot)}
                          className={`min-h-10 rounded-xl border px-2 text-left text-xs font-semibold transition disabled:opacity-40 ${cellClasses(
                            participants,
                            pattern[slot],
                          )}`}
                          aria-label={`${weekday}, ${slot < 7 ? "week 1" : "week 2"}: ${labelFor(pattern[slot])}. Tap to change.`}
                        >
                          <span className="block truncate">{labelFor(pattern[slot])}</span>
                        </button>
                      ))}
                    </div>
                  ))}
                </div>

                {message ? (
                  <p className="mt-4 rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-700">
                    {message}
                  </p>
                ) : null}

                <div className="mt-5 grid gap-2 sm:grid-cols-[1fr_auto]">
                  <button
                    type="button"
                    disabled={saving || participants.length === 0}
                    onClick={() => void saveSchedule()}
                    className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                  >
                    {saving ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Repeat2 className="h-4 w-4" aria-hidden="true" />
                    )}
                    Save repeating schedule
                  </button>

                  {active ? (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void disableSchedule()}
                      className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                      Turn off
                    </button>
                  ) : null}
                </div>
              </>
            )}
          </section>
        </div>
      ) : null}
    </>
  );
}
