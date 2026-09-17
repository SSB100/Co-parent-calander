"use client";

import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Settings2,
  Share2,
  UsersRound,
} from "lucide-react";
import { useMemo, useState } from "react";

type ParentKey = "a" | "b";
type AssignmentMap = Record<string, ParentKey>;

const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const parentStyles: Record<ParentKey, { name: string; short: string; dot: string; cell: string; pill: string }> = {
  a: {
    name: "Parent A",
    short: "A",
    dot: "bg-emerald-500",
    cell: "border-emerald-200 bg-emerald-50",
    pill: "bg-emerald-100 text-emerald-800",
  },
  b: {
    name: "Parent B",
    short: "B",
    dot: "bg-violet-500",
    cell: "border-violet-200 bg-violet-50",
    pill: "bg-violet-100 text-violet-800",
  },
};

function keyFor(day: Date) {
  return format(day, "yyyy-MM-dd");
}

export function CalendarShell() {
  const [currentMonth, setCurrentMonth] = useState<Date>(() => startOfMonth(new Date()));
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [assignments, setAssignments] = useState<AssignmentMap>({});

  const calendarDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  const today = new Date();
  const todayAssignment = assignments[keyFor(today)];

  function toggleDay(day: Date) {
    if (!isSameMonth(day, currentMonth)) return;
    const key = keyFor(day);
    setSelectedDays((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    );
  }

  function assignSelected(parent: ParentKey) {
    if (selectedDays.length === 0) return;
    setAssignments((current) => {
      const next = { ...current };
      for (const day of selectedDays) next[day] = parent;
      return next;
    });
    setSelectedDays([]);
  }

  function clearSelected() {
    if (selectedDays.length === 0) return;
    setAssignments((current) => {
      const next = { ...current };
      for (const day of selectedDays) delete next[day];
      return next;
    });
    setSelectedDays([]);
  }

  function goToday() {
    setCurrentMonth(startOfMonth(new Date()));
    setSelectedDays([]);
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-3 py-4 sm:px-6 sm:py-7 lg:px-8">
      <header className="mb-4 flex flex-col gap-4 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            <UsersRound className="h-4 w-4" aria-hidden="true" />
            Shared family calendar
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
              Our Family Calendar
            </h1>
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
              Preview mode
            </span>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            disabled
            title="Settings are added after the core calendar flow"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-400 shadow-sm disabled:cursor-not-allowed"
          >
            <Settings2 className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Settings</span>
          </button>
          <button
            type="button"
            disabled
            title="Secure sharing is added in the sharing milestone"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-400 shadow-sm disabled:cursor-not-allowed"
          >
            <Share2 className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Share</span>
          </button>
        </div>
      </header>

      <section className="mb-4 grid gap-3 sm:mb-5 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Today</p>
          <div className="mt-2 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
              <CalendarDays className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <p className="font-semibold text-slate-900">
                {todayAssignment ? `With ${parentStyles[todayAssignment].name}` : "Not assigned yet"}
              </p>
              <p className="text-sm text-slate-500">{format(today, "EEEE, d MMMM")}</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Next handover</p>
          <p className="mt-3 font-semibold text-slate-900">No handover scheduled</p>
          <p className="mt-1 text-sm text-slate-500">Handover details will appear here when added.</p>
        </div>
      </section>

      <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-200 px-3 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="flex items-center justify-between gap-2 sm:justify-start">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => {
                setCurrentMonth(subMonths(currentMonth, 1));
                setSelectedDays([]);
              }}
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </button>
            <div className="min-w-40 text-center sm:min-w-48">
              <h2 className="text-lg font-semibold text-slate-900 sm:text-xl">
                {format(currentMonth, "MMMM yyyy")}
              </h2>
            </div>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => {
                setCurrentMonth(addMonths(currentMonth, 1));
                setSelectedDays([]);
              }}
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50"
            >
              <ChevronRight className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 sm:justify-end">
            <div className="flex items-center gap-3 text-sm">
              {(["a", "b"] as const).map((parent) => (
                <div key={parent} className="flex items-center gap-1.5 text-slate-600">
                  <span className={`h-2.5 w-2.5 rounded-full ${parentStyles[parent].dot}`} />
                  {parentStyles[parent].name}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={goToday}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-slate-900 px-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Today
            </button>
          </div>
        </div>

        <div className="px-2 pb-2 pt-3 sm:px-4 sm:pb-4">
          <p className="mb-3 px-1 text-sm text-slate-500">
            Tap one or more days, then choose who has the children.
          </p>

          <div className="grid grid-cols-7 gap-1 sm:gap-2" role="grid" aria-label={format(currentMonth, "MMMM yyyy")}>
            {weekdays.map((weekday) => (
              <div
                key={weekday}
                role="columnheader"
                className="pb-1 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-400 sm:text-xs"
              >
                {weekday}
              </div>
            ))}

            {calendarDays.map((day) => {
              const key = keyFor(day);
              const assignment = assignments[key];
              const selected = selectedDays.includes(key);
              const inMonth = isSameMonth(day, currentMonth);
              const isToday = isSameDay(day, today);
              const assignedStyle = assignment ? parentStyles[assignment].cell : "border-slate-200 bg-white";

              return (
                <button
                  key={key}
                  type="button"
                  role="gridcell"
                  disabled={!inMonth}
                  aria-selected={selected}
                  aria-label={`${format(day, "EEEE d MMMM")}${assignment ? `, ${parentStyles[assignment].name}` : ", unassigned"}`}
                  onClick={() => toggleDay(day)}
                  className={`relative min-h-16 rounded-xl border p-1.5 text-left transition sm:min-h-24 sm:rounded-2xl sm:p-2.5 ${assignedStyle} ${
                    inMonth ? "hover:-translate-y-0.5 hover:shadow-sm" : "cursor-default opacity-30"
                  } ${selected ? "ring-2 ring-blue-500 ring-offset-1" : ""}`}
                >
                  <div className="flex items-start justify-between gap-1">
                    <span
                      className={`flex h-7 min-w-7 items-center justify-center rounded-full text-sm font-semibold ${
                        isToday ? "bg-slate-900 text-white" : "text-slate-700"
                      }`}
                    >
                      {format(day, "d")}
                    </span>
                    {selected ? (
                      <span className="rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold text-white sm:px-2">
                        ✓
                      </span>
                    ) : null}
                  </div>

                  {assignment && inMonth ? (
                    <div className={`mt-2 inline-flex max-w-full items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold sm:text-xs ${parentStyles[assignment].pill}`}>
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${parentStyles[assignment].dot}`} />
                      <span className="sm:hidden">{parentStyles[assignment].short}</span>
                      <span className="hidden truncate sm:inline">{parentStyles[assignment].name}</span>
                    </div>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {selectedDays.length > 0 ? (
        <div className="sticky bottom-3 z-20 mx-auto mt-4 flex max-w-2xl flex-col gap-3 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-xl backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div className="px-1">
            <p className="font-semibold text-slate-900">
              {selectedDays.length} {selectedDays.length === 1 ? "day" : "days"} selected
            </p>
            <button
              type="button"
              onClick={() => setSelectedDays([])}
              className="text-sm font-medium text-slate-500 underline-offset-4 hover:underline"
            >
              Cancel selection
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => assignSelected("a")}
              className="min-h-11 rounded-xl bg-emerald-100 px-3 text-sm font-semibold text-emerald-900 transition hover:bg-emerald-200"
            >
              Parent A
            </button>
            <button
              type="button"
              onClick={() => assignSelected("b")}
              className="min-h-11 rounded-xl bg-violet-100 px-3 text-sm font-semibold text-violet-900 transition hover:bg-violet-200"
            >
              Parent B
            </button>
            <button
              type="button"
              onClick={clearSelected}
              className="min-h-11 rounded-xl bg-slate-100 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-200"
            >
              Clear
            </button>
          </div>
        </div>
      ) : null}

      <p className="mx-auto mt-5 max-w-2xl text-center text-xs leading-5 text-slate-400">
        This checkpoint uses local preview state only. Database persistence, secure editor access and read-only sharing are the next milestones.
      </p>
    </main>
  );
}
