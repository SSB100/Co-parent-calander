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
import { addDays, format, parseISO, subDays } from "date-fns";
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
import {
  instantFromLocalDateTimeInTimeZone,
  localDateTimeInputInTimeZone,
  mondayWeekStartInTimeZone,
} from "@/lib/calendar/time";
import { classifyTimesheetSession } from "@/lib/staff-rosters/timesheet-policy";

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

type CorrectionStatus = "pending" | "approved" | "declined" | "cancelled";

type Correction = {
  id: string;
  memberId: string;
  memberName: string;
  clockSessionId: string;
  requestedClockInAt: string | null;
  requestedClockOutAt: string | null;
  originalClockInAt: string;
  originalClockOutAt: string | null;
  currentClockInAt: string;
  currentClockOutAt: string | null;
  reason: string;
  status: CorrectionStatus;
  reviewedAt: string | null;
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

function zonedDate(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-NZ", {
    weekday: "short",
    day: "numeric",
    month: "short",
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

function correctionStatusLabel(status: CorrectionStatus) {
  switch (status) {
    case "pending":
      return "Pending";
    case "approved":
      return "Approved";
    case "declined":
      return "Declined";
    case "cancelled":
      return "Cancelled";
  }
}

function correctionStatusTone(status: CorrectionStatus) {
  switch (status) {
    case "pending":
      return "sunshine" as const;
    case "approved":
      return "teal" as const;
    case "declined":
    case "cancelled":
      return "neutral" as const;
  }
}

function CorrectionComparison({
  correction,
  timezone,
}: {
  correction: Correction;
  timezone: string;
}) {
  return (
    <div className="mt-3 grid gap-3 rounded-xl bg-[#F8F4EF] p-3 text-sm sm:grid-cols-2">
      <div>
        <span className="block text-xs font-bold text-[#66747A]">
          Original recorded time
        </span>
        <strong className="mt-1 block text-[#243139]">
          {zonedTime(correction.originalClockInAt, timezone)} –{" "}
          {correction.originalClockOutAt
            ? zonedTime(correction.originalClockOutAt, timezone)
            : "No clock-out recorded"}
        </strong>
      </div>
      <div>
        <span className="block text-xs font-bold text-[#66747A]">
          Requested change
        </span>
        <strong className="mt-1 block text-[#243139]">
          {correction.requestedClockInAt
            ? zonedTime(correction.requestedClockInAt, timezone)
            : "Clock-in unchanged"}
          {" · "}
          {correction.requestedClockOutAt
            ? zonedTime(correction.requestedClockOutAt, timezone)
            : "Clock-out unchanged"}
        </strong>
      </div>
    </div>
  );
}

export function StaffRosterTimesheetsPage() {
  const [weekStart, setWeekStart] = useState<string | null>(null);
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
    const query = weekStart
      ? "?weekStart=" + encodeURIComponent(weekStart)
      : "";
    const response = await fetch("/api/staff-roster/timesheet" + query, {
      cache: "no-store",
    });
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
    setWeekStart((current) => current ?? body.weekStart);
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
  const inProgressCount = useMemo(
    () =>
      data?.sessions.filter(
        (session) =>
          classifyTimesheetSession({
            ...session,
            timeZone: data.timezone,
          }) === "in_progress",
      ).length ?? 0,
    [data],
  );

  const pendingCorrectionBySession = useMemo(
    () =>
      new Map(
        (data?.corrections ?? [])
          .filter((correction) => correction.status === "pending")
          .map((correction) => [correction.clockSessionId, correction] as const),
      ),
    [data?.corrections],
  );

  const pendingCorrections =
    data?.corrections.filter((correction) => correction.status === "pending") ?? [];
  const reviewedCorrections =
    data?.corrections.filter((correction) => correction.status !== "pending") ?? [];

  const correctionHasChange = useMemo(() => {
    if (!correctionSession || !data) return false;

    return (
      requestedIn !==
        localDateTimeInputInTimeZone(data.timezone, correctionSession.clockInAt) ||
      requestedOut !==
        (correctionSession.clockOutAt
          ? localDateTimeInputInTimeZone(data.timezone, correctionSession.clockOutAt)
          : "")
    );
  }, [correctionSession, data, requestedIn, requestedOut]);

  function openCorrection(session: Session) {
    if (!data) return;
    setCorrectionSession(session);
    setRequestedIn(localDateTimeInputInTimeZone(data.timezone, session.clockInAt));
    setRequestedOut(
      session.clockOutAt
        ? localDateTimeInputInTimeZone(data.timezone, session.clockOutAt)
        : "",
    );
    setReason("");
  }

  function openManagerFix(session: Session) {
    if (!data) return;
    setManagerFixSession(session);
    setManagerClockIn(
      localDateTimeInputInTimeZone(data.timezone, session.clockInAt),
    );
    setManagerClockOut(
      session.clockOutAt
        ? localDateTimeInputInTimeZone(data.timezone, session.clockOutAt)
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
      !data ||
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
          clockInAt: instantFromLocalDateTimeInTimeZone(
            data.timezone,
            managerClockIn,
          ).toISOString(),
          clockOutAt: instantFromLocalDateTimeInTimeZone(
            data.timezone,
            managerClockOut,
          ).toISOString(),
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
    if (
      !correctionSession ||
      !data ||
      busy ||
      !reason.trim() ||
      !correctionHasChange
    ) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/staff-roster/timesheet-corrections", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clockSessionId: correctionSession.id,
          requestedClockInAt: requestedIn
            ? instantFromLocalDateTimeInTimeZone(
                data.timezone,
                requestedIn,
              ).toISOString()
            : null,
          requestedClockOutAt: requestedOut
            ? instantFromLocalDateTimeInTimeZone(
                data.timezone,
                requestedOut,
              ).toISOString()
            : null,
          reason,
        }),
      });
      const body = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
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
      const body = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(body?.error ?? "Correction could not be reviewed.");
      }

      setNotice(
        decision === "approved" ? "Correction approved." : "Correction declined.",
      );
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
    if (!data) return [];

    const values: string[] = [];
    const state = classifyTimesheetSession({
      ...session,
      timeZone: data.timezone,
    });

    if (session.unrostered) values.push("Unrostered");
    if (state === "missing_clock_out") values.push("Missing clock-out");
    if (session.correctedAt) values.push("Corrected");
    if (pendingCorrectionBySession.has(session.id)) {
      values.push("Correction pending");
    }

    if (
      session.scheduledStartTime &&
      new Intl.DateTimeFormat("en-CA", {
        timeZone: data.timezone,
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
        timeZone: data.timezone,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(new Date(session.clockOutAt)) < session.scheduledEndTime.slice(0, 5)
    ) {
      values.push("Early clock-out");
    }

    return values;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#E6DBCF] bg-white p-4">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-[#0D7A6D]">
            {data?.canReview ? "Team timesheets" : "My timesheet"}
          </p>
          <h1 className="mt-1 font-[family-name:var(--font-fraunces)] text-2xl font-bold text-[#243139]">
            {weekStart
              ? dateLabel(weekStart) +
                " – " +
                dateLabel(format(addDays(parseISO(weekStart), 6), "yyyy-MM-dd"))
              : "Current week"}
          </h1>
          {data ? (
            <p className="mt-1 text-xs font-semibold text-[#66747A]">
              Times shown in {data.timezone}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <CovieButton
            tone="neutral"
            aria-label="Previous week"
            disabled={!weekStart}
            onClick={() =>
              weekStart &&
              setWeekStart(format(subDays(parseISO(weekStart), 7), "yyyy-MM-dd"))
            }
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </CovieButton>
          <CovieButton
            tone="neutral"
            disabled={!data}
            onClick={() =>
              data &&
              setWeekStart(mondayWeekStartInTimeZone(data.timezone, new Date()))
            }
          >
            Today
          </CovieButton>
          <CovieButton
            tone="neutral"
            aria-label="Next week"
            disabled={!weekStart}
            onClick={() =>
              weekStart &&
              setWeekStart(format(addDays(parseISO(weekStart), 7), "yyyy-MM-dd"))
            }
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
                <span className="text-xs font-extrabold uppercase text-[#66747A]">
                  Rostered
                </span>
                <strong className="mt-1 block text-xl text-[#243139]">
                  {durationText(rosteredMinutes)}
                </strong>
              </div>
              <div className="rounded-2xl border border-[#E6DBCF] bg-white p-4">
                <span className="text-xs font-extrabold uppercase text-[#66747A]">
                  Worked
                </span>
                <strong className="mt-1 block text-xl text-[#243139]">
                  {durationText(workedMinutes)}
                </strong>
                {inProgressCount > 0 ? (
                  <span className="mt-1 block text-xs font-semibold text-[#0D7A6D]">
                    {inProgressCount} in-progress{" "}
                    {inProgressCount === 1 ? "session is" : "sessions are"} not included yet.
                  </span>
                ) : null}
              </div>
            </section>
          ) : null}

          {data.canReview && pendingCorrections.length > 0 ? (
            <section className="rounded-2xl border-2 border-[#F4C64E] bg-[#FFF8D8] p-4">
              <h2 className="font-[family-name:var(--font-fraunces)] text-xl font-bold text-[#243139]">
                Corrections to review
              </h2>
              <div className="mt-3 space-y-3">
                {pendingCorrections.map((correction) => (
                  <article
                    key={correction.id}
                    className="rounded-xl border border-[#E2C768] bg-white p-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <strong className="block break-words text-sm text-[#243139]">
                          {correction.memberName}
                        </strong>
                        <span className="mt-1 block text-xs font-semibold text-[#66747A]">
                          {zonedDate(correction.originalClockInAt, data.timezone)}
                        </span>
                      </div>
                      <CovieStatusBadge tone="sunshine">Pending</CovieStatusBadge>
                    </div>
                    <CorrectionComparison
                      correction={correction}
                      timezone={data.timezone}
                    />
                    <div className="mt-3">
                      <span className="block text-xs font-bold text-[#66747A]">Reason</span>
                      <p className="mt-1 break-words text-sm text-[#526168]">
                        {correction.reason}
                      </p>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <CovieButton
                        disabled={busy}
                        onClick={() =>
                          void reviewCorrection(correction.id, "approved")
                        }
                      >
                        <Check className="h-4 w-4" aria-hidden="true" />
                        Approve
                      </CovieButton>
                      <CovieButton
                        tone="neutral"
                        disabled={busy}
                        onClick={() =>
                          void reviewCorrection(correction.id, "declined")
                        }
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
                const state = classifyTimesheetSession({
                  ...session,
                  timeZone: data.timezone,
                });
                const exceptions = sessionExceptions(session);
                const pendingCorrection = pendingCorrectionBySession.get(session.id);

                return (
                  <article
                    key={session.id}
                    className="rounded-2xl border border-[#E6DBCF] bg-white p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        {data.canReview ? (
                          <strong className="block break-words text-sm text-[#243139]">
                            {session.memberName}
                          </strong>
                        ) : null}
                        <span className="mt-1 block text-sm font-bold text-[#526168]">
                          {session.scheduledDate
                            ? dateLabel(session.scheduledDate)
                            : zonedDate(session.clockInAt, data.timezone)}
                        </span>
                      </div>
                      {state === "in_progress" ? (
                        <CovieStatusBadge tone="teal">In progress</CovieStatusBadge>
                      ) : pendingCorrection ? (
                        <CovieStatusBadge tone="sunshine">
                          Correction pending
                        </CovieStatusBadge>
                      ) : exceptions.length > 0 ? (
                        <CovieStatusBadge tone="sunshine">
                          {exceptions[0]}
                        </CovieStatusBadge>
                      ) : (
                        <CovieStatusBadge tone="teal">Recorded</CovieStatusBadge>
                      )}
                    </div>

                    <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                      <div>
                        <span className="block text-xs font-bold text-[#66747A]">
                          Rostered
                        </span>
                        <strong className="mt-1 block text-[#243139]">
                          {session.scheduledStartTime && session.scheduledEndTime
                            ? compactTime(session.scheduledStartTime) +
                              " – " +
                              compactTime(session.scheduledEndTime)
                            : "No rostered shift"}
                        </strong>
                      </div>
                      <div>
                        <span className="block text-xs font-bold text-[#66747A]">
                          Worked
                        </span>
                        <strong className="mt-1 block text-[#243139]">
                          {zonedTime(session.clockInAt, data.timezone)} –{" "}
                          {session.clockOutAt
                            ? zonedTime(session.clockOutAt, data.timezone)
                            : state === "in_progress"
                              ? "In progress"
                              : "Missing clock-out"}
                        </strong>
                      </div>
                    </div>

                    {exceptions.length > 1 ? (
                      <p className="mt-3 flex items-start gap-2 text-xs font-bold text-[#8B6714]">
                        <AlertTriangle
                          className="mt-0.5 h-4 w-4 shrink-0"
                          aria-hidden="true"
                        />
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
                        Correct time
                      </CovieButton>
                    ) : state !== "in_progress" && !pendingCorrection ? (
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

          {!data.canReview && data.corrections.length > 0 ? (
            <section className="rounded-2xl border border-[#E6DBCF] bg-white p-4">
              <h2 className="font-[family-name:var(--font-fraunces)] text-xl font-bold text-[#243139]">
                Correction requests
              </h2>
              <div className="mt-3 space-y-3">
                {data.corrections.map((correction) => (
                  <article
                    key={correction.id}
                    className="rounded-xl border border-[#E6DBCF] p-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <span className="text-sm font-bold text-[#243139]">
                        {zonedDate(correction.originalClockInAt, data.timezone)}
                      </span>
                      <CovieStatusBadge tone={correctionStatusTone(correction.status)}>
                        {correctionStatusLabel(correction.status)}
                      </CovieStatusBadge>
                    </div>
                    <CorrectionComparison
                      correction={correction}
                      timezone={data.timezone}
                    />
                    <p className="mt-3 break-words text-sm text-[#526168]">
                      {correction.reason}
                    </p>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {data.canReview && reviewedCorrections.length > 0 ? (
            <section className="rounded-2xl border border-[#E6DBCF] bg-white p-4">
              <h2 className="font-[family-name:var(--font-fraunces)] text-xl font-bold text-[#243139]">
                Reviewed corrections
              </h2>
              <div className="mt-3 space-y-3">
                {reviewedCorrections.map((correction) => (
                  <article
                    key={correction.id}
                    className="rounded-xl border border-[#E6DBCF] p-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <strong className="block break-words text-sm text-[#243139]">
                          {correction.memberName}
                        </strong>
                        <span className="mt-1 block text-xs font-semibold text-[#66747A]">
                          {zonedDate(correction.originalClockInAt, data.timezone)}
                        </span>
                      </div>
                      <CovieStatusBadge tone={correctionStatusTone(correction.status)}>
                        {correctionStatusLabel(correction.status)}
                      </CovieStatusBadge>
                    </div>
                    <CorrectionComparison
                      correction={correction}
                      timezone={data.timezone}
                    />
                    <p className="mt-3 break-words text-sm text-[#526168]">
                      {correction.reason}
                    </p>
                  </article>
                ))}
              </div>
            </section>
          ) : null}
        </>
      ) : null}

      {managerFixSession && data ? (
        <CovieDialog
          id="manager-timesheet-fix-title"
          title={"Correct " + managerFixSession.memberName + "’s time"}
          description={
            "This changes the recorded worked time immediately. Times are entered in " +
            data.timezone +
            " and the change stays in the audit history."
          }
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

      {correctionSession && data ? (
        <CovieDialog
          id="timesheet-correction-title"
          title="Request a correction"
          description={
            "Your recorded time will not change until a manager approves this request. Times are entered in " +
            data.timezone +
            "."
          }
          icon={<PencilLine aria-hidden="true" />}
          iconTone="sunshine"
          size="md"
          busy={busy}
          onClose={() => setCorrectionSession(null)}
          footer={
            <>
              <CovieButton
                tone="neutral"
                disabled={busy}
                onClick={() => setCorrectionSession(null)}
              >
                Cancel
              </CovieButton>
              <CovieButton
                disabled={busy || !reason.trim() || !correctionHasChange}
                onClick={() => void requestCorrection()}
              >
                Send request
              </CovieButton>
            </>
          }
        >
          <div className="rounded-xl bg-[#F8F4EF] p-3 text-sm">
            <span className="block text-xs font-bold text-[#66747A]">
              Original recorded time
            </span>
            <strong className="mt-1 block text-[#243139]">
              {zonedTime(correctionSession.clockInAt, data.timezone)} –{" "}
              {correctionSession.clockOutAt
                ? zonedTime(correctionSession.clockOutAt, data.timezone)
                : "No clock-out recorded"}
            </strong>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label>
              <span className="mb-1.5 block text-sm font-bold">
                Requested clock in
              </span>
              <CovieInput
                type="datetime-local"
                value={requestedIn}
                disabled={busy}
                onChange={(event) => setRequestedIn(event.target.value)}
              />
            </label>
            <label>
              <span className="mb-1.5 block text-sm font-bold">
                Requested clock out
              </span>
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
                placeholder="Briefly explain what needs correcting."
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
          </div>
          {!correctionHasChange ? (
            <p className="mt-3 text-xs font-semibold text-[#8B6714]">
              Change at least one recorded time before sending the request.
            </p>
          ) : null}
        </CovieDialog>
      ) : null}
    </div>
  );
}
