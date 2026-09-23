"use client";

import { CalendarCheck2, LoaderCircle, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { localDateInTimeZone } from "@/lib/calendar/time";
import { StaffRosterLeavePanel } from "@/components/staff-rosters/leave-panel";
import {
  CovieButton,
  CovieConfirmDialog,
  CovieDialog,
  CovieEmptyState,
  CovieInput,
  CovieNotice,
  CovieSelect,
  CovieStatusBadge,
  CovieTextarea,
} from "@/components/ui/covie";

type StaffAccessRole = "owner" | "manager" | "staff";

type MemberOption = {
  id: string;
  displayName: string;
};

type AvailabilityEntry = {
  id: string;
  memberId: string;
  memberName: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  status: "available" | "unavailable";
  note: string | null;
  canDelete: boolean;
};

type AvailabilityPayload = {
  calendarTimezone: string;
  currentMemberId: string;
  currentAccessRole: StaffAccessRole;
  canManageAll: boolean;
  from: string;
  to: string;
  members: MemberOption[];
  availability: AvailabilityEntry[];
};

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-NZ", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(value + "T00:00:00Z"));
}

export function StaffRosterAvailabilityPage() {
  const [data, setData] = useState<AvailabilityPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [memberId, setMemberId] = useState("");
  const [date, setDate] = useState("");
  const [status, setStatus] = useState<"available" | "unavailable">(
    "unavailable",
  );
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<AvailabilityEntry | null>(
    null,
  );
  const readVersion = useRef(0);
  const activeRange = useRef<{ from: string; to: string } | null>(null);

  const refresh = useCallback(async () => {
    const version = ++readVersion.current;
    const range = activeRange.current;
    const query = range ? `?${new URLSearchParams(range).toString()}` : "";
    const response = await fetch(`/api/staff-roster/availability${query}`, {
      cache: "no-store",
    });
    const body = (await response.json().catch(() => null)) as
      | AvailabilityPayload
      | { error?: string }
      | null;

    if (!response.ok || !body || !("availability" in body)) {
      throw new Error(
        body && "error" in body && body.error
          ? body.error
          : "Availability could not be loaded.",
      );
    }

    if (version === readVersion.current) {
      if (!activeRange.current) {
        activeRange.current = { from: body.from, to: body.to };
        setRangeFrom(body.from);
        setRangeTo(body.to);
      }
      setData(body);
      setMemberId((current) => current || body.currentMemberId);
      setError(null);
    }
  }, []);

  const reload = useCallback(async () => {
    const version = readVersion.current + 1;
    try {
      await refresh();
      return true;
    } catch (caught) {
      if (version === readVersion.current) {
        setData(null);
        setError(caught instanceof Error ? caught.message : "Availability could not be loaded.");
      }
      return false;
    }
  }, [refresh]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void reload();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [reload]);

  function openCreate() {
    if (busy || !data) return;
    setMemberId(data.currentMemberId);
    setDate(localDateInTimeZone(data.calendarTimezone));
    setStatus("unavailable");
    setStartTime("");
    setEndTime("");
    setNote("");
    setDialogOpen(true);
  }

  async function applyRange() {
    if (busy || !rangeFrom || !rangeTo || rangeTo < rangeFrom) return;
    setBusy(true);
    setError(null);
    activeRange.current = { from: rangeFrom, to: rangeTo };
    await reload();
    setBusy(false);
  }

  async function saveAvailability() {
    if (!memberId || !date || busy) return;
    setBusy(true);
    setError(null);
    ++readVersion.current;
    let mutationError: string | null = null;

    try {
      const response = await fetch("/api/staff-roster/availability", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          memberId,
          date,
          status,
          startTime,
          endTime,
          note,
        }),
      });
      const body = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(body?.error ?? "Availability could not be saved.");
      }

    } catch (caught) {
      mutationError = caught instanceof Error ? caught.message : "Availability could not be saved.";
    } finally {
      const selected = activeRange.current;
      if (selected) {
        const from = date < selected.from ? date : selected.from;
        const to = date > selected.to ? date : selected.to;
        activeRange.current = { from, to };
        setRangeFrom(from);
        setRangeTo(to);
      }
      const loaded = await reload();
      setDialogOpen(false);
      if (loaded) {
        if (mutationError) setError(`${mutationError} The list has been refreshed; check it before trying again.`);
      } else if (mutationError) {
        setError(`${mutationError} Availability could not be refreshed. Retry loading before trying again.`);
      }
      setBusy(false);
    }
  }

  async function deleteAvailability() {
    if (!deleteTarget || busy) return;
    setBusy(true);
    setError(null);
    ++readVersion.current;
    let mutationError: string | null = null;
    let removed = false;

    try {
      const response = await fetch("/api/staff-roster/availability", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ availabilityId: deleteTarget.id }),
      });
      const body = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(body?.error ?? "Availability could not be removed.");
      }

      removed = true;
    } catch (caught) {
      mutationError = caught instanceof Error ? caught.message : "Availability could not be removed.";
    } finally {
      const loaded = await reload();
      if (loaded) {
        if (removed || mutationError) setDeleteTarget(null);
        if (mutationError) setError(`${mutationError} The list has been refreshed; check it before trying again.`);
      } else {
        setDeleteTarget(null);
        if (mutationError) setError(`${mutationError} Availability could not be refreshed. Retry loading before trying again.`);
      }
      setBusy(false);
    }
  }

  return (
    <>
      <StaffRosterLeavePanel />

      <section className="border-t-2 border-[#243139] pt-6">
      {error ? (
        <CovieNotice tone="danger" role="alert" className="mb-4">
          {error}
        </CovieNotice>
      ) : null}
      {!data && error ? <CovieButton tone="neutral" onClick={() => void reload()}>Retry loading</CovieButton> : null}

      {!data && !error ? (
        <div className="flex min-h-40 items-center justify-center rounded-2xl border border-[#E6DBCF] bg-white text-sm text-[#66747A]">
          <LoaderCircle className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
          Loading availability…
        </div>
      ) : null}

      {data ? (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-bold text-[#526168]">
              Upcoming availability
            </p>
            <CovieButton disabled={busy} onClick={openCreate}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add availability
            </CovieButton>
          </div>

          <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-[#E6DBCF] bg-[#FFF9F2] p-3">
            <label className="min-w-0 flex-1 basis-36">
              <span className="mb-1 block text-sm font-bold text-[#243139]">From</span>
              <CovieInput type="date" value={rangeFrom} onChange={(event) => setRangeFrom(event.target.value)} />
            </label>
            <label className="min-w-0 flex-1 basis-36">
              <span className="mb-1 block text-sm font-bold text-[#243139]">To</span>
              <CovieInput type="date" min={rangeFrom} value={rangeTo} onChange={(event) => setRangeTo(event.target.value)} />
            </label>
            <CovieButton tone="neutral" disabled={busy || !rangeFrom || !rangeTo || rangeTo < rangeFrom} onClick={() => void applyRange()}>
              Show dates
            </CovieButton>
          </div>

          {data.availability.length === 0 ? (
            <CovieEmptyState
              icon={
                <CalendarCheck2
                  className="h-8 w-8 text-[#19A897]"
                  aria-hidden="true"
                />
              }
              title="No availability in these dates"
              description="Choose another date range or add available or unavailable time."
              action={
                <CovieButton disabled={busy} onClick={openCreate}>
                  Add availability
                </CovieButton>
              }
            />
          ) : (
            <div className="space-y-2">
              {data.availability.map((entry) => (
                <article
                  key={entry.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E6DBCF] bg-white px-4 py-3"
                >
                  <div className="min-w-0 flex-1 break-words">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="text-sm text-[#243139]">
                        {data.canManageAll ? entry.memberName : "My availability"}
                      </strong>
                      <CovieStatusBadge
                        tone={
                          entry.status === "available" ? "teal" : "sunshine"
                        }
                      >
                        {entry.status === "available"
                          ? "Available"
                          : "Unavailable"}
                      </CovieStatusBadge>
                    </div>
                    <p className="mt-1 text-sm text-[#526168]">
                      {dateLabel(entry.date)}
                      {" · "}
                      {entry.startTime && entry.endTime
                        ? entry.startTime + "–" + entry.endTime
                        : "All day"}
                    </p>
                    {entry.note ? (
                      <p className="mt-1 text-xs text-[#66747A]">{entry.note}</p>
                    ) : null}
                  </div>

                  {entry.canDelete ? (
                    <CovieButton
                      tone="neutral"
                      disabled={busy}
                      onClick={() => setDeleteTarget(entry)}
                      aria-label={"Remove availability on " + dateLabel(entry.date)}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                      Remove
                    </CovieButton>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </>
      ) : null}

      {dialogOpen && data ? (
        <CovieDialog
          id="staff-availability-dialog-title"
          title="Add availability"
          description="Leave times blank for the whole day. Times on one day cannot overlap; remove an old entry first if needed. Back-to-back times are allowed."
          icon={<CalendarCheck2 aria-hidden="true" />}
          iconTone="teal"
          size="sm"
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
                disabled={busy || !memberId || !date || Boolean(startTime) !== Boolean(endTime) || Boolean(startTime && endTime && endTime <= startTime)}
                onClick={() => void saveAvailability()}
              >
                {busy ? "Saving…" : "Save"}
              </CovieButton>
            </>
          }
        >
          <div className="grid min-w-0 gap-4 sm:grid-cols-2">
            {data.canManageAll ? (
              <label className="sm:col-span-2">
                <span className="mb-1.5 block text-sm font-bold">
                  Team member
                </span>
                <CovieSelect
                  value={memberId}
                  onChange={(event) => setMemberId(event.target.value)}
                >
                  {data.members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.displayName}
                    </option>
                  ))}
                </CovieSelect>
              </label>
            ) : null}

            <label>
              <span className="mb-1.5 block text-sm font-bold">Date</span>
              <CovieInput
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </label>

            <label>
              <span className="mb-1.5 block text-sm font-bold">Status</span>
              <CovieSelect
                value={status}
                onChange={(event) =>
                  setStatus(
                    event.target.value as "available" | "unavailable",
                  )
                }
              >
                <option value="unavailable">Unavailable</option>
                <option value="available">Available</option>
              </CovieSelect>
            </label>

            <label>
              <span className="mb-1.5 block text-sm font-bold">Starts</span>
              <CovieInput
                type="time"
                value={startTime}
                onChange={(event) => setStartTime(event.target.value)}
              />
            </label>

            <label>
              <span className="mb-1.5 block text-sm font-bold">Ends</span>
              <CovieInput
                type="time"
                value={endTime}
                onChange={(event) => setEndTime(event.target.value)}
              />
            </label>

            <label className="sm:col-span-2">
              <span className="mb-1.5 block text-sm font-bold">Note</span>
              <CovieTextarea
                rows={3}
                value={note}
                maxLength={240}
                placeholder="Optional"
                onChange={(event) => setNote(event.target.value)}
              />
            </label>
          </div>
        </CovieDialog>
      ) : null}

      </section>

      <CovieConfirmDialog
        open={Boolean(deleteTarget)}
        id="delete-staff-availability-title"
        title="Remove availability?"
        description="This availability entry will be removed from the roster."
        confirmLabel="Remove"
        busy={busy}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void deleteAvailability()}
      />
    </>
  );
}
