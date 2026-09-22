"use client";

import {
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  LoaderCircle,
  MapPin,
  Plus,
  Trash2,
  UserRound,
} from "lucide-react";
import {
  addDays,
  format,
  parseISO,
  startOfWeek,
  subDays,
} from "date-fns";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
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

type Member = {
  id: string;
  displayName: string;
  accessRole: StaffAccessRole;
  defaultRoleId: string | null;
  defaultLocationId: string | null;
};

type Option = { id: string; name: string };

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
  availabilityOverride: boolean;
};

type RosterPayload = {
  weekStart: string;
  weekEnd: string;
  currentMemberId: string;
  currentAccessRole: StaffAccessRole;
  canManageRoster: boolean;
  setup: {
    roleCount: number;
    locationCount: number;
    memberCount: number;
    setupCompletedAt: string | null;
  };
  members: Member[];
  roles: Option[];
  locations: Option[];
  shifts: Shift[];
};

type ShiftForm = {
  shiftId: string | null;
  memberId: string;
  date: string;
  startTime: string;
  endTime: string;
  roleId: string;
  locationId: string;
  note: string;
};

function currentWeekStart() {
  return format(
    startOfWeek(new Date(), { weekStartsOn: 1 }),
    "yyyy-MM-dd",
  );
}

function dayLabel(date: string) {
  return new Intl.DateTimeFormat("en-NZ", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(date + "T00:00:00Z"));
}

function weekLabel(start: string, end: string) {
  const startDate = new Date(start + "T00:00:00Z");
  const endDate = new Date(end + "T00:00:00Z");
  const sameMonth =
    startDate.getUTCMonth() === endDate.getUTCMonth() &&
    startDate.getUTCFullYear() === endDate.getUTCFullYear();

  const first = new Intl.DateTimeFormat("en-NZ", {
    day: "numeric",
    month: sameMonth ? undefined : "short",
    timeZone: "UTC",
  }).format(startDate);
  const last = new Intl.DateTimeFormat("en-NZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(endDate);

  return first + " – " + last;
}

export function StaffRosterCalendarPage() {
  const [weekStart, setWeekStart] = useState(currentWeekStart);
  const [data, setData] = useState<RosterPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Shift | null>(null);
  const [form, setForm] = useState<ShiftForm>({
    shiftId: null,
    memberId: "",
    date: "",
    startTime: "",
    endTime: "",
    roleId: "",
    locationId: "",
    note: "",
  });

  const refresh = useCallback(async (nextWeekStart: string) => {
    const response = await fetch(
      "/api/staff-roster/shifts?weekStart=" +
        encodeURIComponent(nextWeekStart),
      { cache: "no-store" },
    );
    const body = (await response.json().catch(() => null)) as
      | RosterPayload
      | { error?: string }
      | null;

    if (!response.ok || !body || !("shifts" in body)) {
      throw new Error(
        body && "error" in body && body.error
          ? body.error
          : "The roster could not be loaded.",
      );
    }

    setData(body);
    setError(null);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh(weekStart).catch((caught) =>
        setError(
          caught instanceof Error
            ? caught.message
            : "The roster could not be loaded.",
        ),
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh, weekStart]);

  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) =>
        format(addDays(parseISO(weekStart), index), "yyyy-MM-dd"),
      ),
    [weekStart],
  );

  function openCreate(memberId?: string, date?: string) {
    const member =
      data?.members.find((item) => item.id === memberId) ??
      data?.members[0] ??
      null;

    setConflictMessage(null);
    setForm({
      shiftId: null,
      memberId: member?.id ?? "",
      date: date ?? days[0] ?? weekStart,
      startTime: "",
      endTime: "",
      roleId: member?.defaultRoleId ?? "",
      locationId: member?.defaultLocationId ?? "",
      note: "",
    });
    setDialogOpen(true);
  }

  function openEdit(shift: Shift) {
    setConflictMessage(null);
    setForm({
      shiftId: shift.id,
      memberId: shift.memberId,
      date: shift.date,
      startTime: shift.startTime,
      endTime: shift.endTime,
      roleId: shift.roleId ?? "",
      locationId: shift.locationId ?? "",
      note: shift.note ?? "",
    });
    setDialogOpen(true);
  }

  function updateMember(memberId: string) {
    const member = data?.members.find((item) => item.id === memberId);
    setForm((current) => ({
      ...current,
      memberId,
      roleId: member?.defaultRoleId ?? current.roleId,
      locationId: member?.defaultLocationId ?? current.locationId,
    }));
  }

  async function saveShift(overrideAvailabilityConflict = false) {
    if (
      busy ||
      !form.memberId ||
      !form.date ||
      !form.startTime ||
      !form.endTime
    ) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/staff-roster/shifts", {
        method: form.shiftId ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...(form.shiftId ? { shiftId: form.shiftId } : {}),
          memberId: form.memberId,
          date: form.date,
          startTime: form.startTime,
          endTime: form.endTime,
          roleId: form.roleId,
          locationId: form.locationId,
          note: form.note,
          overrideAvailabilityConflict,
        }),
      });

      const body = (await response.json().catch(() => null)) as
        | { error?: string; code?: string | null }
        | null;

      if (!response.ok) {
        if (body?.code === "availability_conflict") {
          setConflictMessage(
            body.error ??
              "This person is marked unavailable during the selected time.",
          );
          return;
        }
        throw new Error(body?.error ?? "The shift could not be saved.");
      }

      setConflictMessage(null);
      setDialogOpen(false);
      await refresh(weekStart);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The shift could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function deleteShift() {
    if (!deleteTarget || busy) return;
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/staff-roster/shifts", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ shiftId: deleteTarget.id }),
      });
      const body = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(body?.error ?? "The shift could not be deleted.");
      }

      setDeleteTarget(null);
      setDialogOpen(false);
      await refresh(weekStart);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The shift could not be deleted.",
      );
    } finally {
      setBusy(false);
    }
  }

  function shiftsFor(memberId: string, date: string) {
    return (
      data?.shifts.filter(
        (shift) => shift.memberId === memberId && shift.date === date,
      ) ?? []
    );
  }

  function goToWeek(nextDate: Date) {
    setWeekStart(format(nextDate, "yyyy-MM-dd"));
  }

  return (
    <>
      {error ? (
        <CovieNotice tone="danger" role="alert" className="mb-4">
          {error}
        </CovieNotice>
      ) : null}

      {!data && !error ? (
        <div className="flex min-h-48 items-center justify-center rounded-2xl border border-[#E6DBCF] bg-white text-sm text-[#66747A]">
          <LoaderCircle className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
          Loading roster…
        </div>
      ) : null}

      {data ? (
        <>
          {!data.setup.setupCompletedAt && data.canManageRoster ? (
            <CovieNotice tone="sunshine" className="mb-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span>
                  Finish the quick roster setup to make roles, locations and
                  team defaults easier to manage.
                </span>
                <Link
                  href="/calendar-types/staff-rosters/setup"
                  className="inline-flex min-h-11 items-center rounded-[10px] border border-[#243139] bg-white px-3 text-sm font-extrabold text-[#243139]"
                >
                  Finish setup
                </Link>
              </div>
            </CovieNotice>
          ) : null}

          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CovieButton
                tone="neutral"
                aria-label="Previous week"
                onClick={() =>
                  goToWeek(subDays(parseISO(weekStart), 7))
                }
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </CovieButton>
              <CovieButton
                tone="neutral"
                onClick={() => setWeekStart(currentWeekStart())}
              >
                Today
              </CovieButton>
              <CovieButton
                tone="neutral"
                aria-label="Next week"
                onClick={() =>
                  goToWeek(addDays(parseISO(weekStart), 7))
                }
              >
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </CovieButton>
            </div>

            <strong className="text-sm text-[#243139] sm:text-base">
              {weekLabel(data.weekStart, data.weekEnd)}
            </strong>

            {data.canManageRoster ? (
              <CovieButton onClick={() => openCreate()}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                Create shift
              </CovieButton>
            ) : null}
          </div>

          {data.members.length === 0 ? (
            <CovieEmptyState
              icon={
                <UserRound
                  className="h-8 w-8 text-[#19A897]"
                  aria-hidden="true"
                />
              }
              title="Add someone to the team first"
              description="The roster needs at least one active team member before shifts can be assigned."
              action={
                data.canManageRoster ? (
                  <Link
                    href="/calendar-types/staff-rosters/organiser/team"
                    className="inline-flex min-h-11 items-center rounded-[10px] bg-[#FF6B5F] px-4 text-sm font-extrabold text-[#243139]"
                  >
                    Open team
                  </Link>
                ) : undefined
              }
            />
          ) : (
            <>
              <div className="hidden overflow-x-auto rounded-2xl border-2 border-[#243139] bg-white md:block">
                <div className="min-w-[1080px]">
                  <div className="grid grid-cols-[180px_repeat(7,minmax(120px,1fr))] border-b border-[#E6DBCF] bg-[#FFF9F2]">
                    <div className="p-3 text-xs font-extrabold uppercase tracking-[0.08em] text-[#66747A]">
                      Team
                    </div>
                    {days.map((day) => (
                      <div
                        key={day}
                        className="border-l border-[#E6DBCF] p-3 text-center text-sm font-extrabold text-[#243139]"
                      >
                        {dayLabel(day)}
                      </div>
                    ))}
                  </div>

                  {data.members.map((member) => (
                    <div
                      key={member.id}
                      className="grid grid-cols-[180px_repeat(7,minmax(120px,1fr))] border-b border-[#E6DBCF] last:border-b-0"
                    >
                      <div className="p-3">
                        <strong className="block truncate text-sm text-[#243139]">
                          {member.displayName}
                        </strong>
                        <span className="mt-1 block text-xs text-[#66747A]">
                          {member.accessRole === "owner"
                            ? "Owner"
                            : member.accessRole === "manager"
                              ? "Manager"
                              : "Staff"}
                        </span>
                      </div>

                      {days.map((day) => {
                        const cellShifts = shiftsFor(member.id, day);
                        return (
                          <div
                            key={day}
                            className="min-h-28 border-l border-[#E6DBCF] p-2"
                          >
                            <div className="space-y-2">
                              {cellShifts.map((shift) => (
                                <button
                                  key={shift.id}
                                  type="button"
                                  disabled={!data.canManageRoster}
                                  onClick={() => openEdit(shift)}
                                  className="w-full rounded-xl border border-[#BFEDE6] bg-[#EAF8F5] p-2 text-left transition enabled:hover:border-[#19A897]"
                                >
                                  <strong className="block text-xs text-[#243139]">
                                    {shift.startTime}–{shift.endTime}
                                  </strong>
                                  {shift.roleName || shift.locationName ? (
                                    <span className="mt-1 block truncate text-[11px] text-[#526168]">
                                      {[shift.roleName, shift.locationName]
                                        .filter(Boolean)
                                        .join(" · ")}
                                    </span>
                                  ) : null}
                                  {shift.availabilityOverride ? (
                                    <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold text-[#8B6714]">
                                      <AlertTriangle
                                        className="h-3 w-3"
                                        aria-hidden="true"
                                      />
                                      Availability override
                                    </span>
                                  ) : null}
                                </button>
                              ))}
                            </div>

                            {data.canManageRoster ? (
                              <button
                                type="button"
                                onClick={() => openCreate(member.id, day)}
                                className="mt-2 flex min-h-9 w-full items-center justify-center rounded-lg border border-dashed border-[#CFC4B8] text-xs font-bold text-[#66747A] hover:bg-[#F7EFE5]"
                              >
                                <Plus
                                  className="mr-1 h-3.5 w-3.5"
                                  aria-hidden="true"
                                />
                                Shift
                              </button>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-3 md:hidden">
                {days.map((day) => {
                  const dayShifts =
                    data.shifts.filter((shift) => shift.date === day);
                  return (
                    <section
                      key={day}
                      className="rounded-2xl border border-[#E6DBCF] bg-white p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <h2 className="font-extrabold text-[#243139]">
                          {dayLabel(day)}
                        </h2>
                        {data.canManageRoster ? (
                          <CovieButton
                            tone="neutral"
                            onClick={() => openCreate(undefined, day)}
                          >
                            <Plus className="h-4 w-4" aria-hidden="true" />
                            Shift
                          </CovieButton>
                        ) : null}
                      </div>

                      {dayShifts.length === 0 ? (
                        <p className="mt-3 text-sm text-[#66747A]">
                          No shifts
                        </p>
                      ) : (
                        <div className="mt-3 space-y-2">
                          {dayShifts.map((shift) => (
                            <button
                              key={shift.id}
                              type="button"
                              disabled={!data.canManageRoster}
                              onClick={() => openEdit(shift)}
                              className="flex w-full items-start justify-between gap-3 rounded-xl border border-[#BFEDE6] bg-[#EAF8F5] p-3 text-left"
                            >
                              <span className="min-w-0">
                                <strong className="block truncate text-sm text-[#243139]">
                                  {shift.memberName}
                                </strong>
                                <span className="mt-1 block text-xs text-[#526168]">
                                  {shift.startTime}–{shift.endTime}
                                </span>
                                {shift.roleName || shift.locationName ? (
                                  <span className="mt-1 block truncate text-xs text-[#66747A]">
                                    {[shift.roleName, shift.locationName]
                                      .filter(Boolean)
                                      .join(" · ")}
                                  </span>
                                ) : null}
                              </span>
                              {shift.availabilityOverride ? (
                                <AlertTriangle
                                  className="h-4 w-4 shrink-0 text-[#8B6714]"
                                  aria-label="Availability overridden"
                                />
                              ) : null}
                            </button>
                          ))}
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>
            </>
          )}
        </>
      ) : null}

      {dialogOpen && data ? (
        <CovieDialog
          id="staff-shift-dialog-title"
          title={form.shiftId ? "Edit shift" : "Create shift"}
          description="Assign a person, date and time. Role and location are optional."
          icon={<CalendarDays aria-hidden="true" />}
          iconTone="teal"
          size="md"
          busy={busy}
          onClose={() => setDialogOpen(false)}
          footer={
            <>
              {form.shiftId ? (
                <CovieButton
                  tone="danger"
                  disabled={busy}
                  onClick={() => {
                    const shift = data.shifts.find(
                      (item) => item.id === form.shiftId,
                    );
                    if (shift) setDeleteTarget(shift);
                  }}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  Delete
                </CovieButton>
              ) : null}
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
                  !form.memberId ||
                  !form.date ||
                  !form.startTime ||
                  !form.endTime
                }
                onClick={() => void saveShift(false)}
              >
                {busy ? "Saving…" : "Save shift"}
              </CovieButton>
            </>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2">
              <span className="mb-1.5 block text-sm font-bold">
                Team member
              </span>
              <CovieSelect
                value={form.memberId}
                disabled={busy}
                onChange={(event) => updateMember(event.target.value)}
              >
                <option value="">Choose person</option>
                {data.members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.displayName}
                  </option>
                ))}
              </CovieSelect>
            </label>

            <label>
              <span className="mb-1.5 block text-sm font-bold">Date</span>
              <CovieInput
                type="date"
                value={form.date}
                disabled={busy}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    date: event.target.value,
                  }))
                }
              />
            </label>

            <div className="grid grid-cols-2 gap-2">
              <label>
                <span className="mb-1.5 block text-sm font-bold">Starts</span>
                <CovieInput
                  type="time"
                  value={form.startTime}
                  disabled={busy}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      startTime: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                <span className="mb-1.5 block text-sm font-bold">Ends</span>
                <CovieInput
                  type="time"
                  value={form.endTime}
                  disabled={busy}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      endTime: event.target.value,
                    }))
                  }
                />
              </label>
            </div>

            <label>
              <span className="mb-1.5 block text-sm font-bold">Role</span>
              <CovieSelect
                value={form.roleId}
                disabled={busy}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    roleId: event.target.value,
                  }))
                }
              >
                <option value="">No role</option>
                {data.roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </CovieSelect>
            </label>

            <label>
              <span className="mb-1.5 block text-sm font-bold">
                Location
              </span>
              <CovieSelect
                value={form.locationId}
                disabled={busy}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    locationId: event.target.value,
                  }))
                }
              >
                <option value="">No location</option>
                {data.locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </CovieSelect>
            </label>

            <label className="sm:col-span-2">
              <span className="mb-1.5 block text-sm font-bold">Note</span>
              <CovieTextarea
                rows={3}
                maxLength={500}
                value={form.note}
                disabled={busy}
                placeholder="Optional"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    note: event.target.value,
                  }))
                }
              />
            </label>
          </div>

          {conflictMessage ? (
            <CovieNotice tone="sunshine" className="mt-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span>{conflictMessage}</span>
                <CovieButton
                  tone="neutral"
                  disabled={busy}
                  onClick={() => void saveShift(true)}
                >
                  Create anyway
                </CovieButton>
              </div>
            </CovieNotice>
          ) : null}
        </CovieDialog>
      ) : null}

      <CovieConfirmDialog
        open={Boolean(deleteTarget)}
        id="delete-staff-shift-title"
        title="Delete shift?"
        description={
          deleteTarget
            ? deleteTarget.memberName +
              " · " +
              dayLabel(deleteTarget.date) +
              " · " +
              deleteTarget.startTime +
              "–" +
              deleteTarget.endTime
            : ""
        }
        confirmLabel="Delete shift"
        busy={busy}
        icon={<Clock3 aria-hidden="true" />}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void deleteShift()}
      />
    </>
  );
}
