"use client";

import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  LoaderCircle,
  MapPin,
} from "lucide-react";
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
} from "date-fns";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CovieButton,
  CovieConfirmDialog,
  CovieEmptyState,
  CovieNotice,
  CovieStatusBadge,
} from "@/components/ui/covie";

type Shift = {
  id: string;
  memberId: string;
  memberName: string;
  roleId: string | null;
  roleName: string | null;
  locationId: string | null;
  locationName: string | null;
  date: string;
  startTime: string;
  endTime: string;
  note: string | null;
};

type MyRosterPayload = {
  weekStart: string;
  weekEnd: string;
  currentMemberId: string;
  currentAccessRole: "staff";
  canManageRoster: false;
  publication: {
    status: "draft" | "published" | "changes_pending";
    revision: number;
    publishedAt: string | null;
    lastSentAt: string | null;
    affectedMemberCount: number;
  };
  shifts: Shift[];
};

type ClockState = {
  timezone: string;
  activeSession: {
    id: string;
    clockInAt: string;
    scheduledDate: string | null;
    scheduledStartTime: string | null;
    scheduledEndTime: string | null;
    unrostered: boolean;
  } | null;
  matchingShift: {
    id: string;
    date: string;
    startTime: string;
    endTime: string;
  } | null;
};

type View = "week" | "month";

function todayValue() {
  return format(new Date(), "yyyy-MM-dd");
}

function weekStartFor(date: string) {
  return format(
    startOfWeek(parseISO(date), { weekStartsOn: 1 }),
    "yyyy-MM-dd",
  );
}

function dayHeading(date: string) {
  return new Intl.DateTimeFormat("en-NZ", {
    weekday: "long",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(date + "T00:00:00Z"));
}

function shortDay(date: string) {
  return new Intl.DateTimeFormat("en-NZ", {
    weekday: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(date + "T00:00:00Z"));
}

function compactTime(value: string) {
  const [hoursValue, minutesValue] = value.split(":").map(Number);
  const suffix = hoursValue >= 12 ? "pm" : "am";
  const hour = hoursValue % 12 || 12;
  return minutesValue
    ? hour + ":" + String(minutesValue).padStart(2, "0") + suffix
    : hour + suffix;
}

function minutes(value: string) {
  const [hoursValue, minutesValue] = value.split(":").map(Number);
  return hoursValue * 60 + minutesValue;
}

function durationText(shift: Shift) {
  const total = Math.max(0, minutes(shift.endTime) - minutes(shift.startTime));
  const hours = Math.floor(total / 60);
  const remainder = total % 60;
  return remainder ? hours + "h " + remainder + "m" : hours + "h";
}

function monthLabel(date: string) {
  return new Intl.DateTimeFormat("en-NZ", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(date + "T00:00:00Z"));
}

function monthWeeks(date: string) {
  const start = startOfWeek(startOfMonth(parseISO(date)), { weekStartsOn: 1 });
  const end = endOfWeek(endOfMonth(parseISO(date)), { weekStartsOn: 1 });
  const weeks: string[] = [];
  let cursor = start;
  while (cursor <= end) {
    weeks.push(format(cursor, "yyyy-MM-dd"));
    cursor = addDays(cursor, 7);
  }
  return weeks;
}

async function loadWeek(weekStart: string) {
  const response = await fetch(
    "/api/staff-roster/shifts?weekStart=" + encodeURIComponent(weekStart),
    { cache: "no-store" },
  );
  const body = (await response.json().catch(() => null)) as
    | MyRosterPayload
    | { error?: string }
    | null;

  if (!response.ok || !body || !("shifts" in body)) {
    throw new Error(
      body && "error" in body && body.error
        ? body.error
        : "Your roster could not be loaded.",
    );
  }

  return body;
}

export function StaffMyRosterPage() {
  const [anchorDate, setAnchorDate] = useState(todayValue);
  const [view, setView] = useState<View>("week");
  const [data, setData] = useState<MyRosterPayload | null>(null);
  const [clock, setClock] = useState<ClockState | null>(null);
  const [clockBusy, setClockBusy] = useState(false);
  const [confirmUnrostered, setConfirmUnrostered] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (date: string, nextView: View) => {
    if (nextView === "week") {
      setData(await loadWeek(weekStartFor(date)));
      setError(null);
      return;
    }

    const payloads = await Promise.all(monthWeeks(date).map(loadWeek));
    const first = payloads[0];
    const last = payloads[payloads.length - 1];
    const anchorPayload =
      payloads.find((payload) => payload.weekStart === weekStartFor(date)) ??
      first;
    if (!first || !last || !anchorPayload) {
      throw new Error("Your roster could not be loaded.");
    }

    const shifts = new Map<string, Shift>();
    for (const payload of payloads) {
      for (const shift of payload.shifts) shifts.set(shift.id, shift);
    }

    setData({
      ...anchorPayload,
      weekStart: first.weekStart,
      weekEnd: last.weekEnd,
      shifts: [...shifts.values()].sort((a, b) =>
        (a.date + a.startTime).localeCompare(b.date + b.startTime),
      ),
    });
    setError(null);
  }, []);

  const refreshClock = useCallback(async () => {
    const response = await fetch("/api/staff-roster/clock", { cache: "no-store" });
    const body = (await response.json().catch(() => null)) as
      | ClockState
      | { error?: string }
      | null;
    if (!response.ok || !body || !("activeSession" in body)) {
      throw new Error(
        body && "error" in body && body.error
          ? body.error
          : "Clock status could not be loaded.",
      );
    }
    setClock(body);
  }, []);

  async function runClockAction(
    action: "clock_in" | "clock_out",
    confirm = false,
  ) {
    if (clockBusy) return;
    setClockBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/staff-roster/clock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action,
          confirmUnrostered: confirm,
        }),
      });
      const body = (await response.json().catch(() => null)) as
        | { error?: string; code?: string | null }
        | null;

      if (!response.ok) {
        if (
          action === "clock_in" &&
          body?.code === "unrostered_confirmation_required"
        ) {
          setConfirmUnrostered(true);
          return;
        }
        throw new Error(body?.error ?? "The clock action could not be recorded.");
      }

      setConfirmUnrostered(false);
      await refreshClock();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The clock action could not be recorded.",
      );
    } finally {
      setClockBusy(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void Promise.all([refresh(anchorDate, view), refreshClock()]).catch(
        (caught) =>
          setError(
            caught instanceof Error
              ? caught.message
              : "Your roster could not be loaded.",
          ),
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [anchorDate, refresh, refreshClock, view]);

  const weekStart = weekStartFor(anchorDate);
  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) =>
        format(addDays(parseISO(weekStart), index), "yyyy-MM-dd"),
      ),
    [weekStart],
  );

  const today = todayValue();
  const todayShifts = data?.shifts.filter((shift) => shift.date === today) ?? [];
  const nextShift =
    data?.shifts.find(
      (shift) =>
        shift.date > today ||
        (shift.date === today &&
          minutes(shift.endTime) >
            new Date().getHours() * 60 + new Date().getMinutes()),
    ) ?? null;

  function go(direction: -1 | 1) {
    const current = parseISO(anchorDate);
    const next =
      view === "week"
        ? direction < 0
          ? subDays(current, 7)
          : addDays(current, 7)
        : direction < 0
          ? subMonths(current, 1)
          : addMonths(current, 1);
    setAnchorDate(format(next, "yyyy-MM-dd"));
  }

  return (
    <div className="space-y-4">
      {error ? (
        <CovieNotice tone="danger" role="alert">
          {error}
        </CovieNotice>
      ) : null}

      {!data && !error ? (
        <div className="flex min-h-48 items-center justify-center rounded-2xl border border-[#E6DBCF] bg-white text-sm text-[#66747A]">
          <LoaderCircle className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
          Loading your roster…
        </div>
      ) : null}

      {data ? (
        <>
          <section className="rounded-2xl border-2 border-[#243139] bg-white p-5 shadow-[4px_4px_0_#BFEDE6]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-[#0D7A6D]">
                  Today
                </p>
                <h1 className="mt-1 font-[family-name:var(--font-fraunces)] text-2xl font-bold text-[#243139]">
                  My roster
                </h1>
              </div>
              <CovieStatusBadge tone={data.publication.status === "published" ? "teal" : "neutral"}>
                {data.publication.status === "published"
                  ? "Published"
                  : "No published roster"}
              </CovieStatusBadge>
            </div>

            <div className="mt-5 rounded-xl border border-[#E6DBCF] bg-[#FFF9F2] p-4">
              {clock?.activeSession ? (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-extrabold uppercase tracking-[0.06em] text-[#0D7A6D]">
                      Clocked in
                    </p>
                    <strong className="mt-1 block text-[#243139]">
                      {new Intl.DateTimeFormat("en-NZ", {
                        hour: "numeric",
                        minute: "2-digit",
                        timeZone: clock.timezone,
                      }).format(new Date(clock.activeSession.clockInAt))}
                    </strong>
                    {clock.activeSession.unrostered ? (
                      <span className="mt-1 block text-xs font-bold text-[#8B6714]">
                        No rostered shift matched this clock-in
                      </span>
                    ) : null}
                  </div>
                  <CovieButton
                    disabled={clockBusy}
                    onClick={() => void runClockAction("clock_out")}
                  >
                    {clockBusy ? "Recording…" : "Clock out"}
                  </CovieButton>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-extrabold uppercase tracking-[0.06em] text-[#66747A]">
                      Attendance
                    </p>
                    <strong className="mt-1 block text-[#243139]">
                      {clock?.matchingShift
                        ? compactTime(clock.matchingShift.startTime) +
                          " – " +
                          compactTime(clock.matchingShift.endTime)
                        : "Ready when you start work"}
                    </strong>
                  </div>
                  <CovieButton
                    disabled={clockBusy}
                    onClick={() => void runClockAction("clock_in")}
                  >
                    {clockBusy ? "Recording…" : "Clock in"}
                  </CovieButton>
                </div>
              )}
            </div>

            {todayShifts.length > 0 ? (
              <div className="mt-5 space-y-3">
                {todayShifts.map((shift) => (
                  <div
                    key={shift.id}
                    className="rounded-xl border border-[#BFEDE6] bg-[#EAF8F5] p-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <strong className="text-lg text-[#243139]">
                          {compactTime(shift.startTime)} – {compactTime(shift.endTime)}
                        </strong>
                        <p className="mt-1 text-sm text-[#526168]">
                          {[shift.roleName, shift.locationName]
                            .filter(Boolean)
                            .join(" · ") || "Rostered shift"}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs font-extrabold text-[#0D7A6D]">
                        {durationText(shift)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-5 rounded-xl bg-[#FFF9F2] p-4">
                <strong className="text-[#243139]">Off today</strong>
                <p className="mt-1 text-sm text-[#66747A]">
                  {nextShift
                    ? "Next: " +
                      dayHeading(nextShift.date) +
                      ", " +
                      compactTime(nextShift.startTime)
                    : "No upcoming published shifts in this view."}
                </p>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-[#E6DBCF] bg-white p-3 sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="inline-flex rounded-[12px] border border-[#E6DBCF] bg-[#FFF9F2] p-1">
                {(["week", "month"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setView(option)}
                    className={
                      "min-h-10 rounded-[9px] px-4 text-sm font-extrabold " +
                      (view === option
                        ? "bg-white text-[#243139] shadow-sm"
                        : "text-[#66747A]")
                    }
                  >
                    {option === "week" ? "Week" : "Month"}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <CovieButton
                  tone="neutral"
                  aria-label={view === "week" ? "Previous week" : "Previous month"}
                  onClick={() => go(-1)}
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </CovieButton>
                <CovieButton
                  tone="neutral"
                  onClick={() => setAnchorDate(today)}
                >
                  Today
                </CovieButton>
                <CovieButton
                  tone="neutral"
                  aria-label={view === "week" ? "Next week" : "Next month"}
                  onClick={() => go(1)}
                >
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </CovieButton>
              </div>

              <strong className="w-full text-center font-[family-name:var(--font-fraunces)] text-xl text-[#243139] sm:w-auto">
                {view === "week"
                  ? dayHeading(days[0] ?? weekStart) +
                    " – " +
                    dayHeading(days[6] ?? weekStart)
                  : monthLabel(anchorDate)}
              </strong>
            </div>
          </section>

          {view === "week" ? (
            <div className="space-y-3">
              {days.map((day) => {
                const shifts = data.shifts.filter((shift) => shift.date === day);
                return (
                  <section
                    key={day}
                    className={
                      "rounded-2xl border bg-white p-4 " +
                      (day === today
                        ? "border-[#19A897]"
                        : "border-[#E6DBCF]")
                    }
                  >
                    <h2 className="font-[family-name:var(--font-fraunces)] text-lg font-bold text-[#243139]">
                      {dayHeading(day)}
                    </h2>
                    {shifts.length === 0 ? (
                      <p className="mt-3 text-sm font-bold text-[#8B7D70]">Off</p>
                    ) : (
                      <div className="mt-3 space-y-2">
                        {shifts.map((shift) => (
                          <article
                            key={shift.id}
                            className="rounded-xl border border-[#BFEDE6] bg-[#EAF8F5] p-3"
                          >
                            <div className="flex items-center gap-2 text-sm font-extrabold text-[#243139]">
                              <Clock3 className="h-4 w-4 text-[#0D7A6D]" aria-hidden="true" />
                              {compactTime(shift.startTime)} – {compactTime(shift.endTime)}
                            </div>
                            {shift.roleName || shift.locationName ? (
                              <p className="mt-2 flex items-center gap-2 text-sm text-[#526168]">
                                <MapPin className="h-4 w-4 text-[#0D7A6D]" aria-hidden="true" />
                                {[shift.roleName, shift.locationName]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </p>
                            ) : null}
                            {shift.note ? (
                              <p className="mt-2 text-sm text-[#66747A]">
                                {shift.note}
                              </p>
                            ) : null}
                          </article>
                        ))}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          ) : (
            <div className="grid grid-cols-7 overflow-hidden rounded-2xl border-2 border-[#243139] bg-white">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label) => (
                <div
                  key={label}
                  className="border-b border-r border-[#E6DBCF] bg-[#FFF9F2] p-2 text-center text-[10px] font-extrabold uppercase text-[#66747A] sm:text-xs"
                >
                  {label}
                </div>
              ))}
              {(() => {
                const start = startOfWeek(startOfMonth(parseISO(anchorDate)), {
                  weekStartsOn: 1,
                });
                const end = endOfWeek(endOfMonth(parseISO(anchorDate)), {
                  weekStartsOn: 1,
                });
                const values: string[] = [];
                let cursor = start;
                while (cursor <= end) {
                  values.push(format(cursor, "yyyy-MM-dd"));
                  cursor = addDays(cursor, 1);
                }

                return values.map((day) => {
                  const shifts = data.shifts.filter((shift) => shift.date === day);
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => {
                        setAnchorDate(day);
                        setView("week");
                      }}
                      className="min-h-20 border-b border-r border-[#E6DBCF] p-1.5 text-left sm:min-h-28 sm:p-2"
                    >
                      <strong className="block text-xs text-[#243139] sm:text-sm">
                        {format(parseISO(day), "d")}
                      </strong>
                      {shifts.slice(0, 2).map((shift) => (
                        <span
                          key={shift.id}
                          className="mt-1 block truncate rounded bg-[#EAF8F5] px-1 py-0.5 text-[9px] font-bold text-[#0D7A6D] sm:text-[11px]"
                        >
                          {compactTime(shift.startTime)}
                        </span>
                      ))}
                      {shifts.length > 2 ? (
                        <span className="mt-1 block text-[9px] font-extrabold text-[#0D7A6D]">
                          +{shifts.length - 2}
                        </span>
                      ) : null}
                    </button>
                  );
                });
              })()}
            </div>
          )}

          {data.publication.status === "draft" && data.shifts.length === 0 ? (
            <CovieEmptyState
              icon={<CalendarDays className="h-8 w-8 text-[#19A897]" aria-hidden="true" />}
              title="No published roster yet"
              description="Your manager has not published this roster period yet."
            />
          ) : null}
        </>
      ) : null}
      <CovieConfirmDialog
        open={confirmUnrostered}
        id="confirm-unrostered-clock-in"
        title="Clock in without a rostered shift?"
        description="No published shift was found near the current time. You can still clock in and it will be marked for manager review."
        confirmLabel="Clock in anyway"
        busy={clockBusy}
        icon={<Clock3 aria-hidden="true" />}
        onCancel={() => setConfirmUnrostered(false)}
        onConfirm={() => void runClockAction("clock_in", true)}
      />
    </div>
  );
}
