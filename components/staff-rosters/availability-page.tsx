"use client";

import { CalendarCheck2, LoaderCircle, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
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
  currentMemberId: string;
  currentAccessRole: StaffAccessRole;
  canManageAll: boolean;
  from: string;
  to: string;
  members: MemberOption[];
  availability: AvailabilityEntry[];
};

function localDateValue() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

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
  const [date, setDate] = useState(localDateValue);
  const [status, setStatus] = useState<"available" | "unavailable">(
    "unavailable",
  );
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AvailabilityEntry | null>(
    null,
  );

  const refresh = useCallback(async () => {
    const response = await fetch("/api/staff-roster/availability", {
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

    setData(body);
    setMemberId((current) => current || body.currentMemberId);
    setError(null);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh().catch((caught) =>
        setError(
          caught instanceof Error
            ? caught.message
            : "Availability could not be loaded.",
        ),
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  function openCreate() {
    setMemberId(data?.currentMemberId ?? "");
    setDate(data?.from ?? localDateValue());
    setStatus("unavailable");
    setStartTime("");
    setEndTime("");
    setNote("");
    setDialogOpen(true);
  }

  async function saveAvailability() {
    if (!memberId || !date || busy) return;
    setBusy(true);
    setError(null);

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

      setDialogOpen(false);
      await refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Availability could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function deleteAvailability() {
    if (!deleteTarget || busy) return;
    setBusy(true);
    setError(null);

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

      setDeleteTarget(null);
      await refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Availability could not be removed.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {error ? (
        <CovieNotice tone="danger" role="alert" className="mb-4">
          {error}
        </CovieNotice>
      ) : null}

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
            <CovieButton onClick={openCreate}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add availability
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
              title="No availability yet"
              description="Add available or unavailable time so the roster can use it when shifts are built."
              action={
                <CovieButton onClick={openCreate}>
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
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="text-sm text-[#243139]">
                        {entry.memberName}
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
                      onClick={() => setDeleteTarget(entry)}
                      aria-label={"Remove " + entry.memberName + " availability"}
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
          description="Leave the times blank when this applies to the whole day."
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
                disabled={busy || !memberId || !date}
                onClick={() => void saveAvailability()}
              >
                {busy ? "Saving…" : "Save"}
              </CovieButton>
            </>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
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
