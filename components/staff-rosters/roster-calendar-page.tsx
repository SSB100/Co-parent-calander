"use client";

import {
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Copy,
  GripVertical,
  LoaderCircle,
  Plus,
  Trash2,
  UserRound,
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
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  CovieButton,
  CovieConfirmDialog,
  CovieDialog,
  CovieEmptyState,
  CovieInput,
  CovieNotice,
  CovieSegmentedControl,
  CovieSelect,
  CovieStatusBadge,
  CovieTextarea,
} from "@/components/ui/covie";

type StaffAccessRole = "owner" | "manager" | "staff";
type RosterView = "week" | "month";

type Member = {
  id: string;
  displayName: string;
  accessRole: StaffAccessRole;
  roleIds: string[];
  roleNames: string[];
  defaultRoleId: string | null;
  defaultLocationId: string | null;
};

type Option = { id: string; name: string };

type RosterLeave = {
  id: string;
  memberId: string;
  memberName: string;
  startDate: string;
  endDate: string;
  allDay: boolean;
  startTime: string | null;
  endTime: string | null;
  status: "pending" | "approved";
};

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
    operationalStartMinute: number;
    operationalEndMinute: number;
  };
  publication: {
    status: "draft" | "published" | "changes_pending";
    revision: number;
    publishedAt: string | null;
    lastSentAt: string | null;
    affectedMemberCount: number;
    changedShiftCount: number;
  };
  members: Member[];
  roles: Option[];
  locations: Option[];
  leave: RosterLeave[];
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

type PositionedShift = {
  shift: Shift;
  lane: number;
  laneCount: number;
};

const SNAP_MINUTES = 15;
const DROP_SHIFT_MINUTES = 60;
const DAY_START_MINUTE = 0;
const DAY_END_MINUTE = 24 * 60;
const MIN_HOUR_HEIGHT = 18;
const DAY_HEADER_HEIGHT = 54;
const DND_TYPE = "application/x-covie-roster";

function todayValue() {
  return format(new Date(), "yyyy-MM-dd");
}

function currentWeekStart() {
  return format(
    startOfWeek(new Date(), { weekStartsOn: 1 }),
    "yyyy-MM-dd",
  );
}

function weekStartFor(date: string) {
  return format(
    startOfWeek(parseISO(date), { weekStartsOn: 1 }),
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

function monthLabel(date: string) {
  return new Intl.DateTimeFormat("en-NZ", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(date + "T00:00:00Z"));
}

function minutesFromTime(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function timeFromMinutes(value: number) {
  const safe = Math.max(0, Math.min(23 * 60 + 45, value));
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  return String(hours).padStart(2, "0") + ":" + String(minutes).padStart(2, "0");
}

function compactTime(value: string) {
  const [hoursValue, minutesValue] = value.split(":").map(Number);
  const suffix = hoursValue >= 12 ? "pm" : "am";
  const hour = hoursValue % 12 || 12;
  return minutesValue
    ? hour + ":" + String(minutesValue).padStart(2, "0") + suffix
    : hour + suffix;
}

function compactMinuteLabel(value: number) {
  if (value >= DAY_END_MINUTE) return "12am";
  return compactTime(timeFromMinutes(value));
}

const operationalHourOptions = Array.from(
  { length: DAY_END_MINUTE / 30 + 1 },
  (_, index) => index * 30,
);

function snapMinutes(value: number) {
  return Math.round(value / SNAP_MINUTES) * SNAP_MINUTES;
}

function shiftDuration(shift: Pick<Shift, "startTime" | "endTime">) {
  return Math.max(0, minutesFromTime(shift.endTime) - minutesFromTime(shift.startTime));
}

function leaveAppliesToDay(leave: RosterLeave, day: string) {
  return leave.startDate <= day && leave.endDate >= day;
}

function leaveTimeLabel(leave: RosterLeave) {
  if (leave.allDay || !leave.startTime || !leave.endTime) return "All day";
  return compactTime(leave.startTime) + "–" + compactTime(leave.endTime);
}

function hoursText(minutes: number) {
  const hours = minutes / 60;
  return Number.isInteger(hours) ? hours + "h" : hours.toFixed(1) + "h";
}

function visibleMonthRange(anchorDate: string) {
  const start = startOfWeek(startOfMonth(parseISO(anchorDate)), {
    weekStartsOn: 1,
  });
  const end = endOfWeek(endOfMonth(parseISO(anchorDate)), {
    weekStartsOn: 1,
  });
  return { start, end };
}

function weeksForMonth(anchorDate: string) {
  const { start, end } = visibleMonthRange(anchorDate);
  const weeks: string[] = [];
  let cursor = start;
  while (cursor <= end) {
    weeks.push(format(cursor, "yyyy-MM-dd"));
    cursor = addDays(cursor, 7);
  }
  return weeks;
}

function layoutOverlappingShifts(shifts: Shift[]): PositionedShift[] {
  const sorted = [...shifts].sort(
    (a, b) => minutesFromTime(a.startTime) - minutesFromTime(b.startTime),
  );
  const positioned: PositionedShift[] = [];
  let cluster: Shift[] = [];
  let clusterEnd = -1;

  function flushCluster() {
    if (cluster.length === 0) return;

    const laneEnds: number[] = [];
    const temporary: Array<{ shift: Shift; lane: number }> = [];

    for (const shift of cluster) {
      const start = minutesFromTime(shift.startTime);
      const end = minutesFromTime(shift.endTime);
      let lane = laneEnds.findIndex((laneEnd) => laneEnd <= start);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(end);
      } else {
        laneEnds[lane] = end;
      }
      temporary.push({ shift, lane });
    }

    const laneCount = Math.max(1, laneEnds.length);
    positioned.push(
      ...temporary.map((item) => ({ ...item, laneCount })),
    );
    cluster = [];
    clusterEnd = -1;
  }

  for (const shift of sorted) {
    const start = minutesFromTime(shift.startTime);
    const end = minutesFromTime(shift.endTime);
    if (cluster.length > 0 && start >= clusterEnd) flushCluster();
    cluster.push(shift);
    clusterEnd = Math.max(clusterEnd, end);
  }
  flushCluster();

  return positioned;
}

async function readRosterWeek(weekStart: string) {
  const response = await fetch(
    "/api/staff-roster/shifts?weekStart=" + encodeURIComponent(weekStart),
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

  return body;
}

export function StaffRosterCalendarPage({ header }: { header?: ReactNode }) {
  const [anchorDate, setAnchorDate] = useState(todayValue);
  const [mobileDay, setMobileDay] = useState(todayValue);
  const [view, setView] = useState<RosterView>("week");
  const [staffFilter, setStaffFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [data, setData] = useState<RosterPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);
  const [copyNotice, setCopyNotice] = useState<{
    tone: "teal" | "sunshine";
    text: string;
  } | null>(null);
  const [publicationNotice, setPublicationNotice] = useState<string | null>(null);
  const [sendUpdatesConfirmOpen, setSendUpdatesConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Shift | null>(null);
  const [resizePreview, setResizePreview] = useState<{
    shiftId: string;
    startTime: string;
    endTime: string;
  } | null>(null);
  const [operationalHoursOpen, setOperationalHoursOpen] = useState(false);
  const [operationalStartDraft, setOperationalStartDraft] = useState(0);
  const [operationalEndDraft, setOperationalEndDraft] = useState(DAY_END_MINUTE);
  const [draggingPayload, setDraggingPayload] = useState<
    | { kind: "member"; memberId: string }
    | { kind: "shift"; shiftId: string }
    | null
  >(null);
  const [dropPreview, setDropPreview] = useState<{
    date: string;
    minute: number;
  } | null>(null);
  const [weekBoardHeight, setWeekBoardHeight] = useState(540);
  const weekBoardRef = useRef<HTMLDivElement>(null);
  const draggingPayloadRef = useRef<
    | { kind: "member"; memberId: string }
    | { kind: "shift"; shiftId: string }
    | null
  >(null);
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

  const weekStart = useMemo(() => weekStartFor(anchorDate), [anchorDate]);
  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) =>
        format(addDays(parseISO(weekStart), index), "yyyy-MM-dd"),
      ),
    [weekStart],
  );

  const refresh = useCallback(async (date: string, nextView: RosterView) => {
    if (nextView === "week") {
      const payload = await readRosterWeek(weekStartFor(date));
      setData(payload);
      setError(null);
      return;
    }

    const weekStarts = weeksForMonth(date);
    const payloads = await Promise.all(weekStarts.map(readRosterWeek));
    const first = payloads[0];
    const last = payloads[payloads.length - 1];
    const anchorPayload =
      payloads.find((payload) => payload.weekStart === weekStartFor(date)) ??
      first;
    if (!first || !last || !anchorPayload) {
      throw new Error("The roster month could not be loaded.");
    }

    const shifts = new Map<string, Shift>();
    const leave = new Map<string, RosterLeave>();
    for (const payload of payloads) {
      for (const shift of payload.shifts) shifts.set(shift.id, shift);
      for (const request of payload.leave) leave.set(request.id, request);
    }

    setData({
      ...anchorPayload,
      weekStart: first.weekStart,
      weekEnd: last.weekEnd,
      leave: [...leave.values()].sort((a, b) =>
        (a.startDate + a.memberName).localeCompare(
          b.startDate + b.memberName,
        ),
      ),
      shifts: [...shifts.values()].sort((a, b) =>
        (a.date + a.startTime).localeCompare(b.date + b.startTime),
      ),
    });
    setError(null);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh(anchorDate, view).catch((caught) =>
        setError(
          caught instanceof Error
            ? caught.message
            : "The roster could not be loaded.",
        ),
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [anchorDate, refresh, view]);

  useEffect(() => {
    if (!data?.setup) return;
    setOperationalStartDraft(data.setup.operationalStartMinute);
    setOperationalEndDraft(data.setup.operationalEndMinute);
  }, [
    data?.setup?.operationalEndMinute,
    data?.setup?.operationalStartMinute,
  ]);

  useEffect(() => {
    if (view !== "week" || !data) return;

    let frame = 0;
    const measure = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const board = weekBoardRef.current;
        if (!board) return;
        const top = board.getBoundingClientRect().top;
        const available = Math.floor(window.innerHeight - top - 18);
        setWeekBoardHeight(Math.max(430, available));
      });
    };

    measure();
    window.addEventListener("resize", measure);
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    if (observer && weekBoardRef.current) {
      observer.observe(weekBoardRef.current.parentElement ?? weekBoardRef.current);
    }

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
      observer?.disconnect();
    };
  }, [data, view]);

  const roleById = useMemo(
    () => new Map(data?.roles.map((role) => [role.id, role.name]) ?? []),
    [data?.roles],
  );
  const locationById = useMemo(
    () =>
      new Map(
        data?.locations.map((location) => [location.id, location.name]) ?? [],
      ),
    [data?.locations],
  );

  const filteredShifts = useMemo(
    () =>
      data?.shifts.filter(
        (shift) =>
          (!staffFilter || shift.memberId === staffFilter) &&
          (!roleFilter || shift.roleId === roleFilter) &&
          (!locationFilter || shift.locationId === locationFilter),
      ) ?? [],
    [data?.shifts, locationFilter, roleFilter, staffFilter],
  );

  const filteredLeave = useMemo(
    () =>
      data?.leave.filter(
        (leave) => !staffFilter || leave.memberId === staffFilter,
      ) ?? [],
    [data?.leave, staffFilter],
  );

  const filteredMembers = useMemo(
    () =>
      data?.members.filter(
        (member) =>
          (!staffFilter || member.id === staffFilter) &&
          (!roleFilter || member.roleIds.includes(roleFilter)) &&
          (!locationFilter ||
            member.defaultLocationId === locationFilter),
      ) ?? [],
    [data?.members, locationFilter, roleFilter, staffFilter],
  );

  const weekShifts = useMemo(
    () =>
      filteredShifts.filter(
        (shift) => shift.date >= weekStart && shift.date <= days[6],
      ),
    [filteredShifts, days, weekStart],
  );

  const weeklyMinutesByMember = useMemo(() => {
    const totals = new Map<string, number>();
    for (const shift of weekShifts) {
      totals.set(
        shift.memberId,
        (totals.get(shift.memberId) ?? 0) + shiftDuration(shift),
      );
    }
    return totals;
  }, [weekShifts]);

  const totalWeekMinutes = useMemo(
    () => weekShifts.reduce((sum, shift) => sum + shiftDuration(shift), 0),
    [weekShifts],
  );

  function shiftWithPreview(shift: Shift) {
    if (!resizePreview || resizePreview.shiftId !== shift.id) return shift;
    return {
      ...shift,
      startTime: resizePreview.startTime,
      endTime: resizePreview.endTime,
    };
  }

  function openCreate(
    memberId?: string,
    date?: string,
    startTime = "09:00",
    endTime = "17:00",
  ) {
    const member =
      data?.members.find((item) => item.id === memberId) ??
      data?.members[0] ??
      null;

    setConflictMessage(null);
    setForm({
      shiftId: null,
      memberId: member?.id ?? "",
      date: date ?? mobileDay ?? days[0] ?? weekStart,
      startTime,
      endTime,
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

  async function createShiftFromDrop(
    memberId: string,
    date: string,
    startTime: string,
    endTime: string,
  ) {
    if (busy || !data?.canManageRoster) return;

    const member = data.members.find((item) => item.id === memberId);
    if (!member) return;

    setBusy(true);
    setError(null);
    setConflictMessage(null);

    try {
      const response = await fetch("/api/staff-roster/shifts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          memberId,
          date,
          startTime,
          endTime,
          roleId: member.defaultRoleId ?? "",
          locationId: member.defaultLocationId ?? "",
          note: "",
          overrideAvailabilityConflict: false,
        }),
      });

      const body = (await response.json().catch(() => null)) as
        | { error?: string; code?: string | null }
        | null;

      if (!response.ok) {
        if (
          body?.code === "availability_conflict" ||
          body?.code === "pending_leave_conflict"
        ) {
          setForm({
            shiftId: null,
            memberId,
            date,
            startTime,
            endTime,
            roleId: member.defaultRoleId ?? "",
            locationId: member.defaultLocationId ?? "",
            note: "",
          });
          setConflictMessage(
            body.error ??
              "This person is marked unavailable during the selected time.",
          );
          setDialogOpen(true);
          return;
        }

        throw new Error(body?.error ?? "The shift could not be created.");
      }

      await refresh(anchorDate, view);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The shift could not be created.",
      );
    } finally {
      setBusy(false);
    }
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
        if (
          body?.code === "availability_conflict" ||
          body?.code === "pending_leave_conflict"
        ) {
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
      await refresh(anchorDate, view);
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

  async function moveShift(
    shift: Shift,
    date: string,
    startTime: string,
    endTime: string,
  ) {
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/staff-roster/shifts", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          shiftId: shift.id,
          memberId: shift.memberId,
          date,
          startTime,
          endTime,
          roleId: shift.roleId ?? "",
          locationId: shift.locationId ?? "",
          note: shift.note ?? "",
          overrideAvailabilityConflict: false,
        }),
      });

      const body = (await response.json().catch(() => null)) as
        | { error?: string; code?: string | null }
        | null;

      if (!response.ok) {
        if (
          body?.code === "availability_conflict" ||
          body?.code === "pending_leave_conflict"
        ) {
          setForm({
            shiftId: shift.id,
            memberId: shift.memberId,
            date,
            startTime,
            endTime,
            roleId: shift.roleId ?? "",
            locationId: shift.locationId ?? "",
            note: shift.note ?? "",
          });
          setConflictMessage(
            body.error ??
              "This person is marked unavailable during the selected time.",
          );
          setDialogOpen(true);
          return;
        }
        throw new Error(body?.error ?? "The shift could not be moved.");
      }

      await refresh(anchorDate, view);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The shift could not be moved.",
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
      await refresh(anchorDate, view);
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

  async function publishCurrentWeek() {
    if (busy || !data?.canManageRoster) return;

    setSendUpdatesConfirmOpen(false);
    setBusy(true);
    setError(null);
    setPublicationNotice(null);

    const isInitialPublish = data.publication.status === "draft";

    try {
      const response = await fetch("/api/staff-roster/publication", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ weekStart }),
      });
      const body = (await response.json().catch(() => null)) as
        | { action?: "publish" | "send_updates"; revision?: number; error?: string }
        | null;

      if (!response.ok) {
        throw new Error(
          body?.error ??
            (isInitialPublish
              ? "The roster could not be published."
              : "The roster updates could not be sent."),
        );
      }

      setPublicationNotice(
        isInitialPublish
          ? "Roster published. Staff can now see this week."
          : "Roster updates published for affected staff.",
      );
      await refresh(anchorDate, view);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : isInitialPublish
            ? "The roster could not be published."
            : "The roster updates could not be sent.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function copyPreviousWeek() {
    if (busy || !data?.canManageRoster) return;

    setBusy(true);
    setError(null);
    setCopyNotice(null);

    try {
      const response = await fetch("/api/staff-roster/copy-week", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ weekStart }),
      });
      const body = (await response.json().catch(() => null)) as
        | {
            copied?: number;
            skipped?: number;
            overlapSkipped?: number;
            availabilitySkipped?: number;
            leaveSkipped?: number;
            inactiveStaffSkipped?: number;
            staleReferenceAdjusted?: number;
            error?: string;
          }
        | null;

      if (!response.ok) {
        throw new Error(body?.error ?? "The previous week could not be copied.");
      }

      const copied = body?.copied ?? 0;
      const skipped = body?.skipped ?? 0;
      const availabilitySkipped = body?.availabilitySkipped ?? 0;
      const overlapSkipped = body?.overlapSkipped ?? 0;
      const leaveSkipped = body?.leaveSkipped ?? 0;
      const inactiveStaffSkipped = body?.inactiveStaffSkipped ?? 0;
      const staleReferenceAdjusted = body?.staleReferenceAdjusted ?? 0;

      if (copied === 0 && skipped === 0) {
        setCopyNotice({
          tone: "sunshine",
          text: "There were no shifts in the previous week to copy.",
        });
      } else if (skipped > 0) {
        const reasons = [
          availabilitySkipped > 0
            ? availabilitySkipped + " unavailable"
            : null,
          overlapSkipped > 0 ? overlapSkipped + " overlapping" : null,
          leaveSkipped > 0 ? leaveSkipped + " leave conflicts" : null,
          inactiveStaffSkipped > 0
            ? inactiveStaffSkipped + " inactive staff"
            : null,
        ]
          .filter(Boolean)
          .join(" · ");

        setCopyNotice({
          tone: "sunshine",
          text:
            "Copied " +
            copied +
            " shift" +
            (copied === 1 ? "" : "s") +
            ". Skipped " +
            skipped +
            (reasons ? " (" + reasons + ")." : ".") +
            (staleReferenceAdjusted > 0
              ? " Removed outdated role/location details from " +
                staleReferenceAdjusted +
                " copied shift" +
                (staleReferenceAdjusted === 1 ? "." : "s.")
              : ""),
        });
      } else {
        setCopyNotice({
          tone: staleReferenceAdjusted > 0 ? "sunshine" : "teal",
          text:
            "Copied " +
            copied +
            " shift" +
            (copied === 1 ? "" : "s") +
            " from the previous week." +
            (staleReferenceAdjusted > 0
              ? " Removed outdated role/location details from " +
                staleReferenceAdjusted +
                " copied shift" +
                (staleReferenceAdjusted === 1 ? "." : "s.")
              : ""),
        });
      }

      await refresh(anchorDate, view);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The previous week could not be copied.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveOperationalHours() {
    if (
      busy ||
      !data?.canManageRoster ||
      operationalEndDraft <= operationalStartDraft
    ) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/staff-roster/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          startMinute: operationalStartDraft,
          endMinute: operationalEndDraft,
        }),
      });
      const body = (await response.json().catch(() => null)) as
        | {
            error?: string;
            operationalStartMinute?: number;
            operationalEndMinute?: number;
          }
        | null;

      if (!response.ok) {
        throw new Error(
          body?.error ?? "Operational hours could not be saved.",
        );
      }

      setOperationalHoursOpen(false);
      await refresh(anchorDate, view);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Operational hours could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  function setDragPayload(
    event: DragEvent<HTMLElement>,
    payload: { kind: "member"; memberId: string } | { kind: "shift"; shiftId: string },
  ) {
    const serialized = JSON.stringify(payload);
    event.dataTransfer.effectAllowed =
      payload.kind === "member" ? "copy" : "move";
    event.dataTransfer.setData(DND_TYPE, serialized);
    event.dataTransfer.setData("text/plain", serialized);
    draggingPayloadRef.current = payload;
    setDraggingPayload(payload);
  }

  function clearDragState() {
    draggingPayloadRef.current = null;
    setDraggingPayload(null);
    setDropPreview(null);
  }

  function minuteAtTimelinePointer(
    event: DragEvent<HTMLDivElement>,
  ) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const minutesPerPixel = 60 / hourHeight;
    const rawMinutes =
      visibleStartMinute +
      (event.clientY - bounds.top) * minutesPerPixel;

    return Math.max(
      visibleStartMinute,
      Math.min(
        visibleEndMinute - SNAP_MINUTES,
        snapMinutes(rawMinutes),
      ),
    );
  }

  function handleTimelineDragOver(
    event: DragEvent<HTMLDivElement>,
    date: string,
  ) {
    const activeDrag = draggingPayloadRef.current ?? draggingPayload;
    if (!data?.canManageRoster || busy || !activeDrag) return;

    event.preventDefault();
    event.dataTransfer.dropEffect =
      activeDrag.kind === "member" ? "copy" : "move";

    const minute = minuteAtTimelinePointer(event);
    setDropPreview((current) =>
      current?.date === date && current.minute === minute
        ? current
        : { date, minute },
    );
  }

  function handleTimelineDrop(event: DragEvent<HTMLDivElement>, date: string) {
    event.preventDefault();
    if (!data?.canManageRoster || busy) {
      clearDragState();
      return;
    }

    const raw =
      event.dataTransfer.getData(DND_TYPE) ||
      event.dataTransfer.getData("text/plain");

    let payload = draggingPayloadRef.current ?? draggingPayload;
    if (raw) {
      try {
        payload = JSON.parse(raw) as
          | { kind: "member"; memberId: string }
          | { kind: "shift"; shiftId: string };
      } catch {
        // Use the in-memory drag payload as a browser-safe fallback.
      }
    }

    if (!payload) {
      clearDragState();
      return;
    }

    const startMinute = minuteAtTimelinePointer(event);
    clearDragState();

    if (payload.kind === "member") {
      const latestEnd = Math.min(
        visibleEndMinute,
        23 * 60 + 45,
      );
      const endMinute = Math.min(
        latestEnd,
        startMinute + DROP_SHIFT_MINUTES,
      );

      if (endMinute <= startMinute) return;

      void createShiftFromDrop(
        payload.memberId,
        date,
        timeFromMinutes(startMinute),
        timeFromMinutes(endMinute),
      );
      return;
    }

    const shift = data.shifts.find((item) => item.id === payload.shiftId);
    if (!shift) return;

    const duration = shiftDuration(shift);
    const latestEnd = Math.min(
      visibleEndMinute,
      23 * 60 + 45,
    );
    const latestStart = Math.max(
      visibleStartMinute,
      latestEnd - duration,
    );
    const adjustedStart = Math.min(startMinute, latestStart);

    void moveShift(
      shift,
      date,
      timeFromMinutes(adjustedStart),
      timeFromMinutes(adjustedStart + duration),
    );
  }

  function beginResize(
    event: ReactPointerEvent<HTMLSpanElement>,
    shift: Shift,
    edge: "start" | "end",
  ) {
    if (!data?.canManageRoster || busy) return;
    event.preventDefault();
    event.stopPropagation();

    const originY = event.clientY;
    const originStart = minutesFromTime(shift.startTime);
    const originEnd = minutesFromTime(shift.endTime);
    let finalStart = originStart;
    let finalEnd = originEnd;
    const target = event.currentTarget;
    const pointerId = event.pointerId;
    target.setPointerCapture(pointerId);

    const onMove = (moveEvent: PointerEvent) => {
      const deltaMinutes = snapMinutes(
        (moveEvent.clientY - originY) * (60 / hourHeight),
      );

      if (edge === "start") {
        finalStart = Math.max(
          visibleStartMinute,
          Math.min(originEnd - SNAP_MINUTES, originStart + deltaMinutes),
        );
        finalEnd = originEnd;
      } else {
        finalStart = originStart;
        finalEnd = Math.min(
          Math.min(visibleEndMinute, 23 * 60 + 45),
          Math.max(originStart + SNAP_MINUTES, originEnd + deltaMinutes),
        );
      }

      setResizePreview({
        shiftId: shift.id,
        startTime: timeFromMinutes(finalStart),
        endTime: timeFromMinutes(finalEnd),
      });
    };

    const finish = () => {
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", finish);
      target.removeEventListener("pointercancel", cancel);
      if (target.hasPointerCapture(pointerId)) {
        target.releasePointerCapture(pointerId);
      }
      setResizePreview(null);
      if (finalStart !== originStart || finalEnd !== originEnd) {
        void moveShift(
          shift,
          shift.date,
          timeFromMinutes(finalStart),
          timeFromMinutes(finalEnd),
        );
      }
    };

    const cancel = () => {
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", finish);
      target.removeEventListener("pointercancel", cancel);
      if (target.hasPointerCapture(pointerId)) {
        target.releasePointerCapture(pointerId);
      }
      setResizePreview(null);
    };

    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", finish);
    target.addEventListener("pointercancel", cancel);
  }

  function goRelative(direction: -1 | 1) {
    const current = parseISO(anchorDate);
    const next =
      view === "week"
        ? direction === -1
          ? subDays(current, 7)
          : addDays(current, 7)
        : direction === -1
          ? subMonths(current, 1)
          : addMonths(current, 1);
    const value = format(next, "yyyy-MM-dd");
    setAnchorDate(value);
    setMobileDay(value);
  }

  function goToday() {
    const value = todayValue();
    setAnchorDate(value);
    setMobileDay(value);
  }

  const selectedMobileDay = days.includes(mobileDay)
    ? mobileDay
    : (days[0] ?? weekStart);
  const selectedMobileShifts = filteredShifts.filter(
    (shift) => shift.date === selectedMobileDay,
  );
  const selectedMobileLeave = filteredLeave.filter((leave) =>
    leaveAppliesToDay(leave, selectedMobileDay),
  );
  const visibleStartMinute =
    data?.setup?.operationalStartMinute ?? DAY_START_MINUTE;
  const visibleEndMinute =
    data?.setup?.operationalEndMinute ?? DAY_END_MINUTE;
  const visibleDurationHours =
    (visibleEndMinute - visibleStartMinute) / 60;
  const availableTimelineHeight = Math.max(
    1,
    weekBoardHeight - DAY_HEADER_HEIGHT,
  );
  const hourHeight = Math.max(
    MIN_HOUR_HEIGHT,
    availableTimelineHeight / visibleDurationHours,
  );
  const timelineHeight = visibleDurationHours * hourHeight;
  const firstHour = Math.floor(visibleStartMinute / 60);
  const lastHour = Math.ceil(visibleEndMinute / 60);
  const hourMarks = Array.from(
    { length: lastHour - firstHour + 1 },
    (_, index) => firstHour + index,
  ).filter(
    (hour) =>
      hour * 60 >= visibleStartMinute &&
      hour * 60 <= visibleEndMinute,
  );
  const operationalHoursLabel =
    visibleStartMinute === DAY_START_MINUTE &&
    visibleEndMinute === DAY_END_MINUTE
      ? "24 hours"
      : compactMinuteLabel(visibleStartMinute) +
        "–" +
        compactMinuteLabel(visibleEndMinute);

  return (
    <>
      {header ? (
        <div className="mb-2 flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0 shrink-0">{header}</div>
          {data?.canManageRoster ? (
            <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:ml-4 xl:max-w-[760px]">
              <CovieSelect
                aria-label="Filter roster by staff"
                value={staffFilter}
                onChange={(event) => setStaffFilter(event.target.value)}
              >
                <option value="">All staff</option>
                {data.members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.displayName}
                  </option>
                ))}
              </CovieSelect>
              <CovieSelect
                aria-label="Filter roster by role"
                value={roleFilter}
                onChange={(event) => setRoleFilter(event.target.value)}
              >
                <option value="">All roles</option>
                {data.roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </CovieSelect>
              <CovieSelect
                aria-label="Filter roster by location"
                value={locationFilter}
                onChange={(event) => setLocationFilter(event.target.value)}
              >
                <option value="">All locations</option>
                {data.locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </CovieSelect>
              <CovieButton
                tone="neutral"
                disabled={busy}
                onClick={() => setOperationalHoursOpen(true)}
                className="justify-center whitespace-nowrap"
              >
                <Clock3 className="h-4 w-4" aria-hidden="true" />
                Hours: {operationalHoursLabel}
              </CovieButton>
            </div>
          ) : null}
        </div>
      ) : null}

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
          <div className="mb-3 rounded-2xl border border-[#E6DBCF] bg-white p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CovieSegmentedControl
                value={view}
                options={[
                  { value: "week", label: "Week" },
                  { value: "month", label: "Month" },
                ]}
                onChange={setView}
                tone="teal"
                ariaLabel="Roster view"
                className="shrink-0"
              />

              <div className="flex items-center gap-2">
                <CovieButton
                  tone="neutral"
                  aria-label={view === "week" ? "Previous week" : "Previous month"}
                  onClick={() => goRelative(-1)}
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </CovieButton>
                <CovieButton tone="neutral" onClick={goToday}>
                  Today
                </CovieButton>
                <CovieButton
                  tone="neutral"
                  aria-label={view === "week" ? "Next week" : "Next month"}
                  onClick={() => goRelative(1)}
                >
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </CovieButton>
              </div>

              <strong className="covie-display order-first w-full text-center text-xl font-semibold text-[#243139] sm:order-none sm:w-auto">
                {view === "week"
                  ? weekLabel(weekStart, days[6])
                  : monthLabel(anchorDate)}
              </strong>

              {data.canManageRoster ? (
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {view === "week" ? (
                    <>
                      <CovieButton
                        tone="neutral"
                        disabled={busy}
                        onClick={() => void copyPreviousWeek()}
                      >
                        <Copy className="h-4 w-4" aria-hidden="true" />
                        Copy previous week
                      </CovieButton>
                      {data.publication.status !== "published" ? (
                        <CovieButton
                          disabled={busy}
                          onClick={() =>
                            data.publication.status === "changes_pending"
                              ? setSendUpdatesConfirmOpen(true)
                              : void publishCurrentWeek()
                          }
                        >
                          {data.publication.status === "draft"
                            ? "Publish roster"
                            : "Send updates"}
                        </CovieButton>
                      ) : null}
                    </>
                  ) : null}
                  <CovieButton
                    tone="neutral"
                    disabled={busy}
                    onClick={() => openCreate()}
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Create shift
                  </CovieButton>
                </div>
              ) : null}
            </div>

            {view === "week" ? (
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[#EFE5DA] pt-2 text-xs font-bold text-[#66747A]">
                <CovieStatusBadge
                  tone={
                    data.publication.status === "published"
                      ? "teal"
                      : data.publication.status === "changes_pending"
                        ? "sunshine"
                        : "neutral"
                  }
                >
                  {data.publication.status === "published"
                    ? "Published"
                    : data.publication.status === "changes_pending"
                      ? "Changes pending"
                      : "Draft"}
                </CovieStatusBadge>
                <span>{data.members.length} team</span>
                <span>{weekShifts.length} shifts</span>
                <span>{hoursText(totalWeekMinutes)} rostered</span>
                {data.publication.status === "changes_pending" ? (
                  <span>
                    {data.publication.affectedMemberCount} affected staff
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>

          {copyNotice ? (
            <CovieNotice tone={copyNotice.tone} className="mb-4">
              {copyNotice.text}
            </CovieNotice>
          ) : null}

          {publicationNotice ? (
            <CovieNotice tone="teal" className="mb-4">
              {publicationNotice}
            </CovieNotice>
          ) : null}

          {data.members.length === 0 ? (
            <CovieEmptyState
              icon={
                <UserRound
                  className="h-8 w-8 text-[#19A897]"
                  aria-hidden="true"
                />
              }
              title="Add your first staff member to start rostering"
              description="Once someone is on the team, they can be dragged straight onto the weekly calendar."
              action={
                data.canManageRoster ? (
                  <Link
                    href="/calendar-types/staff-rosters/organiser/team"
                    className="inline-flex min-h-11 items-center rounded-[10px] bg-[#FF6B5F] px-4 text-sm font-extrabold text-[#243139]"
                  >
                    Add staff member
                  </Link>
                ) : undefined
              }
            />
          ) : view === "month" ? (
            <div className="overflow-hidden rounded-2xl border border-[#E6DBCF] bg-white">
              <div className="grid grid-cols-7 border-b border-[#E6DBCF] bg-[#FFF9F2]">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label) => (
                  <div
                    key={label}
                    className="border-r border-[#E6DBCF] px-2 py-2 text-center text-xs font-extrabold uppercase tracking-[0.06em] text-[#66747A] last:border-r-0"
                  >
                    {label}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {(() => {
                  const { start, end } = visibleMonthRange(anchorDate);
                  const month = parseISO(anchorDate).getMonth();
                  const values: string[] = [];
                  let cursor = start;
                  while (cursor <= end) {
                    values.push(format(cursor, "yyyy-MM-dd"));
                    cursor = addDays(cursor, 1);
                  }

                  return values.map((day) => {
                    const dayShifts = filteredShifts.filter((shift) => shift.date === day);
                    const dayLeave = filteredLeave.filter((leave) =>
                      leaveAppliesToDay(leave, day),
                    );
                    const outsideMonth = parseISO(day).getMonth() !== month;
                    return (
                      <div
                        key={day}
                        className={
                          "min-h-28 border-b border-r border-[#E6DBCF] p-2 last:border-r-0 sm:min-h-36 " +
                          (outsideMonth ? "bg-[#FCF8F3]" : "bg-white")
                        }
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setAnchorDate(day);
                            setMobileDay(day);
                            setView("week");
                          }}
                          className={
                            "flex h-8 w-8 items-center justify-center rounded-full text-sm font-extrabold " +
                            (day === todayValue()
                              ? "bg-[#FF6B5F] text-[#243139]"
                              : outsideMonth
                                ? "text-[#A59B91]"
                                : "text-[#243139]")
                          }
                          aria-label={"Open week containing " + dayLabel(day)}
                        >
                          {format(parseISO(day), "d")}
                        </button>
                        <div className="mt-1 space-y-1">
                          {dayLeave.slice(0, 1).map((leave) => (
                            <span
                              key={"leave-" + leave.id}
                              className={
                                "block w-full truncate rounded-md px-1.5 py-1 text-left text-[10px] font-extrabold sm:text-xs " +
                                (leave.status === "approved"
                                  ? "bg-[#EAF8F5] text-[#0D7A6D]"
                                  : "bg-[#FFF2B8] text-[#8B6714]")
                              }
                            >
                              {leave.memberName} · {leave.status === "approved" ? "Leave" : "Pending"}
                            </span>
                          ))}
                          {dayShifts.slice(0, dayLeave.length > 0 ? 2 : 3).map((shift) => (
                            <button
                              key={shift.id}
                              type="button"
                              onClick={() =>
                                data.canManageRoster
                                  ? openEdit(shift)
                                  : undefined
                              }
                              className="block w-full truncate rounded-md bg-[#EAF8F5] px-1.5 py-1 text-left text-[10px] font-bold text-[#243139] sm:text-xs"
                            >
                              {shift.memberName} {compactTime(shift.startTime)}–{compactTime(shift.endTime)}
                            </button>
                          ))}
                          {dayShifts.length > 3 ? (
                            <button
                              type="button"
                              onClick={() => {
                                setAnchorDate(day);
                                setMobileDay(day);
                                setView("week");
                              }}
                              className="text-[10px] font-extrabold text-[#0D7A6D] sm:text-xs"
                            >
                              +{dayShifts.length - 3} more
                            </button>
                          ) : null}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          ) : (
            <>
              <div
                ref={weekBoardRef}
                className="hidden overflow-hidden rounded-2xl border border-[#E6DBCF] bg-white md:grid md:grid-cols-[190px_minmax(0,1fr)]"
                style={{ height: weekBoardHeight }}
              >
                <aside className="min-h-0 overflow-y-auto border-r border-[#E6DBCF] bg-[#FFF9F2]">
                  <div className="flex min-h-[54px] items-center justify-between border-b border-[#E6DBCF] px-3">
                    <span className="text-xs font-extrabold uppercase tracking-[0.08em] text-[#66747A]">
                      Staff
                    </span>
                    <span className="text-[10px] font-bold text-[#8B7D70]">
                      Drag onto calendar
                    </span>
                  </div>
                  <div className="space-y-2 p-2">
                    {filteredMembers.map((member) => {
                      const roleName =
                        member.roleNames.length > 0
                          ? member.roleNames.join(", ")
                          : member.defaultRoleId
                            ? roleById.get(member.defaultRoleId)
                            : null;
                      const locationName = member.defaultLocationId
                        ? locationById.get(member.defaultLocationId)
                        : null;
                      return (
                        <div
                          key={member.id}
                          role="button"
                          tabIndex={0}
                          draggable={data.canManageRoster}
                          title="Drag onto a day and time to create a shift"
                          onDragStart={(event) =>
                            setDragPayload(event, {
                              kind: "member",
                              memberId: member.id,
                            })
                          }
                          onDragEnd={clearDragState}
                          onClick={() =>
                            data.canManageRoster
                              ? openCreate(member.id, selectedMobileDay)
                              : undefined
                          }
                          onKeyDown={(event) => {
                            if (
                              data.canManageRoster &&
                              (event.key === "Enter" || event.key === " ")
                            ) {
                              event.preventDefault();
                              openCreate(member.id, selectedMobileDay);
                            }
                          }}
                          className="group flex min-h-14 w-full cursor-grab select-none items-center gap-2 rounded-xl border border-[#D8CEC3] bg-white p-2 text-left transition hover:border-[#19A897] active:cursor-grabbing"
                        >
                          {data.canManageRoster ? (
                            <GripVertical
                              className="h-4 w-4 shrink-0 text-[#9B9188] group-hover:text-[#0D7A6D]"
                              aria-hidden="true"
                            />
                          ) : null}
                          <span className="min-w-0 flex-1">
                            <strong className="block truncate text-sm text-[#243139]">
                              {member.displayName}
                            </strong>
                            {roleName || locationName ? (
                              <span className="mt-0.5 block truncate text-[11px] text-[#66747A]">
                                {[roleName, locationName].filter(Boolean).join(" · ")}
                              </span>
                            ) : null}
                          </span>
                          <span className="shrink-0 rounded-lg bg-[#EAF8F5] px-2 py-1 text-xs font-extrabold text-[#0D7A6D]">
                            {hoursText(weeklyMinutesByMember.get(member.id) ?? 0)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  {data.canManageRoster ? (
                    <div className="border-t border-[#E6DBCF] p-2">
                      <Link
                        href="/calendar-types/staff-rosters/organiser/team"
                        className="flex min-h-11 w-full items-center justify-center rounded-[10px] border border-[#D8CEC3] bg-white px-3 text-sm font-extrabold text-[#243139] hover:bg-[#F7EFE5]"
                      >
                        <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
                        Add staff
                      </Link>
                    </div>
                  ) : null}
                </aside>

                <div className="min-h-0 min-w-0 overflow-auto">
                  <div className="min-w-[900px]">
                    <div className="grid grid-cols-[48px_repeat(7,minmax(118px,1fr))] border-b border-[#E6DBCF] bg-[#FFF9F2]">
                      <div aria-hidden="true" />
                      {days.map((day) => {
                        const dayLeave = data.leave.filter((leave) =>
                          leaveAppliesToDay(leave, day),
                        );
                        return (
                          <div
                            key={day}
                            className="min-h-[50px] border-l border-[#E6DBCF] px-2 py-2 text-center"
                          >
                            <span className="text-sm font-extrabold text-[#243139]">
                              {dayLabel(day)}
                            </span>
                            {dayLeave.length > 0 ? (
                              <div className="mt-1 space-y-1">
                                {dayLeave.slice(0, 2).map((leave) => (
                                  <span
                                    key={leave.id}
                                    className={
                                      "block truncate rounded px-1 py-0.5 text-[9px] font-extrabold " +
                                      (leave.status === "approved"
                                        ? "bg-[#EAF8F5] text-[#0D7A6D]"
                                        : "bg-[#FFF2B8] text-[#8B6714]")
                                    }
                                    title={
                                      leave.memberName +
                                      " · " +
                                      (leave.status === "approved"
                                        ? "Approved leave"
                                        : "Pending leave") +
                                      " · " +
                                      leaveTimeLabel(leave)
                                    }
                                  >
                                    {leave.memberName} ·{" "}
                                    {leave.status === "approved"
                                      ? "Leave"
                                      : "Pending"}
                                  </span>
                                ))}
                                {dayLeave.length > 2 ? (
                                  <span className="block text-[9px] font-bold text-[#66747A]">
                                    +{dayLeave.length - 2} more
                                  </span>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>

                    <div
                      className="grid grid-cols-[48px_repeat(7,minmax(118px,1fr))]"
                      style={{ height: timelineHeight }}
                    >
                      <div className="relative bg-[#FFF9F2]">
                        {hourMarks.map((hour) => (
                          <span
                            key={hour}
                            className="absolute right-2 -translate-y-1/2 text-[10px] font-bold text-[#8B7D70]"
                            style={{
                              top:
                                ((hour * 60 - visibleStartMinute) / 60) *
                                hourHeight,
                            }}
                          >
                            {hour === 24
                              ? ""
                              : compactTime(
                                  String(hour).padStart(2, "0") + ":00",
                                )}
                          </span>
                        ))}
                      </div>

                      {days.map((day) => {
                        const dayShifts = filteredShifts
                          .filter((shift) => shift.date === day)
                          .map(shiftWithPreview);
                        const positioned = layoutOverlappingShifts(dayShifts);

                        return (
                          <div
                            key={day}
                            className={
                              "relative border-l border-[#E6DBCF] transition-colors " +
                              (dropPreview?.date === day
                                ? "bg-[#F0FBF8]"
                                : "bg-white")
                            }
                            onDragEnter={(event) =>
                              handleTimelineDragOver(event, day)
                            }
                            onDragOver={(event) =>
                              handleTimelineDragOver(event, day)
                            }
                            onDragLeave={(event) => {
                              if (
                                !event.currentTarget.contains(
                                  event.relatedTarget as Node | null,
                                )
                              ) {
                                setDropPreview((current) =>
                                  current?.date === day ? null : current,
                                );
                              }
                            }}
                            onDrop={(event) => handleTimelineDrop(event, day)}
                          >
                            {hourMarks.map((hour) => (
                              <span
                                key={hour}
                                className="pointer-events-none absolute inset-x-0 border-t border-[#EFE8E0]"
                                style={{
                                  top:
                                    ((hour * 60 - visibleStartMinute) / 60) *
                                    hourHeight,
                                }}
                                aria-hidden="true"
                              />
                            ))}

                            {dropPreview?.date === day ? (
                              <div
                                className="pointer-events-none absolute inset-x-0 z-30 border-t-2 border-[#19A897]"
                                style={{
                                  top:
                                    ((dropPreview.minute -
                                      visibleStartMinute) /
                                      60) *
                                    hourHeight,
                                }}
                              >
                                <span className="absolute left-1 top-0 -translate-y-1/2 rounded-md bg-[#19A897] px-1.5 py-0.5 text-[10px] font-extrabold text-[#243139] shadow-sm">
                                  {compactMinuteLabel(dropPreview.minute)}
                                </span>
                              </div>
                            ) : null}

                            {positioned.map(({ shift, lane, laneCount }) => {
                              const start = minutesFromTime(shift.startTime);
                              const end = minutesFromTime(shift.endTime);
                              const visibleShiftStart = Math.max(
                                start,
                                visibleStartMinute,
                              );
                              const visibleShiftEnd = Math.min(
                                end,
                                visibleEndMinute,
                              );
                              if (visibleShiftEnd <= visibleShiftStart) {
                                return null;
                              }

                              const top =
                                ((visibleShiftStart - visibleStartMinute) / 60) *
                                hourHeight;
                              const height = Math.max(
                                32,
                                ((visibleShiftEnd - visibleShiftStart) / 60) *
                                  hourHeight,
                              );
                              const leftPercent = (lane / laneCount) * 100;
                              const widthPercent = 100 / laneCount;

                              return (
                                <div
                                  key={shift.id}
                                  draggable={data.canManageRoster}
                                  onDragStart={(event) => {
                                    if (
                                      (event.target as HTMLElement).closest(
                                        "[data-resize-handle]",
                                      )
                                    ) {
                                      event.preventDefault();
                                      return;
                                    }
                                    setDragPayload(event, {
                                      kind: "shift",
                                      shiftId: shift.id,
                                    });
                                  }}
                                  onDragEnd={clearDragState}
                                  className="absolute z-10 overflow-hidden rounded-[10px] border border-[#8BDDD0] bg-[#EAF8F5] shadow-sm"
                                  style={{
                                    top: top + 2,
                                    height: height - 4,
                                    left:
                                      "calc(" +
                                      leftPercent +
                                      "% + 3px)",
                                    width:
                                      "calc(" +
                                      widthPercent +
                                      "% - 6px)",
                                  }}
                                >
                                  {data.canManageRoster ? (
                                    <span
                                      onPointerDown={(event) =>
                                        beginResize(event, shift, "start")
                                      }
                                      data-resize-handle="true"
                                      className="absolute inset-x-0 top-0 z-20 h-3 cursor-ns-resize bg-[#19A897]/10 hover:bg-[#19A897]/30"
                                      aria-hidden="true"
                                    />
                                  ) : null}
                                  <button
                                    type="button"
                                    onClick={() =>
                                      data.canManageRoster
                                        ? openEdit(shift)
                                        : undefined
                                    }
                                    className="h-full w-full px-2 py-2 text-left"
                                  >
                                    <strong className="block truncate text-xs text-[#243139]">
                                      {shift.memberName}
                                    </strong>
                                    <span className="mt-0.5 block truncate text-[10px] font-bold text-[#0D7A6D]">
                                      {compactTime(shift.startTime)}–{compactTime(shift.endTime)}
                                    </span>
                                    {shift.roleName || shift.locationName ? (
                                      <span className="mt-1 block truncate text-[10px] text-[#526168]">
                                        {[shift.roleName, shift.locationName]
                                          .filter(Boolean)
                                          .join(" · ")}
                                      </span>
                                    ) : null}
                                    {shift.availabilityOverride ? (
                                      <span className="mt-1 inline-flex items-center gap-1 text-[9px] font-extrabold text-[#8B6714]">
                                        <AlertTriangle
                                          className="h-3 w-3"
                                          aria-hidden="true"
                                        />
                                        Override
                                      </span>
                                    ) : null}
                                  </button>
                                  {data.canManageRoster ? (
                                    <span
                                      onPointerDown={(event) =>
                                        beginResize(event, shift, "end")
                                      }
                                      data-resize-handle="true"
                                      className="absolute inset-x-0 bottom-0 z-20 h-3 cursor-ns-resize bg-[#19A897]/10 hover:bg-[#19A897]/30"
                                      aria-hidden="true"
                                    />
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-3 md:hidden">
                <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                  {days.map((day) => (
                    <button
                      key={day}
                      type="button"
                      onClick={() => setMobileDay(day)}
                      className={
                        "min-h-11 shrink-0 rounded-xl border px-3 text-sm font-extrabold " +
                        (day === selectedMobileDay
                          ? "border-[#19A897] bg-[#EAF8F5] text-[#0D7A6D]"
                          : "border-[#E6DBCF] bg-white text-[#526168]")
                      }
                    >
                      {new Intl.DateTimeFormat("en-NZ", {
                        weekday: "short",
                        day: "numeric",
                        timeZone: "UTC",
                      }).format(new Date(day + "T00:00:00Z"))}
                    </button>
                  ))}
                </div>

                <section className="rounded-2xl border border-[#E6DBCF] bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h2 className="font-[family-name:var(--font-fraunces)] text-xl font-bold text-[#243139]">
                        {dayLabel(selectedMobileDay)}
                      </h2>
                      <p className="mt-1 text-xs font-bold text-[#66747A]">
                        {selectedMobileShifts.length} shifts
                        {selectedMobileLeave.length > 0
                          ? " · " + selectedMobileLeave.length + " leave"
                          : ""}
                      </p>
                    </div>
                    {data.canManageRoster ? (
                      <CovieButton
                        tone="neutral"
                        onClick={() => openCreate(undefined, selectedMobileDay)}
                      >
                        <Plus className="h-4 w-4" aria-hidden="true" />
                        Shift
                      </CovieButton>
                    ) : null}
                  </div>

                  {selectedMobileLeave.length > 0 ? (
                    <div className="mt-4 space-y-2">
                      {selectedMobileLeave.map((leave) => (
                        <div
                          key={leave.id}
                          className={
                            "rounded-xl border p-3 " +
                            (leave.status === "approved"
                              ? "border-[#BFEDE6] bg-[#EAF8F5]"
                              : "border-[#E2C768] bg-[#FFF8D8]")
                          }
                        >
                          <strong className="text-sm text-[#243139]">
                            {leave.memberName}
                          </strong>
                          <p className="mt-1 text-xs font-bold text-[#526168]">
                            {leave.status === "approved"
                              ? "Approved leave"
                              : "Pending leave"}{" "}
                            · {leaveTimeLabel(leave)}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {selectedMobileShifts.length === 0 ? (
                    <p className="mt-4 rounded-xl bg-[#FFF9F2] p-4 text-sm text-[#66747A]">
                      No shifts
                    </p>
                  ) : (
                    <div className="mt-4 space-y-2">
                      {selectedMobileShifts.map((shift) => (
                        <button
                          key={shift.id}
                          type="button"
                          disabled={!data.canManageRoster}
                          onClick={() => openEdit(shift)}
                          className="flex min-h-16 w-full items-start justify-between gap-3 rounded-xl border border-[#BFEDE6] bg-[#EAF8F5] p-3 text-left"
                        >
                          <span className="min-w-0">
                            <strong className="block truncate text-sm text-[#243139]">
                              {shift.memberName}
                            </strong>
                            <span className="mt-1 block text-xs font-bold text-[#0D7A6D]">
                              {compactTime(shift.startTime)}–{compactTime(shift.endTime)}
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

                {data.canManageRoster ? (
                  <Link
                    href="/calendar-types/staff-rosters/organiser/team"
                    className="flex min-h-11 items-center justify-center rounded-[10px] border border-[#E6DBCF] bg-white px-4 text-sm font-extrabold text-[#243139]"
                  >
                    Manage team
                  </Link>
                ) : null}
              </div>
            </>
          )}
        </>
      ) : null}

      {operationalHoursOpen && data?.canManageRoster ? (
        <CovieDialog
          id="staff-operational-hours-title"
          title="Operational hours"
          description="Choose the hours managers normally need to see. The roster still supports the full 24-hour day."
          icon={<Clock3 aria-hidden="true" />}
          iconTone="teal"
          size="sm"
          busy={busy}
          onClose={() => setOperationalHoursOpen(false)}
          footer={
            <>
              <CovieButton
                tone="neutral"
                disabled={busy}
                onClick={() => setOperationalHoursOpen(false)}
              >
                Cancel
              </CovieButton>
              <CovieButton
                disabled={
                  busy ||
                  operationalEndDraft <= operationalStartDraft
                }
                onClick={() => void saveOperationalHours()}
              >
                {busy ? "Saving…" : "Save hours"}
              </CovieButton>
            </>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              <span className="mb-1.5 block text-sm font-bold text-[#243139]">
                Opens
              </span>
              <CovieSelect
                value={String(operationalStartDraft)}
                disabled={busy}
                onChange={(event) =>
                  setOperationalStartDraft(Number(event.target.value))
                }
              >
                {operationalHourOptions
                  .filter((minute) => minute < DAY_END_MINUTE)
                  .map((minute) => (
                    <option key={minute} value={minute}>
                      {compactMinuteLabel(minute)}
                    </option>
                  ))}
              </CovieSelect>
            </label>
            <label>
              <span className="mb-1.5 block text-sm font-bold text-[#243139]">
                Closes
              </span>
              <CovieSelect
                value={String(operationalEndDraft)}
                disabled={busy}
                onChange={(event) =>
                  setOperationalEndDraft(Number(event.target.value))
                }
              >
                {operationalHourOptions
                  .filter((minute) => minute > 0)
                  .map((minute) => (
                    <option key={minute} value={minute}>
                      {minute === DAY_END_MINUTE
                        ? "12am (next day)"
                        : compactMinuteLabel(minute)}
                    </option>
                  ))}
              </CovieSelect>
            </label>
          </div>
          <CovieNotice tone="teal" className="mt-4">
            Operational hours only crop the weekly view. Shift data remains on
            a full 24-hour clock.
          </CovieNotice>
        </CovieDialog>
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
                  step={900}
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
                  step={900}
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
                  Save anyway
                </CovieButton>
              </div>
            </CovieNotice>
          ) : null}
        </CovieDialog>
      ) : null}

      <CovieConfirmDialog
        open={sendUpdatesConfirmOpen}
        id="send-staff-roster-updates-title"
        title="Send roster updates?"
        description={
          data
            ? data.publication.changedShiftCount +
              " shift" +
              (data.publication.changedShiftCount === 1 ? "" : "s") +
              " changed across " +
              data.publication.affectedMemberCount +
              " staff member" +
              (data.publication.affectedMemberCount === 1 ? "" : "s") +
              ". Staff will see the new published roster and these changes in Updates."
            : ""
        }
        confirmLabel="Send updates"
        destructive={false}
        busy={busy}
        icon={<CalendarDays aria-hidden="true" />}
        onCancel={() => setSendUpdatesConfirmOpen(false)}
        onConfirm={() => void publishCurrentWeek()}
      />

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
