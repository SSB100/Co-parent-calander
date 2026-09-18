"use client";

import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import {
  CheckCircle2,
  CheckSquare2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Hourglass,
  LoaderCircle,
  RotateCcw,
  StickyNote,
  UsersRound,
  ChevronDown,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ActivityPanel } from "@/components/calendar/activity-panel";
import { DayDetailsPanel } from "@/components/calendar/day-details-panel";
import { EventPanel } from "@/components/calendar/event-panel";
import { MembersPanel } from "@/components/calendar/members-panel";
import { RecurringSchedulePanel } from "@/components/calendar/recurring-schedule-panel";
import { RangeAssignmentPanel } from "@/components/calendar/range-assignment-panel";
import { SettingsPanel } from "@/components/calendar/settings-panel";
import { EventCategoryIcon } from "@/components/calendar/event-category-icon";
import { WorkspaceNav } from "@/components/workspace/workspace-nav";
import { ownershipForChoice, type OwnershipChoice } from "@/lib/assignments/ownership";
import type { CalendarPendingProposal } from "@/lib/approvals/calendar-pending";
import { parentProfileSlotIndex, type ParentProfileSlot } from "@/lib/parents/identity";

type Participant = { id: string; displayName: string; colorKey: string; profileSlot: ParentProfileSlot | null };
type Child = { id: string; displayName: string };
type ApiAssignment = {
  id: string;
  childId: string;
  date: string;
  morningParentId: string | null;
  afternoonParentId: string | null;
  handoverTime: string | null;
  handoverLocation: string | null;
  note: string | null;
};
type CalendarEvent = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  startDate: string;
  endDate: string | null;
};
type HandoverSummary = {
  date: string;
  morningParentId: string | null;
  afternoonParentId: string | null;
  handoverTime: string | null;
  handoverLocation: string | null;
  note: string | null;
};
type CalendarPayload = {
  calendar: { id: string; name: string; timezone: string; shareEnabled: boolean };
  currentParticipantId: string | null;
  currentMembershipId: string;
  currentUserName: string;
  permission: "owner" | "editor" | "viewer";
  participants: Participant[];
  children: Child[];
  assignments: ApiAssignment[];
  events: CalendarEvent[];
  pendingProposals: CalendarPendingProposal[];
  responsibilityMarkers: Array<{
    date: string;
    count: number;
    incompleteCount: number;
    pendingCount: number;
  }>;
  recurringScheduleActive: boolean;
  nextHandover: HandoverSummary | null;
  nextEvent: CalendarEvent | null;
};
type AccessMode = "checking" | "viewer" | "editor" | "error";
type SlotOwnership = string | "mixed" | null;
type DayOwnership = { morning: SlotOwnership; afternoon: SlotOwnership };
type AssignmentMap = Record<string, DayOwnership>;
type VisualStyle = { dot: string; slot: string; pill: string; button: string };

const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const visualStyles: VisualStyle[] = [
  {
    dot: "covie-parent-green",
    slot: "covie-parent-green",
    pill: "bg-emerald-100 text-emerald-800",
    button: "bg-emerald-100 text-emerald-900 hover:bg-emerald-200",
  },
  {
    dot: "covie-parent-plum",
    slot: "covie-parent-plum",
    pill: "bg-violet-100 text-violet-800",
    button: "bg-violet-100 text-violet-900 hover:bg-violet-200",
  },
];
const mixedStyle: VisualStyle = {
  dot: "bg-slate-500",
  slot: "bg-slate-200",
  pill: "bg-slate-200 text-slate-700",
  button: "bg-slate-100 text-slate-700 hover:bg-slate-200",
};

function keyFor(day: Date) {
  return format(day, "yyyy-MM-dd");
}

function styleForParticipant(participants: Participant[], participantId: string) {
  const index = participants.findIndex((participant) => participant.id === participantId);
  const participant = participants[index];
  const visualIndex = parentProfileSlotIndex(participant?.profileSlot, index);
  return visualStyles[visualIndex % visualStyles.length] ?? visualStyles[0];
}

function splitChoiceStyle(
  participants: Participant[],
  firstId: string | null | undefined,
  secondId: string | null | undefined,
) {
  if (!firstId || !secondId) return mixedStyle.button;
  const first = styleForParticipant(participants, firstId);
  const second = styleForParticipant(participants, secondId);
  if (first === visualStyles[0] && second === visualStyles[1]) {
    return "covie-split-forward text-slate-900 hover:ring-2 hover:ring-slate-200";
  }
  if (first === visualStyles[1] && second === visualStyles[0]) {
    return "covie-split-reverse text-slate-900 hover:ring-2 hover:ring-slate-200";
  }
  return mixedStyle.button;
}

function aggregateSlot(
  rows: ApiAssignment[],
  field: "morningParentId" | "afternoonParentId",
  childCount: number,
): SlotOwnership {
  if (childCount === 0) return null;
  const values: Array<string | null> = rows.map((row) => row[field] ?? null);
  while (values.length < childCount) values.push(null);
  if (values.every((value) => value === null)) return null;
  const unique = new Set(values);
  if (unique.size === 1) return values[0];
  return "mixed";
}

function aggregateAssignments(data: CalendarPayload): AssignmentMap {
  const byDate = new Map<string, ApiAssignment[]>();
  for (const assignment of data.assignments) {
    const rows = byDate.get(assignment.date) ?? [];
    rows.push(assignment);
    byDate.set(assignment.date, rows);
  }

  const result: AssignmentMap = {};
  for (const [date, rows] of byDate) {
    const morning = aggregateSlot(rows, "morningParentId", data.children.length);
    const afternoon = aggregateSlot(rows, "afternoonParentId", data.children.length);
    if (morning || afternoon) result[date] = { morning, afternoon };
  }
  return result;
}

function eventIcon(category: string) { return <EventCategoryIcon category={category} />; }

export function CalendarShell() {
  const [currentMonth, setCurrentMonth] = useState<Date>(() => startOfMonth(new Date()));
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [calendarData, setCalendarData] = useState<CalendarPayload | null>(null);
  const [accessMode, setAccessMode] = useState<AccessMode>("checking");
  const [saving, setSaving] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [detailsDate, setDetailsDate] = useState<string | null>(null);
  const [bulkReason, setBulkReason] = useState("");

  const calendarRange = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 1 });
    return { start, end, from: keyFor(start), to: keyFor(end) };
  }, [currentMonth]);

  const calendarDays = useMemo(
    () => eachDayOfInterval({ start: calendarRange.start, end: calendarRange.end }),
    [calendarRange],
  );

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ from: calendarRange.from, to: calendarRange.to });

    fetch(`/api/calendar?${params.toString()}`, { cache: "no-store" })
      .then(async (response) => ({
        response,
        body: (await response.json().catch(() => null)) as CalendarPayload | { error?: string } | null,
      }))
      .then(({ response, body }) => {
        if (cancelled) return;
        if (response.status === 401) {
          setCalendarData(null);
          setAccessMode("error");
          setMessage("Your calendar access could not be confirmed. Return to your calendars and try again.");
          return;
        }
        if (!response.ok || !body || !("calendar" in body)) {
          setCalendarData(null);
          setAccessMode("error");
          setMessage(body && "error" in body && body.error ? body.error : "The shared calendar could not be loaded yet.");
          return;
        }
        setCalendarData(body);
        setAccessMode(body.permission === "viewer" ? "viewer" : "editor");
        setMessage(null);
      })
      .catch(() => {
        if (cancelled) return;
        setCalendarData(null);
        setAccessMode("error");
        setMessage("The shared calendar could not be loaded yet.");
      });

    return () => {
      cancelled = true;
    };
  }, [calendarRange.from, calendarRange.to, refreshKey]);

  const participants = calendarData?.participants ?? [];
  const assignments = useMemo(() => (calendarData ? aggregateAssignments(calendarData) : {}), [calendarData]);
  const me = participants.find((participant) => participant.id === calendarData?.currentParticipantId) ?? participants[0] ?? null;
  const them = participants.find((participant) => participant.id !== me?.id) ?? null;

  const detailMarkers = useMemo(() => {
    const markers: Record<string, { handover: boolean; note: boolean }> = {};
    for (const assignment of calendarData?.assignments ?? []) {
      const marker = markers[assignment.date] ?? { handover: false, note: false };
      marker.handover ||= Boolean(
        assignment.handoverTime ||
          assignment.handoverLocation ||
          (assignment.morningParentId &&
            assignment.afternoonParentId &&
            assignment.morningParentId !== assignment.afternoonParentId),
      );
      marker.note ||= Boolean(assignment.note);
      markers[assignment.date] = marker;
    }
    return markers;
  }, [calendarData]);

  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    for (const event of calendarData?.events ?? []) {
      const end = event.endDate ?? event.startDate;
      for (const day of eachDayOfInterval({ start: parseISO(event.startDate), end: parseISO(end) })) {
        const key = keyFor(day);
        (map[key] ??= []).push(event);
      }
    }
    return map;
  }, [calendarData]);

  const pendingByDate = useMemo(() => {
    const map: Record<string, CalendarPendingProposal[]> = {};
    for (const proposal of calendarData?.pendingProposals ?? []) {
      for (const date of proposal.affectedDates) {
        (map[date] ??= []).push(proposal);
      }
    }
    return map;
  }, [calendarData]);

  const responsibilityByDate = useMemo(() => {
    const map: Record<
      string,
      { date: string; count: number; incompleteCount: number; pendingCount: number }
    > = {};
    for (const marker of calendarData?.responsibilityMarkers ?? []) {
      map[marker.date] = marker;
    }
    return map;
  }, [calendarData]);

  const today = new Date();
  const currentEditor = calendarData?.participants.find((participant) => participant.id === calendarData.currentParticipantId);
  const nextHandover = calendarData?.nextHandover ?? null;


  function ownerLabel(owner: SlotOwnership | undefined) {
    if (!owner) return "Unassigned";
    if (owner === "mixed") return "Mixed";
    if (owner === calendarData?.currentParticipantId) return "You";
    return participants.find((participant) => participant.id === owner)?.displayName ?? "Assigned";
  }

  function shortOwnerLabel(owner: SlotOwnership | undefined) {
    const label = ownerLabel(owner);
    if (label === "Unassigned") return "—";
    if (label === "Mixed" || label === "You") return label;
    return label.split(/\s+/)[0] ?? label;
  }

  function ownerStyle(owner: SlotOwnership | undefined) {
    if (!owner) return null;
    if (owner === "mixed") return mixedStyle;
    return styleForParticipant(participants, owner);
  }

  function assignmentLabel(assignment: DayOwnership | undefined) {
    if (!assignment) return "Not assigned yet";
    if (assignment.morning && assignment.morning !== "mixed" && assignment.morning === assignment.afternoon) {
      return `Full day ${ownerLabel(assignment.morning)}`;
    }
    return `${ownerLabel(assignment.morning)} → ${ownerLabel(assignment.afternoon)}`;
  }

  function choiceLabel(choice: OwnershipChoice) {
    if (choice === "me_full") return "Full day you";
    if (choice === "them_full") return `Full day ${them?.displayName ?? "them"}`;
    if (choice === "me_then_them") return `You → ${them?.displayName ?? "them"}`;
    if (choice === "them_then_me") return `${them?.displayName ?? "Them"} → You`;
    return "Unassigned";
  }

  function toggleSelectionMode() {
    setSelectionMode((current) => {
      const next = !current;
      if (!next) {
        setSelectedDays([]);
        setBulkReason("");
      }
      setDetailsDate(null);
      return next;
    });
  }

  function handleDayClick(day: Date) {
    if (!isSameMonth(day, currentMonth) || saving) return;
    const key = keyFor(day);
    if (selectionMode) {
      setSelectedDays((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
      return;
    }
    if ((accessMode === "editor" || accessMode === "viewer") && calendarData) {
      setSelectedDays([]);
      setDetailsDate(key);
    }
  }

  async function applySelected(choice: OwnershipChoice) {
    if (selectedDays.length === 0 || saving || accessMode !== "editor") return;
    if (choice !== "unassigned" && (!me || !them)) return;

    const ownership = choice === "unassigned"
      ? { morningParentId: null, afternoonParentId: null }
      : ownershipForChoice(choice, me!.id, them!.id);

    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/assignments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          dates: selectedDays,
          ownership,
          reason: bulkReason.trim() || null,
        }),
      });
      const body = (await response.json().catch(() => null)) as
        | { error?: string; pending?: boolean; approverName?: string | null }
        | null;
      if (!response.ok) throw new Error(body?.error ?? "Those dates could not be updated.");

      const count = selectedDays.length;
      setSelectedDays([]);
      setSelectionMode(false);
      setBulkReason("");
      setMessage(
        body?.pending
          ? body.approverName
            ? `Change sent to ${body.approverName} for approval.`
            : "Change sent for approval."
          : `${choiceLabel(choice)} saved for ${count} ${count === 1 ? "day" : "days"}.`,
      );
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Those dates could not be updated.");
    } finally {
      setSaving(false);
    }
  }

  function moveMonth(direction: "previous" | "next") {
    setCurrentMonth((month) => direction === "previous" ? subMonths(month, 1) : addMonths(month, 1));
    setSelectedDays([]);
    setSelectionMode(false);
    setBulkReason("");
    setDetailsDate(null);
  }

  function goToday() {
    setCurrentMonth(startOfMonth(new Date()));
    setSelectedDays([]);
    setSelectionMode(false);
    setBulkReason("");
    setDetailsDate(null);
  }

  const nextHandoverOwner = nextHandover ? nextHandover.afternoonParentId ?? nextHandover.morningParentId : null;
  const nextHandoverIsTransfer = Boolean(
    nextHandover?.morningParentId && nextHandover.afternoonParentId && nextHandover.morningParentId !== nextHandover.afternoonParentId,
  );
  const nextHandoverWhen = nextHandover?.handoverTime?.slice(0, 5) ?? (nextHandoverIsTransfer ? "Split day" : "Handover");

  const bulkChoices: Array<{ value: OwnershipChoice; label: string; className: string }> = [
    {
      value: "me_full",
      label: "Full day you",
      className: me ? styleForParticipant(participants, me.id).button : visualStyles[0].button,
    },
    {
      value: "them_full",
      label: `Full day ${them?.displayName ?? "them"}`,
      className: them ? styleForParticipant(participants, them.id).button : visualStyles[1].button,
    },
    {
      value: "me_then_them",
      label: `You → ${them?.displayName ?? "them"}`,
      className: splitChoiceStyle(participants, me?.id, them?.id),
    },
    {
      value: "them_then_me",
      label: `${them?.displayName ?? "Them"} → You`,
      className: splitChoiceStyle(participants, them?.id, me?.id),
    },
    { value: "unassigned", label: "Unassigned", className: mixedStyle.button },
  ];

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-3 py-4 sm:px-6 sm:py-7 lg:px-8">
      <header className="covie-calendar-header relative mb-3 sm:mb-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-1 hidden items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 sm:flex">
              <UsersRound className="h-4 w-4" aria-hidden="true" /> Shared family calendar
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">{calendarData?.calendar.name ?? "Our Family Calendar"}</h1>
              {accessMode === "checking" ? (
                <span role="status" aria-live="polite" className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600"><LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />Checking access</span>
              ) : accessMode === "editor" ? (
                <span className="hidden items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800 sm:inline-flex"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />{currentEditor ? `${currentEditor.displayName} editing` : "Editor access"}</span>
              ) : accessMode === "viewer" ? (
                <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-800">View only</span>
              ) : (
                <span className="rounded-full bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-800">Calendar unavailable</span>
              )}
              {calendarData?.recurringScheduleActive ? <span className="hidden rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 sm:inline-flex">Repeating schedule on</span> : null}
            </div>
          </div>

          <WorkspaceNav
              active="calendar"
              actions={
                <>
                  {accessMode === "editor" ? (
                    <>
                      <EventPanel includeRangeTools={false} onChanged={() => setRefreshKey((value) => value + 1)} />
                      <details className="relative">
                      <summary className="covie-menu-trigger"><span><span className="hidden sm:inline">Calendar </span>Tools</span><ChevronDown size={16} aria-hidden="true" /></summary>
                        <div className="covie-menu covie-tool-menu">
                          <RangeAssignmentPanel onChanged={() => setRefreshKey((value) => value + 1)} />
                          <RecurringSchedulePanel onChanged={() => setRefreshKey((value) => value + 1)} />
                          <ActivityPanel />
                        </div>
                      </details>

                    </>
                  ) : null}
                  {accessMode === "editor" || accessMode === "viewer" ? (
                    <details className="relative">
                      <summary className="covie-menu-trigger"><span><span className="hidden sm:inline">Calendar </span>Settings</span><ChevronDown size={16} aria-hidden="true" /></summary>
                      <div className="covie-menu covie-tool-menu">
                        {calendarData?.permission === "owner" ? (
                          <MembersPanel onChanged={() => setRefreshKey((value) => value + 1)} />
                        ) : null}
                    <SettingsPanel
                      readOnly={accessMode === "viewer"}
                      onChanged={() => setRefreshKey((value) => value + 1)}
                    />
                      </div>
                    </details>
                  ) : null}
                </>
              }
            />
        </div>
      </header>

      {message ? (
        <div role={accessMode === "error" ? "alert" : "status"} aria-live={accessMode === "error" ? "assertive" : "polite"} className="mb-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">{message}</div>
      ) : null}

      <p className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-600">
        <Clock3 size={16} aria-hidden="true" />
        <strong className="font-medium text-slate-900">Next handover:</strong>
        {nextHandover ? <>
          <span>{format(parseISO(nextHandover.date), "EEE d MMM")} · {nextHandoverWhen}</span>
          <span>{nextHandoverIsTransfer ? [ownerLabel(nextHandover.morningParentId), ownerLabel(nextHandover.afternoonParentId)].join(" → ") : ownerLabel(nextHandoverOwner)}</span>
          {nextHandover.handoverLocation && <span>· {nextHandover.handoverLocation}</span>}
        </> : <span>No handover scheduled</span>}
      </p>

      <section className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-200 px-3 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="flex items-center justify-between gap-2 sm:justify-start">
            <button type="button" aria-label="Previous month" onClick={() => moveMonth("previous")} className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"><ChevronLeft className="h-5 w-5" aria-hidden="true" /></button>
            <div className="min-w-40 text-center sm:min-w-48"><h2 className="text-lg font-semibold text-slate-900 sm:text-xl">{format(currentMonth, "MMMM yyyy")}</h2></div>
            <button type="button" aria-label="Next month" onClick={() => moveMonth("next")} className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"><ChevronRight className="h-5 w-5" aria-hidden="true" /></button>
          </div>

          <div className="covie-calendar-controls flex flex-wrap items-center justify-between gap-2 sm:justify-end">
            <div className="mr-1 flex items-center gap-3 text-sm">
              {participants.slice(0, 2).map((participant) => {
                const style = styleForParticipant(participants, participant.id);
                return <div key={participant.id} className="flex items-center gap-1.5 text-slate-600"><span className={`h-2.5 w-2.5 rounded-full ${style.dot}`} aria-hidden="true" />{participant.id === calendarData?.currentParticipantId ? "You" : participant.displayName}</div>;
              })}
            </div>
            {accessMode === "editor" ? (
              <button type="button" onClick={toggleSelectionMode} aria-pressed={selectionMode} className={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm font-semibold transition ${selectionMode ? "border-blue-600 bg-blue-600 text-white hover:bg-blue-700" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}>
                <CheckSquare2 className="h-4 w-4" aria-hidden="true" />{selectionMode ? "Done selecting" : "Select days"}
              </button>
            ) : null}
            <button type="button" onClick={goToday} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-900 px-3 text-sm font-semibold text-white hover:bg-slate-800"><RotateCcw className="h-4 w-4" aria-hidden="true" />Today</button>
          </div>
        </div>

        <div className="px-2 pb-2 pt-3 sm:px-4 sm:pb-4">
          <p className="mb-3 px-1 text-sm text-slate-500">
            {selectionMode
              ? "Selection mode: tap dates, then choose the custody state below."
              : accessMode === "editor"
                ? "Select a day to view details or propose a change."
                : "Select a day to view parenting time, handovers and events."}
          </p>

          <div className="grid grid-cols-7 gap-1 sm:gap-2" role="grid" aria-label={format(currentMonth, "MMMM yyyy")}>
            {weekdays.map((weekday) => <div key={weekday} role="columnheader" className="pb-1 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-400 sm:text-xs">{weekday}</div>)}

            {calendarDays.map((day) => {
              const key = keyFor(day);
              const assignment = assignments[key];
              const selected = selectionMode && selectedDays.includes(key);
              const inMonth = isSameMonth(day, currentMonth);
              const isToday = isSameDay(day, today);
              const marker = detailMarkers[key];
              const dayEvents = eventsByDate[key] ?? [];
              const dayPending = pendingByDate[key] ?? [];
              const responsibilityMarker = responsibilityByDate[key];
              const morningStyle = ownerStyle(assignment?.morning);
              const afternoonStyle = ownerStyle(assignment?.afternoon);
              const fullDayOwner = assignment?.morning && assignment.morning === assignment.afternoon ? assignment.morning : null;
              const fullDayStyle = ownerStyle(fullDayOwner);

              return (
                <button
                  key={key}
                  type="button"
                  role="gridcell"
                  disabled={!inMonth || saving}
                  aria-selected={selected}
                  aria-current={isToday ? "date" : undefined}
                  aria-label={`${format(day, "EEEE d MMMM")}, ${assignmentLabel(assignment)}${dayEvents.length ? `, ${dayEvents.length} event${dayEvents.length === 1 ? "" : "s"}` : ""}${responsibilityMarker?.count ? `, ${responsibilityMarker.count} responsibilit${responsibilityMarker.count === 1 ? "y" : "ies"}` : ""}${responsibilityMarker?.pendingCount ? `, ${responsibilityMarker.pendingCount} pending responsibility change${responsibilityMarker.pendingCount === 1 ? "" : "s"}` : ""}${dayPending.length ? `, ${dayPending.length} pending calendar change${dayPending.length === 1 ? "" : "s"}` : ""}`}
                  onClick={() => handleDayClick(day)}
                  className={`relative min-h-[76px] overflow-hidden rounded-xl border border-slate-200 bg-white p-1 text-left transition sm:min-h-28 sm:rounded-2xl sm:p-2.5 ${inMonth ? "hover:ring-1 hover:ring-slate-300" : "cursor-default opacity-30"} ${selected ? "ring-2 ring-blue-500 ring-offset-1" : ""} ${selectionMode && inMonth ? "cursor-pointer" : ""}`}
                >
                  {inMonth ? (
                    <span className="pointer-events-none absolute inset-0" aria-hidden="true">
                      <span className={`absolute inset-y-0 left-0 w-1/2 ${morningStyle?.slot ?? "bg-white"}`} />
                      <span className={`absolute inset-y-0 right-0 w-1/2 ${afternoonStyle?.slot ?? "bg-white"}`} />
                      {assignment?.morning !== assignment?.afternoon ? <span className="absolute inset-y-0 left-1/2 border-l border-white/80" /> : null}
                    </span>
                  ) : null}

                  <div className="relative z-10 flex items-start justify-between gap-1">
                    <span className={`flex h-7 min-w-7 items-center justify-center rounded-full bg-white/90 text-sm font-semibold shadow-sm ${isToday ? "ring-2 ring-slate-900 text-slate-900" : "text-slate-700"}`}>{format(day, "d")}</span>
                    {selected ? <span className="rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold text-white" aria-hidden="true">✓</span> : null}
                  </div>

                  {assignment && inMonth ? (
                    fullDayOwner && fullDayStyle ? (
                      <div className={`relative z-10 mt-1 inline-flex max-w-full items-center gap-1 rounded-full px-0 py-0.5 text-xs font-medium sm:px-2 ${fullDayStyle.pill}`}>
                        <span className={`hidden h-1.5 w-1.5 shrink-0 rounded-full sm:block ${fullDayStyle.dot}`} aria-hidden="true" />
                        <span className="truncate" title={ownerLabel(fullDayOwner)}><span className="sm:hidden">{shortOwnerLabel(fullDayOwner).slice(0, 3)}</span><span className="hidden sm:inline">{shortOwnerLabel(fullDayOwner)}</span></span>
                      </div>
                    ) : (
                      <div className="relative z-10 mt-1 inline-flex max-w-full rounded-full bg-white/90 px-0.5 py-0.5 text-xs font-medium text-slate-700 sm:px-1.5">
                        <span className="truncate"><span className="sm:hidden">{shortOwnerLabel(assignment.morning).slice(0,1)}→{shortOwnerLabel(assignment.afternoon).slice(0,1)}</span><span className="hidden sm:inline">{shortOwnerLabel(assignment.morning)} → {shortOwnerLabel(assignment.afternoon)}</span></span>
                      </div>
                    )
                  ) : null}

                  {dayEvents[0] && inMonth ? (
                    <div className="relative z-10 mt-1.5 hidden max-w-full truncate rounded-lg border border-sky-200 bg-sky-50/95 px-1.5 py-1 text-[9px] font-bold text-sky-900 shadow-sm sm:block sm:text-xs">
                      <span className="mr-1" aria-hidden="true">{eventIcon(dayEvents[0].category)}</span>{dayEvents[0].title}
                    </div>
                  ) : null}
                  {dayEvents.length > 0 && inMonth ? <span className="relative z-10 block rounded bg-white/95 px-1 text-xs font-medium text-slate-700 sm:hidden">{dayEvents.length} evt</span> : null}
                  {dayEvents.length > 1 && inMonth ? <span className="relative z-10 mt-1 hidden rounded bg-white/95 px-1 text-xs sm:block font-semibold text-sky-800">+{dayEvents.length - 1} more event{dayEvents.length === 2 ? "" : "s"}</span> : null}

                  {inMonth &&
                  (marker ||
                    dayPending.length > 0 ||
                    responsibilityMarker?.count ||
                    responsibilityMarker?.pendingCount) ? (
                    <div className="absolute bottom-1.5 right-1.5 z-10 flex items-center gap-1 rounded-full bg-white/85 px-1 text-slate-500 sm:bottom-2 sm:right-2">
                      {dayPending.length > 0 ? (
                        <Hourglass
                          className="h-3.5 w-3.5 text-amber-600"
                          aria-label="Pending calendar change"
                        />
                      ) : null}
                      {responsibilityMarker?.count || responsibilityMarker?.pendingCount ? (
                        <CheckSquare2
                          className={`h-3.5 w-3.5 ${
                            responsibilityMarker.incompleteCount > 0
                              ? "text-slate-700"
                              : "text-emerald-600"
                          }`}
                          aria-label={
                            responsibilityMarker.pendingCount > 0
                              ? "Responsibility, with pending change"
                              : "Responsibility"
                          }
                        />
                      ) : null}
                      {(dayPending.length > 0 ? 1 : 0) +
                        (responsibilityMarker?.count || responsibilityMarker?.pendingCount ? 1 : 0) <
                      2 ? (
                        marker?.handover ? (
                          <Clock3 className="hidden h-3.5 w-3.5 sm:block" aria-label="Handover" />
                        ) : marker?.note ? (
                          <StickyNote className="h-3.5 w-3.5" aria-label="Note" />
                        ) : null
                      ) : null}
                      {(dayPending.length > 0 ? 1 : 0) +
                        (responsibilityMarker?.count || responsibilityMarker?.pendingCount ? 1 : 0) +
                        (marker?.handover || marker?.note ? 1 : 0) >
                      2 ? (
                        <span className="text-[9px] font-bold text-slate-500" aria-label="One more detail">
                          +1
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {accessMode === "editor" && selectionMode && selectedDays.length > 0 ? (
        <div className="sticky bottom-3 z-20 mx-auto mt-4 flex max-w-4xl flex-col gap-3 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-xl backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div className="px-1">
              <p className="font-semibold text-slate-900" role="status" aria-live="polite" aria-atomic="true">{selectedDays.length} {selectedDays.length === 1 ? "day" : "days"} selected</p>
              <button type="button" disabled={saving} onClick={() => setSelectedDays([])} className="min-h-10 text-sm font-medium text-slate-500 hover:underline disabled:opacity-50">Clear selection</button>
            </div>
            <span className="text-xs text-slate-500">Choose one state</span>
          </div>
          <label className="block">
            <span className="text-xs font-semibold text-slate-600">
              Reason for change <span className="font-normal text-slate-400">(optional)</span>
            </span>
            <input
              type="text"
              maxLength={500}
              value={bulkReason}
              disabled={saving}
              placeholder="e.g. Family event"
              onChange={(event) => setBulkReason(event.target.value)}
              className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200 disabled:opacity-60"
            />
          </label>
          <div className="grid gap-2 sm:grid-cols-5">
            {bulkChoices.map((item) => (
              <button
                key={item.value}
                type="button"
                disabled={saving || (item.value !== "unassigned" && (!me || !them))}
                onClick={() => void applySelected(item.value)}
                className={`min-h-11 rounded-xl px-3 text-xs font-semibold transition disabled:opacity-40 ${item.className}`}
              >
                {saving ? "Saving…" : item.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {detailsDate && calendarData ? (
        <DayDetailsPanel
          key={`${detailsDate}-${refreshKey}`}
          date={detailsDate}
          participants={calendarData.participants}
          currentParticipantId={calendarData.currentParticipantId}
          currentMembershipId={calendarData.currentMembershipId}
          assignments={calendarData.assignments}
          activeChildCount={calendarData.children.length}
          pendingProposals={(calendarData.pendingProposals ?? []).filter((proposal) =>
            proposal.affectedDates.includes(detailsDate),
          )}
          readOnly={accessMode === "viewer"}
          onClose={() => setDetailsDate(null)}
          onSaved={(savedMessage) => {
            setDetailsDate(null);
            setSelectedDays([]);
            setMessage(savedMessage);
            setRefreshKey((value) => value + 1);
          }}
          onProposalChanged={() => {
            setMessage("Proposal updated.");
            setRefreshKey((value) => value + 1);
          }}
        />
      ) : null}

      <p className="mx-auto mt-5 max-w-2xl text-center text-xs leading-5 text-slate-400">
        {accessMode === "editor"
          ? "Shared changes become part of the agreed calendar after approval when both parents are linked."
          : "You have view-only access. Ask the calendar owner if you need editing permission."}
      </p>
    </main>
  );
}
