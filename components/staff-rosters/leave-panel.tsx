"use client";

import {
  CalendarDays,
  Check,
  LoaderCircle,
  Plus,
  X,
} from "lucide-react";
import { addDays, format } from "date-fns";
import { useCallback, useEffect, useState } from "react";
import {
  CovieButton,
  CovieConfirmDialog,
  CovieDialog,
  CovieEmptyState,
  CovieInput,
  CovieNotice,
  CovieStatusBadge,
  CovieTextarea,
} from "@/components/ui/covie";

type LeaveRequest = {
  id: string;
  memberId: string;
  memberName: string;
  startDate: string;
  endDate: string;
  allDay: boolean;
  startTime: string | null;
  endTime: string | null;
  note: string | null;
  status: "pending" | "approved" | "declined" | "cancelled";
  createdAt: string;
  reviewedAt: string | null;
};

type LeavePayload = {
  currentMemberId: string;
  currentAccessRole: "owner" | "manager" | "staff";
  canReview: boolean;
  requests: LeaveRequest[];
};

function todayValue() {
  return format(new Date(), "yyyy-MM-dd");
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-NZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value + "T00:00:00Z"));
}

function statusTone(status: LeaveRequest["status"]) {
  if (status === "approved") return "teal" as const;
  if (status === "pending") return "sunshine" as const;
  return "neutral" as const;
}

export function StaffRosterLeavePanel() {
  const [data, setData] = useState<LeavePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<LeaveRequest | null>(null);
  const [startDate, setStartDate] = useState(todayValue);
  const [endDate, setEndDate] = useState(todayValue);
  const [allDay, setAllDay] = useState(true);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [note, setNote] = useState("");

  const refresh = useCallback(async () => {
    const from = format(addDays(new Date(), -30), "yyyy-MM-dd");
    const to = format(addDays(new Date(), 180), "yyyy-MM-dd");
    const response = await fetch(
      "/api/staff-roster/leave?from=" +
        encodeURIComponent(from) +
        "&to=" +
        encodeURIComponent(to),
      { cache: "no-store" },
    );
    const body = (await response.json().catch(() => null)) as
      | LeavePayload
      | { error?: string }
      | null;

    if (!response.ok || !body || !("requests" in body)) {
      throw new Error(
        body && "error" in body && body.error
          ? body.error
          : "Leave requests could not be loaded.",
      );
    }

    setData(body);
    setError(null);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh().catch((caught) =>
        setError(
          caught instanceof Error
            ? caught.message
            : "Leave requests could not be loaded.",
        ),
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  function openRequest() {
    const today = todayValue();
    setStartDate(today);
    setEndDate(today);
    setAllDay(true);
    setStartTime("");
    setEndTime("");
    setNote("");
    setDialogOpen(true);
  }

  async function createRequest() {
    if (busy || !startDate || !endDate) return;
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch("/api/staff-roster/leave", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          startDate,
          endDate,
          allDay,
          startTime: allDay ? null : startTime,
          endTime: allDay ? null : endTime,
          note,
        }),
      });
      const body = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (!response.ok) {
        throw new Error(body?.error ?? "Leave request could not be sent.");
      }

      setDialogOpen(false);
      setNotice("Leave request sent for review.");
      await refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Leave request could not be sent.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function review(
    leaveRequestId: string,
    decision: "approved" | "declined",
  ) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch("/api/staff-roster/leave", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ leaveRequestId, decision }),
      });
      const body = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (!response.ok) {
        throw new Error(body?.error ?? "Leave request could not be reviewed.");
      }

      setNotice(decision === "approved" ? "Leave approved." : "Leave declined.");
      await refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Leave request could not be reviewed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function cancelRequest() {
    if (!cancelTarget || busy) return;
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/staff-roster/leave", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ leaveRequestId: cancelTarget.id }),
      });
      const body = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (!response.ok) {
        throw new Error(body?.error ?? "Leave request could not be cancelled.");
      }

      setCancelTarget(null);
      setNotice("Leave request cancelled.");
      await refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Leave request could not be cancelled.",
      );
    } finally {
      setBusy(false);
    }
  }

  const pending =
    data?.requests.filter((request) => request.status === "pending") ?? [];

  return (
    <section className="mt-6 border-t-2 border-[#243139] pt-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-[#0D7A6D]">
            Leave
          </p>
          <h2 className="mt-1 font-[family-name:var(--font-fraunces)] text-2xl font-bold text-[#243139]">
            {data?.canReview ? "Leave requests" : "My leave"}
          </h2>
          <p className="mt-1 text-sm text-[#66747A]">
            Simple leave requests that feed directly into the roster.
          </p>
        </div>
        <CovieButton onClick={openRequest}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Request leave
        </CovieButton>
      </div>

      {error ? (
        <CovieNotice tone="danger" className="mb-4">
          {error}
        </CovieNotice>
      ) : null}
      {notice ? (
        <CovieNotice tone="teal" className="mb-4">
          {notice}
        </CovieNotice>
      ) : null}

      {!data && !error ? (
        <div className="flex min-h-32 items-center justify-center rounded-2xl border border-[#E6DBCF] bg-white text-sm text-[#66747A]">
          <LoaderCircle className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
          Loading leave…
        </div>
      ) : null}

      {data?.canReview && pending.length > 0 ? (
        <div className="mb-4 rounded-2xl border-2 border-[#F4C64E] bg-[#FFF8D8] p-4">
          <strong className="text-[#243139]">
            {pending.length} waiting for review
          </strong>
        </div>
      ) : null}

      {data && data.requests.length === 0 ? (
        <CovieEmptyState
          icon={
            <CalendarDays
              className="h-8 w-8 text-[#19A897]"
              aria-hidden="true"
            />
          }
          title="No leave requests"
          description="Leave requests and their status will appear here."
          action={<CovieButton onClick={openRequest}>Request leave</CovieButton>}
        />
      ) : null}

      {data && data.requests.length > 0 ? (
        <div className="space-y-2">
          {data.requests.map((request) => (
            <article
              key={request.id}
              className="rounded-xl border border-[#E6DBCF] bg-white p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  {data.canReview ? (
                    <strong className="block text-sm text-[#243139]">
                      {request.memberName}
                    </strong>
                  ) : null}
                  <p className="mt-1 text-sm font-bold text-[#526168]">
                    {dateLabel(request.startDate)}
                    {request.endDate !== request.startDate
                      ? " – " + dateLabel(request.endDate)
                      : ""}
                  </p>
                  <p className="mt-1 text-xs text-[#66747A]">
                    {request.allDay
                      ? "All day"
                      : (request.startTime ?? "") +
                        "–" +
                        (request.endTime ?? "")}
                  </p>
                  {request.note ? (
                    <p className="mt-2 text-sm text-[#526168]">
                      {request.note}
                    </p>
                  ) : null}
                </div>
                <CovieStatusBadge tone={statusTone(request.status)}>
                  {request.status[0].toUpperCase() + request.status.slice(1)}
                </CovieStatusBadge>
              </div>

              {data.canReview && request.status === "pending" ? (
                <div className="mt-3 flex gap-2">
                  <CovieButton
                    disabled={busy}
                    onClick={() => void review(request.id, "approved")}
                  >
                    <Check className="h-4 w-4" aria-hidden="true" />
                    Approve
                  </CovieButton>
                  <CovieButton
                    tone="neutral"
                    disabled={busy}
                    onClick={() => void review(request.id, "declined")}
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                    Decline
                  </CovieButton>
                </div>
              ) : null}

              {request.memberId === data.currentMemberId &&
              (request.status === "pending" ||
                request.status === "approved") ? (
                <CovieButton
                  tone="neutral"
                  className="mt-3"
                  disabled={busy}
                  onClick={() => setCancelTarget(request)}
                >
                  Cancel request
                </CovieButton>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}

      {dialogOpen ? (
        <CovieDialog
          id="staff-leave-dialog-title"
          title="Request leave"
          description="Your manager will review this request before it becomes approved leave on the roster."
          icon={<CalendarDays aria-hidden="true" />}
          iconTone="teal"
          size="md"
          busy={busy}
          onClose={() => setDialogOpen(false)}
          footer={
            <>
              <CovieButton
                tone="neutral"
                disabled={busy}
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </CovieButton>
              <CovieButton
                disabled={
                  busy ||
                  !startDate ||
                  !endDate ||
                  (!allDay && (!startTime || !endTime))
                }
                onClick={() => void createRequest()}
              >
                Send request
              </CovieButton>
            </>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              <span className="mb-1.5 block text-sm font-bold">From</span>
              <CovieInput
                type="date"
                value={startDate}
                onChange={(event) => {
                  setStartDate(event.target.value);
                  if (endDate < event.target.value) {
                    setEndDate(event.target.value);
                  }
                }}
              />
            </label>
            <label>
              <span className="mb-1.5 block text-sm font-bold">To</span>
              <CovieInput
                type="date"
                min={startDate}
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </label>

            <label className="sm:col-span-2 flex min-h-11 items-center gap-3 rounded-xl border border-[#E6DBCF] bg-[#FFF9F2] px-3">
              <input
                type="checkbox"
                checked={allDay}
                onChange={(event) => setAllDay(event.target.checked)}
                className="h-5 w-5 accent-[#19A897]"
              />
              <span className="text-sm font-bold text-[#243139]">All day</span>
            </label>

            {!allDay ? (
              <>
                <label>
                  <span className="mb-1.5 block text-sm font-bold">
                    Starts
                  </span>
                  <CovieInput
                    type="time"
                    step={900}
                    value={startTime}
                    onChange={(event) => setStartTime(event.target.value)}
                  />
                </label>
                <label>
                  <span className="mb-1.5 block text-sm font-bold">
                    Ends
                  </span>
                  <CovieInput
                    type="time"
                    step={900}
                    value={endTime}
                    onChange={(event) => setEndTime(event.target.value)}
                  />
                </label>
              </>
            ) : null}

            <label className="sm:col-span-2">
              <span className="mb-1.5 block text-sm font-bold">Note</span>
              <CovieTextarea
                rows={3}
                maxLength={500}
                value={note}
                placeholder="Optional"
                onChange={(event) => setNote(event.target.value)}
              />
            </label>
          </div>
        </CovieDialog>
      ) : null}

      <CovieConfirmDialog
        open={Boolean(cancelTarget)}
        id="cancel-staff-leave-title"
        title="Cancel leave request?"
        description="This request will be marked cancelled and will no longer block the roster."
        confirmLabel="Cancel request"
        busy={busy}
        icon={<CalendarDays aria-hidden="true" />}
        onCancel={() => setCancelTarget(null)}
        onConfirm={() => void cancelRequest()}
      />
    </section>
  );
}
