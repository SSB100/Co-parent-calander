"use client";

import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  LoaderCircle,
  PencilLine,
  X,
} from "lucide-react";
import { addDays, format, parseISO, startOfWeek, subDays } from "date-fns";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CovieButton,
  CovieDialog,
  CovieEmptyState,
  CovieInput,
  CovieNotice,
  CovieStatusBadge,
  CovieTextarea,
} from "@/components/ui/covie";

type Session = {
  id: string;
  memberId: string;
  memberName: string;
  scheduledDate: string | null;
  scheduledStartTime: string | null;
  scheduledEndTime: string | null;
  clockInAt: string;
  clockOutAt: string | null;
  unrostered: boolean;
  correctedAt: string | null;
};

type ScheduledShift = {
  id: string;
  memberId: string;
  memberName: string;
  date: string;
  startTime: string;
  endTime: string;
};

type Correction = {
  id: string;
  memberId: string;
  memberName: string;
  clockSessionId: string;
  requestedClockInAt: string | null;
  requestedClockOutAt: string | null;
  reason: string;
  status: "pending" | "approved" | "declined" | "cancelled";
  createdAt: string;
};

type TimesheetPayload = {
  weekStart: string;
  weekEnd: string;
  currentMemberId: string;
  currentAccessRole: "owner" | "manager" | "staff";
  canReview: boolean;
  timezone: string;
  scheduledShifts: ScheduledShift[];
  sessions: Session[];
  corrections: Correction[];
};

function weekStartValue(date = new Date()) {
  return format(startOfWeek(date, { weekStartsOn: 1 }), "yyyy-MM-dd");
}

function compactTime(value: string) {
  const [hourValue, minuteValue] = value.slice(0, 5).split(":").map(Number);
  const suffix = hourValue >= 12 ? "pm" : "am";
  const hour = hourValue % 12 || 12;
  return minuteValue
    ? hour + ":" + String(minuteValue).padStart(2, "0") + suffix
    : hour + suffix;
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-NZ", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(value + "T00:00:00Z"));
}

function zonedTime(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-NZ", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(new Date(value));
}

function durationMinutes(start: string, end: string | null) {
  if (!end) return 0;
  return Math.max(
    0,
    Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000),
  );
}

function shiftMinutes(shift: ScheduledShift) {
  const [startHour, startMinute] = shift.startTime.split(":").map(Number);
  const [endHour, endMinute] = shift.endTime.split(":").map(Number);
  return endHour * 60 + endMinute - (startHour * 60 + startMinute);
}

function durationText(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? hours + "h " + remainder + "m" : hours + "h";
}

function localInputValue(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

export function StaffRosterTimesheetsPage() {
  const [weekStart, setWeekStart] = useState(weekStartValue);
  const [data, setData] = useState<TimesheetPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [correctionSession, setCorrectionSession] = useState<Session | null>(null);
  const [requestedIn, setRequestedIn] = useState("");
  const [requestedOut, setRequestedOut] = useState("");
  const [reason, setReason] = useState("");
  const [managerFixSession, setManagerFixSession] = useState<Session | null>(null);
  const [managerClockIn, setManagerClockIn] = useState("");
  const [managerClockOut, setManagerClockOut] = useState("");
  const [managerReason, setManagerReason] = useState("");

  const refresh = useCallback(async () => {
    const response = await fetch(
      "/api/staff-roster/timesheet?weekStart=" + encodeURIComponent(weekStart),
      { cache: "no-store" },
    );
    const body = (await response.json().catch(() => null)) as
      | TimesheetPayload
      | { error?: string }
      | null;
    if (!response.ok || !body || !("sessions" in body)) {
      throw new Error(
        body && "error" in body && body.error
          ? body.error
          : "Timesheet could not be loaded.",
      );
    }
    setData(body);
    setError(null);
  }, [weekStart]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh().catch((caught) =>
        setError(
          caught instanceof Error ? caught.message : "Timesheet could not be loaded.",
        ),
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const rosteredMinutes = useMemo(
    () => data?.scheduledShifts.reduce((sum, shift) => sum + shiftMinutes(shift), 0) ?? 0,
    [data?.scheduledShifts],
  );
  const workedMinutes = useMemo(
    () =>
      data?.sessions.reduce(
        (sum, session) => sum + durationMinutes(session.clockInAt, session.clockOutAt),
        0,
      ) ?? 0,
    [data?.sessions],
  );

  function openCorrection(session: Session) {
    setCorrectionSession(session);
    setRequestedIn(localInputValue(session.clockInAt));
    setRequestedOut(localInputValue(session.clockOutAt));
    setReason("");
  }

  function openManagerFix(session: Session) {
    setManagerFixSession(session);
    setManagerClockIn(localInputValue(session.clockInAt));
    setManagerClockOut(
      session.clockOutAt
        ? localInputValue(session.clockOutAt)
        : session.scheduledDate && session.scheduledEndTime
          ? session.scheduledDate + "T" + session.scheduledEndTime.slice(0, 5)
          : "",
    );
    setManagerReason("");
  }

  async function saveManagerFix() {
    if (
      !managerFixSession ||
      !managerClockIn ||
      !managerClockOut ||
      busy
    ) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/staff-roster/timesheet", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clockSessionId: managerFixSession.id,
          clockInAt: new Date(managerClockIn).toISOString(),
          clockOutAt: new Date(managerClockOut).toISOString(),
          reason: managerReason,
        }),
      });
      const body = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(body?.error ?? "Timesheet entry could not be corrected.");
      }

      setManagerFixSession(null);
      setNotice("Timesheet entry corrected.");
      await refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Timesheet entry could not be corrected.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function requestCorrection() {
    if (!correctionSession || busy || !reason.trim()) return;
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/staff-roster/timesheet-corrections", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clockSessionId: correctionSession.id,
          requestedClockInAt: requestedIn
            ? new Date(requestedIn).toISOString()
            : null,
          requestedClockOutAt: requestedOut
            ? new Date(requestedOut).toISOString()
            : null,
          reason,
        }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(body?.error ?? "Correction request could not be sent.");
      }
      setCorrectionSession(null);
      setNotice("Correction request sent for manager review.");
      await refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Correction request could not be sent.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function reviewCorrection(
    correctionId: string,
    decision: "approved" | "declined",
  ) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/staff-roster/timesheet-corrections", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ correctionId, decision }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(body?.error ?? "Correction could not be reviewed.");
      }
      setNotice(decision === "approved" ? "Correction approved." : "Correction declined.");
      await refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Correction could not be reviewed.",
      );
    } finally {
      setBusy(false);
    }
  }

  function sessionExceptions(session: Session) {
    const values: string[] = [];
    if (session.unrostered) values.push("Worked without scheduled shift");
    if (!session.clockOutAt) values.push("Forgot to clock out");
    if (session.correctedAt) values.push("Manually corrected");

    if (
      session.scheduledStartTime &&
      new Intl.DateTimeFormat("en-CA", {
        timeZone: data?.timezone,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(new Date(session.clockInAt)) > session.scheduledStartTime.slice(0, 5)
    ) {
      values.push("Late clock-in");
    }

    if (
      session.clockOutAt &&
      session.scheduledEndTime &&
      new Intl.DateTimeFormat("en-CA", {
        timeZone: data?.timezone,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(new Date(session.clockOutAt)) < session.scheduledEndTime.slice(0, 5)
    ) {
      values.push("Early clock-out");
    }

    return values;
  }

  const pendingCorrections =
    data?.corrections.filter((correction) => correction.status === "pending") ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#E6DBCF] bg-white p-4">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-[#0D7A6D]">
            {data?.canReview ? "Team timesheets" : "My timesheet"}
          </p>
          <h1 className="mt-1 font-[family-name:var(--font-fraunces)] text-2xl font-bold text-[#243139]">
            {dateLabel(weekStart)} – {dateLabel(format(addDays(parseISO(weekStart), 6), "yyyy-MM-dd"))}
          </h1>
        </div>
        <div className="flex gap-2">
          <CovieButton
            tone="neutral"
            aria-label="Previous week"
            onClick={() => setWeekStart(format(subDays(parseISO(weekStart), 7), "yyyy-MM-dd"))}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </CovieButton>
          <CovieButton tone="neutral" onClick={() => setWeekStart(weekStartValue())}>
            Today
          </CovieButton>
          <CovieButton
            tone="neutral"
            aria-label="Next week"
            onClick={() => setWeekStart(format(addDays(parseISO(weekStart), 7), "yyyy-MM-dd"))}
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </CovieButton>
        </div>
      </div>

      {error ? <CovieNotice tone="danger">{error}</CovieNotice> : null}
      {notice ? <CovieNotice tone="teal">{notice}</CovieNotice> : null}

      {!data && !error ? (
        <div className="flex min-h-40 items-center justify-center rounded-2xl border border-[#E6DBCF] bg-white text-sm text-[#66747A]">
          <LoaderCircle className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
          Loading timesheet…
        </div>
      ) : null}

      {data ? (
        <>
          {!data.canReview ? (
            <section className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-[#E6DBCF] bg-white p-4">
                <span className="text-xs font-extrabold uppercase text-[#66747A]">Rostered</span>
                <strong className="mt-1 block text-xl text-[#243139]">
                  {durationText(rosteredMinutes)}
                </strong>
              </div>
              <div className="rounded-2xl border border-[#E6DBCF] bg-white p-4">
                <span className="text-xs font-extrabold uppercase text-[#66747A]">Worked</span>
                <strong className="mt-1 block text-xl text-[#243139]">
                  {durationText(workedMinutes)}
                </strong>
              </div>
            </section>
          ) : null}

          {data.canReview && pendingCorrections.length > 0 ? (
            <section className="rounded-2xl border-2 border-[#F4C64E] bg-[#FFF8D8] p-4">
              <h2 className="font-[family-name:var(--font-fraunces)] text-xl font-bold text-[#243139]">
                Corrections to review
              </h2>
              <div className="mt-3 space-y-2">
                {pendingCorrections.map((correction) => (
                  <article key={correction.id} className="rounded-xl border border-[#E2C768] bg-white p-3">
                    <strong className="text-sm text-[#243139]">{correction.memberName}</strong>
                    <p className="mt-1 text-sm text-[#526168]">{correction.reason}</p>
                    <div className="mt-3 flex gap-2">
                      <CovieButton
                        disabled={busy}
                        onClick={() => void reviewCorrection(correction.id, "approved")}
                      >
                        <Check className="h-4 w-4" aria-hidden="true" />
                        Approve
                      </CovieButton>
                      <CovieButton
                        tone="neutral"
                        disabled={busy}
                        onClick={() => void reviewCorrection(correction.id, "declined")}
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                        Decline
                      </CovieButton>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {data.sessions.length === 0 ? (
            <CovieEmptyState
              icon={<Clock3 className="h-8 w-8 text-[#19A897]" aria-hidden="true" />}
              title="No worked time yet"
              description={
                data.canReview
                  ? "Clocked work for this week will appear here."
                  : "Clock in from My roster when you start work."
              }
            />
          ) : (
            <section className="space-y-3">
              {data.sessions.map((session) => {
                const exceptions = sessionExceptions(session);
                return (
                  <article
                    key={session.id}
                    className="rounded-2xl border border-[#E6DBCF] bg-white p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        {data.canReview ? (
                          <strong className="block text-sm text-[#243139]">
                            {session.memberName}
                          </strong>
                        ) : null}
                        <span className="mt-1 block text-sm font-bold text-[#526168]">
                          {session.scheduledDate
                            ? dateLabel(session.scheduledDate)
                            : new Intl.DateTimeFormat("en-NZ", {
                                weekday: "short",
                                day: "numeric",
                                month: "short",
                                timeZone: data.timezone,
                              }).format(new Date(session.clockInAt))}
                        </span>
                      </div>
                      {exceptions.length > 0 ? (
                        <CovieStatusBadge tone="sunshine">
                          {exceptions[0]}
                        </CovieStatusBadge>
                      ) : (
                        <CovieStatusBadge tone="teal">Recorded</CovieStatusBadge>
                      )}
                    </div>

                    <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                      <div>
                        <span className="block text-xs font-bold text-[#66747A]">Rostered</span>
                        <strong className="mt-1 block text-[#243139]">
                          {session.scheduledStartTime && session.scheduledEndTime
                            ? compactTime(session.scheduledStartTime) +
                              " – " +
                              compactTime(session.scheduledEndTime)
                            : "No rostered shift"}
                        </strong>
                      </div>
                      <div>
                        <span className="block text-xs font-bold text-[#66747A]">Worked</span>
                        <strong className="mt-1 block text-[#243139]">
                          {zonedTime(session.clockInAt, data.timezone)} –{" "}
                          {session.clockOutAt
                            ? zonedTime(session.clockOutAt, data.timezone)
                            : "Still clocked in"}
                        </strong>
                      </div>
                    </div>

                    {exceptions.length > 1 ? (
                      <p className="mt-3 flex items-start gap-2 text-xs font-bold text-[#8B6714]">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                        {exceptions.join(" · ")}
                      </p>
                    ) : null}

                    {data.canReview ? (
                      <CovieButton
                        tone="neutral"
                        className="mt-3"
                        onClick={() => openManagerFix(session)}
                      >
                        <PencilLine className="h-4 w-4" aria-hidden="true" />
                        Fix time
                      </CovieButton>
                    ) : !data.canReview && session.clockOutAt ? (
                      <CovieButton
                        tone="neutral"
                        className="mt-3"
                        onClick={() => openCorrection(session)}
                      >
                        <PencilLine className="h-4 w-4" aria-hidden="true" />
                        Request correction
                      </CovieButton>
                    ) : null}
                  </article>
                );
              })}
            </section>
          )}
        </>
      ) : null}

      {managerFixSession ? (
        <CovieDialog
          id="manager-timesheet-fix-title"
          title={"Fix " + managerFixSession.memberName + "’s time"}
          description="This changes the recorded worked time immediately and is kept in the audit log."
          icon={<PencilLine aria-hidden="true" />}
          iconTone="sunshine"
          size="md"
          busy={busy}
          onClose={() => setManagerFixSession(null)}
          footer={
            <>
              <CovieButton
                tone="neutral"
                disabled={busy}
                onClick={() => setManagerFixSession(null)}
              >
                Cancel
              </CovieButton>
              <CovieButton
                disabled={busy || !managerClockIn || !managerClockOut}
                onClick={() => void saveManagerFix()}
              >
                Save corrected time
              </CovieButton>
            </>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              <span className="mb-1.5 block text-sm font-bold">Clock in</span>
              <CovieInput
                type="datetime-local"
                value={managerClockIn}
                disabled={busy}
                onChange={(event) => setManagerClockIn(event.target.value)}
              />
            </label>
            <label>
              <span className="mb-1.5 block text-sm font-bold">Clock out</span>
              <CovieInput
                type="datetime-local"
                value={managerClockOut}
                disabled={busy}
                onChange={(event) => setManagerClockOut(event.target.value)}
              />
            </label>
            <label className="sm:col-span-2">
              <span className="mb-1.5 block text-sm font-bold">
                Correction note
              </span>
              <CovieTextarea
                rows={3}
                maxLength={500}
                value={managerReason}
                disabled={busy}
                placeholder="Optional reason for the correction"
                onChange={(event) => setManagerReason(event.target.value)}
              />
            </label>
          </div>
        </CovieDialog>
      ) : null}

      {correctionSession ? (
        <CovieDialog
          id="timesheet-correction-title"
          title="Request a timesheet correction"
          description="Your recorded time will not change until a manager approves this request."
          icon={<PencilLine aria-hidden="true" />}
          iconTone="sunshine"
          size="md"
          busy={busy}
          onClose={() => setCorrectionSession(null)}
          footer={
            <>
              <CovieButton tone="neutral" disabled={busy} onClick={() => setCorrectionSession(null)}>
                Cancel
              </CovieButton>
              <CovieButton disabled={busy || !reason.trim()} onClick={() => void requestCorrection()}>
                Send request
              </CovieButton>
            </>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              <span className="mb-1.5 block text-sm font-bold">Clock in</span>
              <CovieInput
                type="datetime-local"
                value={requestedIn}
                disabled={busy}
                onChange={(event) => setRequestedIn(event.target.value)}
              />
            </label>
            <label>
              <span className="mb-1.5 block text-sm font-bold">Clock out</span>
              <CovieInput
                type="datetime-local"
                value={requestedOut}
                disabled={busy}
                onChange={(event) => setRequestedOut(event.target.value)}
              />
            </label>
            <label className="sm:col-span-2">
              <span className="mb-1.5 block text-sm font-bold">Reason</span>
              <CovieTextarea
                rows={3}
                maxLength={500}
                value={reason}
                disabled={busy}
                placeholder="For example: Forgot to clock out."
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
          </div>
        </CovieDialog>
      ) : null}
    </div>
  );
}
