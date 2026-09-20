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
  ChevronDown,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityPanel } from "@/components/calendar/activity-panel";
import { CalendarSwitcher, type CalendarOption } from "@/components/calendar/calendar-switcher";
import { GoogleCalendarQuickAction } from "@/components/calendar/google-calendar-quick-action";
import { DayDetailsPanel } from "@/components/calendar/day-details-panel";
import { EventPanel } from "@/components/calendar/event-panel";
import { MembersPanel } from "@/components/calendar/members-panel";
import { RecurringSchedulePanel } from "@/components/calendar/recurring-schedule-panel";
import { RangeAssignmentPanel } from "@/components/calendar/range-assignment-panel";
import { SettingsPanel } from "@/components/calendar/settings-panel";
import { EventCategoryIcon } from "@/components/calendar/event-category-icon";
import { WorkspaceNav } from "@/components/workspace/workspace-nav";
import { ownershipForChoice, type OwnershipChoice } from "@/lib/assignments/ownership";
import { useDismissibleDetails } from "@/lib/client/use-details-dismiss";
import type { CalendarPendingProposal } from "@/lib/approvals/calendar-pending";
import { normalizeParentColorKey, parentColorOptions, parentProfileSlotIndex, type ParentProfileSlot } from "@/lib/parents/identity";

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
type VisualStyle = { key: string; dot: string; slot: string; pill: string; button: string };

const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const visualStyles: VisualStyle[] = parentColorOptions.map((option) => ({
  key: option.key,
  dot: option.dotClass,
  slot: option.slotClass,
  pill: option.pillClass,
  button: option.buttonClass,
}));
const mixedStyle: VisualStyle = {
  key: "mixed",
  dot: "bg-slate-500",
  slot: "bg-slate-200",
  pill: "bg-slate-200 text-slate-700",
  button: "bg-[#F7DC86] text-[#243139] hover:bg-[#F2D16B]",
};

function keyFor(day: Date) {
  return format(day, "yyyy-MM-dd");
}

function styleForParticipant(participants: Participant[], participantId: string) {
  const index = participants.findIndex((participant) => participant.id === participantId);
  const participant = participants[index];
  const visualIndex = parentProfileSlotIndex(participant?.profileSlot, index);
  const colorKey = normalizeParentColorKey(participant?.colorKey, visualIndex);
  return visualStyles.find((style) => style.key === colorKey) ?? visualStyles[visualIndex % visualStyles.length] ?? visualStyles[0];
}

function splitChoiceStyle(
  participants: Participant[],
  firstId: string | null | undefined,
  secondId: string | null | undefined,
) {
  if (!firstId || !secondId) return mixedStyle.button;
  const first = styleForParticipant(participants, firstId);
  const second = styleForParticipant(participants, secondId);
  if (first.key === second.key) return mixedStyle.button;
  return `${first.button} ring-1 ring-inset ring-slate-300`;
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

export function CalendarShell({
  calendars,
  currentCalendarId,
  defaultName,
}: {
  calendars: CalendarOption[];
  currentCalendarId: string;
  defaultName: string;
}) {
  const [currentMonth, setCurrentMonth] = useState<Date>(() => startOfMonth(new Date()));
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [bulkEditorOpen, setBulkEditorOpen] = useState(false);
  const [calendarData, setCalendarData] = useState<CalendarPayload | null>(null);
  const [accessMode, setAccessMode] = useState<AccessMode>("checking");
  const [saving, setSaving] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [detailsDate, setDetailsDate] = useState<string | null>(null);
  const [bulkReason, setBulkReason] = useState("");
  const toolsMenuRef = useRef<HTMLDetailsElement>(null);
  const settingsMenuRef = useRef<HTMLDetailsElement>(null);
  useDismissibleDetails(toolsMenuRef);
  useDismissibleDetails(settingsMenuRef);

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
          setMessage("Your calendar access could not be confirmed. Try another calendar from the calendar name above.");
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

  function ownerLabel(owner: SlotOwnership | undefined) {
    if (!owner) return "Unassigned";
    if (owner === "mixed") return "Mixed";
    if (owner === calendarData?.currentParticipantId) return "You";
    return participants.find((participant) => participant.id === owner)?.displayName ?? "Assigned";
  }

  function parentTileName(owner: SlotOwnership | undefined) {
    if (!owner) return "";
    if (owner === "mixed") return "Mixed";
    return participants.find((participant) => participant.id === owner)?.displayName ?? "Parent";
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
        setBulkEditorOpen(false);
      }
      setDetailsDate(null);
      return next;
    });
  }

  function handleDayClick(day: Date) {
    if (saving) return;
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
      setBulkEditorOpen(false);
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
    setDetailsDate(null);
  }

  function goToday() {
    setCurrentMonth(startOfMonth(new Date()));
    setDetailsDate(null);
  }

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
    <main className={`covie-calendar-page w-full max-w-none px-3 py-3 sm:px-5 sm:py-4 lg:px-4${selectionMode ? " is-selecting-days" : ""}`}>
      <header className="covie-calendar-header relative mb-3 sm:mb-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <CalendarSwitcher
                calendars={calendars}
                currentCalendarId={currentCalendarId}
                defaultName={defaultName}
              />
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
                  {accessMode === "editor" || accessMode === "viewer" ? <GoogleCalendarQuickAction /> : null}
                  {accessMode === "editor" ? (
                    <>
                      <EventPanel includeRangeTools={false} onChanged={() => setRefreshKey((value) => value + 1)} />
                      <details ref={toolsMenuRef} className="relative">
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
                    <details ref={settingsMenuRef} className="relative">
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

      <div className="covie-calendar-content flex min-h-0 flex-1">
      <section className="covie-calendar-board flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm">
        <div className="shrink-0 flex flex-col gap-2 border-b border-slate-200 px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:px-4 sm:py-3">
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
                <CheckSquare2 className="h-4 w-4" aria-hidden="true" />{selectionMode ? "Cancel select" : "Select days"}
              </button>
            ) : null}
            <button type="button" onClick={goToday} className="covie-action-teal inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm"><RotateCcw className="h-4 w-4" aria-hidden="true" />Today</button>
          </div>
        </div>

        {accessMode === "editor" && selectionMode ? (
          <div className="covie-mobile-selection-bar mx-3 mb-1 flex min-h-12 items-center justify-between gap-3 rounded-xl border border-[#243139] bg-[#FFF9F2] px-3 py-2 sm:hidden">
            <div className="min-w-0">
              <p className="text-sm font-bold text-[#243139]" role="status" aria-live="polite" aria-atomic="true">
                {selectedDays.length > 0
                  ? `${selectedDays.length} ${selectedDays.length === 1 ? "day" : "days"} selected`
                  : "Tap dates to select them"}
              </p>
              {selectedDays.length > 0 ? (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    setSelectedDays([]);
                    setBulkEditorOpen(false);
                  }}
                  className="mt-0.5 text-xs font-semibold text-slate-500 underline underline-offset-2 disabled:opacity-50"
                >
                  Clear
                </button>
              ) : (
                <p className="mt-0.5 text-[11px] text-slate-500">You can move between months without losing your selection.</p>
              )}
            </div>
            {selectedDays.length > 0 ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => setBulkEditorOpen(true)}
                className="covie-primary-action inline-flex min-h-10 shrink-0 items-center justify-center rounded-xl px-4 text-sm"
              >
                Assign days
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="covie-calendar-board-body flex min-h-0 flex-1 flex-col px-1.5 pb-1.5 pt-2 sm:px-3 sm:pb-3">
          <p className="mb-1.5 hidden shrink-0 px-1 text-xs text-slate-500 lg:block">
            {selectionMode
              ? "Selection mode: tap dates, then choose the custody state below."
              : accessMode === "editor"
                ? "Select a day to view details or propose a change."
                : "Select a day to view parenting time, handovers and events."}
          </p>

          <div
            className="covie-calendar-grid grid min-h-0 flex-1 grid-cols-7 gap-1 sm:gap-1.5"
            style={{ gridTemplateRows: `auto repeat(${Math.ceil(calendarDays.length / 7)}, minmax(0, 1fr))` }}
            role="grid"
            aria-label={format(currentMonth, "MMMM yyyy")}
          >
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
              const splitDay = Boolean(
                assignment?.morning &&
                  assignment.afternoon &&
                  assignment.morning !== "mixed" &&
                  assignment.afternoon !== "mixed" &&
                  assignment.morning !== assignment.afternoon,
              );
              const tileEvents = [
                ...(splitDay ? [{ id: `handover-${key}`, title: "Handover", category: "handover" }] : []),
                ...dayEvents,
              ];

              return (
                <button
                  key={key}
                  type="button"
                  role="gridcell"
                  disabled={saving}
                  aria-selected={selected}
                  aria-current={isToday ? "date" : undefined}
                  aria-label={`${format(day, "EEEE d MMMM")}, ${assignmentLabel(assignment)}${tileEvents.length ? `, ${tileEvents.length} event${tileEvents.length === 1 ? "" : "s"}` : ""}${responsibilityMarker?.count ? `, ${responsibilityMarker.count} responsibilit${responsibilityMarker.count === 1 ? "y" : "ies"}` : ""}${responsibilityMarker?.pendingCount ? `, ${responsibilityMarker.pendingCount} pending responsibility change${responsibilityMarker.pendingCount === 1 ? "" : "s"}` : ""}${dayPending.length ? `, ${dayPending.length} pending calendar change${dayPending.length === 1 ? "" : "s"}` : ""}`}
                  onClick={() => handleDayClick(day)}
                  className={`relative h-full min-h-0 overflow-hidden rounded-lg border bg-white p-1 text-left transition sm:rounded-xl ${inMonth ? "border-slate-200 hover:ring-1 hover:ring-slate-300" : "border-slate-300"} ${selected ? "ring-2 ring-blue-500 ring-offset-1" : ""} ${selectionMode ? "cursor-pointer" : ""}`}
                >
                  <span className="pointer-events-none absolute inset-0" aria-hidden="true">
                    <span className={`absolute inset-y-0 left-0 w-1/2 ${morningStyle?.slot ?? "bg-white"}`} />
                    <span className={`absolute inset-y-0 right-0 w-1/2 ${afternoonStyle?.slot ?? "bg-white"}`} />
                    {assignment?.morning !== assignment?.afternoon ? <span className="absolute inset-y-0 left-1/2 border-l border-white/80" /> : null}
                  </span>

                  {assignment ? (
                    fullDayOwner ? (
                      <div className="pointer-events-none absolute inset-x-1 top-1 z-10 truncate text-center text-[9px] font-bold text-slate-800 sm:text-[11px]" title={parentTileName(fullDayOwner)}>
                        {parentTileName(fullDayOwner)}
                      </div>
                    ) : (
                      <>
                        <div className="pointer-events-none absolute left-0 top-1 z-10 w-1/2 truncate px-0.5 text-center text-[8px] font-bold text-slate-800 sm:text-[10px]" title={parentTileName(assignment.morning)}>
                          {parentTileName(assignment.morning)}
                        </div>
                        <div className="pointer-events-none absolute right-0 top-1 z-10 w-1/2 truncate px-0.5 text-center text-[8px] font-bold text-slate-800 sm:text-[10px]" title={parentTileName(assignment.afternoon)}>
                          {parentTileName(assignment.afternoon)}
                        </div>
                      </>
                    )
                  ) : null}

                  <span
                    className={`absolute right-1 top-1/2 z-10 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-white text-xs font-bold shadow-sm sm:right-2 sm:h-7 sm:w-7 sm:text-sm ${isToday ? "ring-2 ring-slate-900 text-slate-950" : inMonth ? "text-slate-700" : "text-slate-500"}`}
                  >
                    {format(day, "d")}
                  </span>

                  {selected ? <span className="absolute left-1 top-1/2 z-20 -translate-y-1/2 rounded-full bg-blue-600 px-1.5 py-0.5 text-[9px] font-bold text-white" aria-hidden="true">✓</span> : null}

                  {tileEvents.length > 0 ? (
                    <div className="absolute inset-x-0 bottom-0 z-20 flex h-5 items-center gap-1 truncate bg-[#F4C64E] px-1.5 text-[8px] font-bold text-[#243139] sm:h-7 sm:px-2 sm:text-[10px]">
                      {tileEvents[0]?.category !== "handover" ? <span aria-hidden="true">{eventIcon(tileEvents[0]?.category ?? "other")}</span> : <Clock3 className="h-3 w-3 shrink-0" aria-hidden="true" />}
                      <span className="truncate">{tileEvents[0]?.title}</span>
                      {tileEvents.length > 1 ? <span className="ml-auto shrink-0">+{tileEvents.length - 1}</span> : null}
                    </div>
                  ) : null}

                  {(marker ||
                    dayPending.length > 0 ||
                    responsibilityMarker?.count ||
                    responsibilityMarker?.pendingCount) ? (
                    <div className={`absolute right-1 z-10 flex items-center gap-1 rounded-full bg-white px-1 text-slate-500 ${tileEvents.length ? "bottom-6 sm:bottom-8" : "bottom-1 sm:bottom-2"}`}>
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
      </div>

      {accessMode === "editor" && selectionMode && selectedDays.length > 0 ? (
        <div className="sticky bottom-3 z-20 mx-auto mt-4 hidden max-w-4xl flex-col gap-3 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-xl backdrop-blur sm:flex">
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

      {accessMode === "editor" && selectionMode && selectedDays.length > 0 && bulkEditorOpen ? (
        <div className="covie-dialog-backdrop sm:hidden">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="bulk-assign-title"
            className="covie-dialog covie-dialog-sm"
          >
            <header className="covie-dialog-header">
              <div className="covie-dialog-heading">
                <div className="covie-dialog-icon teal">
                  <CheckSquare2 aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <h2 id="bulk-assign-title" className="covie-dialog-title">Assign selected days</h2>
                  <p className="covie-dialog-description">
                    {selectedDays.length} {selectedDays.length === 1 ? "day" : "days"} selected. Choose the parenting state to apply to all of them.
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Close day assignment"
                disabled={saving}
                onClick={() => setBulkEditorOpen(false)}
                className="covie-dialog-close"
              >
                <X aria-hidden="true" />
              </button>
            </header>

            <div className="covie-dialog-body">
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

              <div className="mt-3 grid gap-2">
                {bulkChoices.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    disabled={saving || (item.value !== "unassigned" && (!me || !them))}
                    onClick={() => void applySelected(item.value)}
                    className={`min-h-12 rounded-xl px-3 text-sm font-semibold transition disabled:opacity-40 ${item.className}`}
                  >
                    {saving ? "Saving…" : item.label}
                  </button>
                ))}
              </div>
            </div>
          </section>
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
          onEventChanged={(eventMessage) => {
            setMessage(eventMessage);
            setRefreshKey((value) => value + 1);
          }}
        />
      ) : null}

      <p className="mx-auto mt-2 hidden max-w-2xl shrink-0 text-center text-xs leading-5 text-slate-400 sm:block">
        {accessMode === "editor"
          ? "Shared changes become part of the agreed calendar after approval when both parents are linked."
          : "You have view-only access. Ask the calendar owner if you need editing permission."}
      </p>

    </main>
  );
}
