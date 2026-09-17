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
  CalendarDays,
  CheckCircle2,
  CheckSquare2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  LoaderCircle,
  MapPin,
  RotateCcw,
  StickyNote,
  UsersRound,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ActivityPanel } from "@/components/calendar/activity-panel";
import { DayDetailsPanel } from "@/components/calendar/day-details-panel";
import { EventPanel } from "@/components/calendar/event-panel";
import { RecurringSchedulePanel } from "@/components/calendar/recurring-schedule-panel";
import { SettingsPanel } from "@/components/calendar/settings-panel";
import { SharePanel } from "@/components/calendar/share-panel";

type Participant = { id: string; displayName: string; colorKey: string };
type Child = { id: string; displayName: string };
type ApiAssignment = {
  id: string;
  childId: string;
  date: string;
  parentId: string;
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
  parentId: string;
  handoverTime: string | null;
  handoverLocation: string | null;
  note: string | null;
};
type CalendarPayload = {
  calendar: { id: string; name: string; timezone: string; shareEnabled: boolean };
  currentParticipantId: string;
  participants: Participant[];
  children: Child[];
  assignments: ApiAssignment[];
  events: CalendarEvent[];
  recurringScheduleActive: boolean;
  nextHandover: HandoverSummary | null;
  nextEvent: CalendarEvent | null;
};
type AccessMode = "checking" | "preview" | "editor" | "error";
type Ownership = string | "mixed";
type AssignmentMap = Record<string, Ownership>;
type VisualStyle = { dot: string; cell: string; pill: string; button: string };

const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const visualStyles: VisualStyle[] = [
  {
    dot: "bg-emerald-500",
    cell: "border-emerald-200 bg-emerald-50",
    pill: "bg-emerald-100 text-emerald-800",
    button: "bg-emerald-100 text-emerald-900 hover:bg-emerald-200",
  },
  {
    dot: "bg-violet-500",
    cell: "border-violet-200 bg-violet-50",
    pill: "bg-violet-100 text-violet-800",
    button: "bg-violet-100 text-violet-900 hover:bg-violet-200",
  },
];
const mixedStyle: VisualStyle = {
  dot: "bg-slate-500",
  cell: "border-slate-300 bg-slate-100",
  pill: "bg-slate-200 text-slate-700",
  button: "bg-slate-100 text-slate-700 hover:bg-slate-200",
};
const previewParticipants: Participant[] = [
  { id: "preview-a", displayName: "Parent A", colorKey: "emerald" },
  { id: "preview-b", displayName: "Parent B", colorKey: "violet" },
];

function keyFor(day: Date) {
  return format(day, "yyyy-MM-dd");
}

function styleForParticipant(participants: Participant[], participantId: string) {
  const index = participants.findIndex((participant) => participant.id === participantId);
  return visualStyles[Math.max(0, index) % visualStyles.length] ?? visualStyles[0];
}

function aggregateAssignments(data: CalendarPayload): AssignmentMap {
  const byDate = new Map<string, { parentIds: Set<string>; childIds: Set<string> }>();
  for (const assignment of data.assignments) {
    const entry = byDate.get(assignment.date) ?? {
      parentIds: new Set<string>(),
      childIds: new Set<string>(),
    };
    entry.parentIds.add(assignment.parentId);
    entry.childIds.add(assignment.childId);
    byDate.set(assignment.date, entry);
  }

  const result: AssignmentMap = {};
  for (const [date, entry] of byDate) {
    result[date] =
      entry.parentIds.size === 1 && entry.childIds.size === data.children.length
        ? [...entry.parentIds][0]
        : "mixed";
  }
  return result;
}

export function CalendarShell() {
  const [currentMonth, setCurrentMonth] = useState<Date>(() => startOfMonth(new Date()));
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [previewAssignments, setPreviewAssignments] = useState<AssignmentMap>({});
  const [calendarData, setCalendarData] = useState<CalendarPayload | null>(null);
  const [accessMode, setAccessMode] = useState<AccessMode>("checking");
  const [saving, setSaving] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [detailsDate, setDetailsDate] = useState<string | null>(null);

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
        body: (await response.json().catch(() => null)) as
          | CalendarPayload
          | { error?: string }
          | null,
      }))
      .then(({ response, body }) => {
        if (cancelled) return;
        if (response.status === 401) {
          setCalendarData(null);
          setAccessMode("preview");
          return;
        }
        if (!response.ok || !body || !("calendar" in body)) {
          setCalendarData(null);
          setAccessMode("error");
          setMessage(
            body && "error" in body && body.error
              ? body.error
              : "The shared calendar could not be loaded yet.",
          );
          return;
        }
        setCalendarData(body);
        setAccessMode("editor");
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

  const participants = calendarData?.participants ?? previewParticipants;
  const assignments = useMemo(
    () => (calendarData ? aggregateAssignments(calendarData) : previewAssignments),
    [calendarData, previewAssignments],
  );

  const detailMarkers = useMemo(() => {
    const markers: Record<string, { handover: boolean; note: boolean }> = {};
    for (const assignment of calendarData?.assignments ?? []) {
      const marker = markers[assignment.date] ?? { handover: false, note: false };
      marker.handover ||= Boolean(assignment.handoverTime || assignment.handoverLocation);
      marker.note ||= Boolean(assignment.note);
      markers[assignment.date] = marker;
    }
    return markers;
  }, [calendarData]);

  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    for (const event of calendarData?.events ?? []) {
      const end = event.endDate ?? event.startDate;
      for (const day of eachDayOfInterval({
        start: parseISO(event.startDate),
        end: parseISO(end),
      })) {
        const key = keyFor(day);
        (map[key] ??= []).push(event);
      }
    }
    return map;
  }, [calendarData]);

  const today = new Date();
  const todayAssignment = assignments[keyFor(today)];
  const currentEditor = calendarData?.participants.find(
    (participant) => participant.id === calendarData.currentParticipantId,
  );
  const nextHandover = calendarData?.nextHandover ?? null;
  const nextEvent = calendarData?.nextEvent ?? null;

  function ownerLabel(owner: Ownership | undefined) {
    if (!owner) return "Not assigned yet";
    if (owner === "mixed") return "Split between parents";
    return participants.find((participant) => participant.id === owner)?.displayName ?? "Assigned";
  }

  function ownerStyle(owner: Ownership | undefined) {
    if (!owner) return null;
    if (owner === "mixed") return mixedStyle;
    return styleForParticipant(participants, owner);
  }

  function toggleSelectionMode() {
    setSelectionMode((current) => {
      const next = !current;
      if (!next) setSelectedDays([]);
      setDetailsDate(null);
      return next;
    });
  }

  function handleDayClick(day: Date) {
    if (!isSameMonth(day, currentMonth) || saving) return;
    const key = keyFor(day);

    if (selectionMode) {
      setSelectedDays((current) =>
        current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
      );
      return;
    }

    if (accessMode === "editor" && calendarData) {
      setSelectedDays([]);
      setDetailsDate(key);
      return;
    }

    setSelectionMode(true);
    setSelectedDays([key]);
    setMessage("Preview selection mode is on. Choose a parent below to try the calendar.");
  }

  async function applySelected(parentId: string | null) {
    if (selectedDays.length === 0 || saving) return;

    if (accessMode !== "editor") {
      setPreviewAssignments((current) => {
        const next = { ...current };
        for (const day of selectedDays) {
          if (parentId) next[day] = parentId;
          else delete next[day];
        }
        return next;
      });
      setSelectedDays([]);
      setSelectionMode(false);
      setMessage("Preview updated. Sign in with an editor link to save changes.");
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/assignments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dates: selectedDays, parentId }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? "Those dates could not be updated.");

      const count = selectedDays.length;
      setSelectedDays([]);
      setSelectionMode(false);
      setMessage(`${count} ${count === 1 ? "day" : "days"} saved.`);
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Those dates could not be updated.");
    } finally {
      setSaving(false);
    }
  }

  function moveMonth(direction: "previous" | "next") {
    setCurrentMonth((month) => (direction === "previous" ? subMonths(month, 1) : addMonths(month, 1)));
    setSelectedDays([]);
    setSelectionMode(false);
    setDetailsDate(null);
  }

  function goToday() {
    setCurrentMonth(startOfMonth(new Date()));
    setSelectedDays([]);
    setSelectionMode(false);
    setDetailsDate(null);
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-3 py-4 sm:px-6 sm:py-7 lg:px-8">
      <header className="mb-4 rounded-3xl border border-slate-200/80 bg-white p-4 shadow-sm sm:mb-6 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              <UsersRound className="h-4 w-4" /> Shared family calendar
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
                {calendarData?.calendar.name ?? "Our Family Calendar"}
              </h1>
              {accessMode === "checking" ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" />Checking access
                </span>
              ) : accessMode === "editor" ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {currentEditor ? `${currentEditor.displayName} editing` : "Editor access"}
                </span>
              ) : (
                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                  Preview mode
                </span>
              )}
              {calendarData?.recurringScheduleActive ? (
                <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                  Repeating schedule on
                </span>
              ) : null}
            </div>
          </div>

          {accessMode === "editor" ? (
            <div className="flex flex-wrap gap-2">
              <EventPanel onChanged={() => setRefreshKey((value) => value + 1)} />
              <RecurringSchedulePanel />
              <SharePanel />
              <ActivityPanel />
              <SettingsPanel />
            </div>
          ) : null}
        </div>
      </header>

      {message ? (
        <div className="mb-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
          {message}
        </div>
      ) : null}

      <section className="mb-4 grid gap-3 sm:mb-5 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Today</p>
          <div className="mt-2 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
              <CalendarDays className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold text-slate-900">
                {todayAssignment ? `With ${ownerLabel(todayAssignment)}` : ownerLabel(undefined)}
              </p>
              <p className="text-sm text-slate-500">{format(today, "EEEE, d MMMM")}</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Next handover</p>
          {nextHandover ? (
            <>
              <p className="mt-3 font-semibold text-slate-900">
                {format(parseISO(nextHandover.date), "EEE d MMM")} • {nextHandover.handoverTime?.slice(0, 5)}
              </p>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-slate-500">
                <span>With {ownerLabel(nextHandover.parentId)}</span>
                {nextHandover.handoverLocation ? (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" />{nextHandover.handoverLocation}
                  </span>
                ) : null}
              </p>
            </>
          ) : (
            <>
              <p className="mt-3 font-semibold text-slate-900">No handover scheduled</p>
              <p className="mt-1 text-sm text-slate-500">Add a handover time to any assigned day.</p>
            </>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Next event</p>
          {nextEvent ? (
            <>
              <p className="mt-3 truncate font-semibold text-slate-900">{nextEvent.title}</p>
              <p className="mt-1 text-sm text-slate-500">
                {format(parseISO(nextEvent.startDate), "EEEE d MMM")}
                {nextEvent.endDate && nextEvent.endDate !== nextEvent.startDate
                  ? ` – ${format(parseISO(nextEvent.endDate), "d MMM")}`
                  : ""}
              </p>
            </>
          ) : (
            <>
              <p className="mt-3 font-semibold text-slate-900">Nothing coming up</p>
              <p className="mt-1 text-sm text-slate-500">Add school, sport, medical or family events.</p>
            </>
          )}
        </div>
      </section>

      <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-200 px-3 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="flex items-center justify-between gap-2 sm:justify-start">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => moveMonth("previous")}
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div className="min-w-40 text-center sm:min-w-48">
              <h2 className="text-lg font-semibold text-slate-900 sm:text-xl">
                {format(currentMonth, "MMMM yyyy")}
              </h2>
            </div>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => moveMonth("next")}
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 sm:justify-end">
            <div className="mr-1 flex items-center gap-3 text-sm">
              {participants.slice(0, 2).map((participant) => {
                const style = styleForParticipant(participants, participant.id);
                return (
                  <div key={participant.id} className="flex items-center gap-1.5 text-slate-600">
                    <span className={`h-2.5 w-2.5 rounded-full ${style.dot}`} />
                    {participant.displayName}
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              onClick={toggleSelectionMode}
              aria-pressed={selectionMode}
              className={`inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 text-sm font-semibold transition ${
                selectionMode
                  ? "border-blue-600 bg-blue-600 text-white hover:bg-blue-700"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              <CheckSquare2 className="h-4 w-4" />
              {selectionMode ? "Done selecting" : "Select days"}
            </button>
            <button
              type="button"
              onClick={goToday}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-slate-900 px-3 text-sm font-semibold text-white hover:bg-slate-800"
            >
              <RotateCcw className="h-4 w-4" />Today
            </button>
          </div>
        </div>

        <div className="px-2 pb-2 pt-3 sm:px-4 sm:pb-4">
          <p className="mb-3 px-1 text-sm text-slate-500">
            {selectionMode
              ? "Selection mode: tap any dates you want to update together, then choose a parent or Clear below."
              : accessMode === "editor"
                ? "Tap a day to edit its parent, handover details and note. Use Select days for bulk changes."
                : "Tap a day to try assigning it in preview mode. Shared events appear in blue."}
          </p>

          <div className="grid grid-cols-7 gap-1 sm:gap-2" role="grid" aria-label={format(currentMonth, "MMMM yyyy")}>
            {weekdays.map((weekday) => (
              <div
                key={weekday}
                role="columnheader"
                className="pb-1 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-400 sm:text-xs"
              >
                {weekday}
              </div>
            ))}

            {calendarDays.map((day) => {
              const key = keyFor(day);
              const assignment = assignments[key];
              const selected = selectionMode && selectedDays.includes(key);
              const inMonth = isSameMonth(day, currentMonth);
              const isToday = isSameDay(day, today);
              const style = ownerStyle(assignment);
              const label = ownerLabel(assignment);
              const marker = detailMarkers[key];
              const dayEvents = eventsByDate[key] ?? [];

              return (
                <button
                  key={key}
                  type="button"
                  role="gridcell"
                  disabled={!inMonth || saving}
                  aria-selected={selected}
                  aria-label={`${format(day, "EEEE d MMMM")}, ${assignment ? label : "unassigned"}${dayEvents.length ? `, ${dayEvents.length} event${dayEvents.length === 1 ? "" : "s"}` : ""}`}
                  onClick={() => handleDayClick(day)}
                  className={`relative min-h-20 rounded-xl border p-1.5 text-left transition sm:min-h-28 sm:rounded-2xl sm:p-2.5 ${
                    style?.cell ?? "border-slate-200 bg-white"
                  } ${inMonth ? "hover:-translate-y-0.5 hover:shadow-sm" : "cursor-default opacity-30"} ${
                    selected ? "ring-2 ring-blue-500 ring-offset-1" : ""
                  } ${selectionMode && inMonth ? "cursor-pointer" : ""}`}
                >
                  <div className="flex items-start justify-between gap-1">
                    <span
                      className={`flex h-7 min-w-7 items-center justify-center rounded-full text-sm font-semibold ${
                        isToday ? "bg-slate-900 text-white" : "text-slate-700"
                      }`}
                    >
                      {format(day, "d")}
                    </span>
                    {selected ? (
                      <span className="rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                        ✓
                      </span>
                    ) : null}
                  </div>

                  {assignment && inMonth && style ? (
                    <div className={`mt-1.5 inline-flex max-w-full items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold sm:text-xs ${style.pill}`}>
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${style.dot}`} />
                      <span className="truncate">{assignment === "mixed" ? "Split" : label}</span>
                    </div>
                  ) : null}

                  {dayEvents[0] && inMonth ? (
                    <div className="mt-1.5 max-w-full truncate rounded-lg bg-sky-100 px-1.5 py-1 text-[9px] font-semibold text-sky-800 sm:text-[11px]">
                      <CalendarDays className="mr-1 inline h-3 w-3" />
                      {dayEvents[0].title}
                    </div>
                  ) : null}
                  {dayEvents.length > 1 && inMonth ? (
                    <span className="mt-1 block text-[9px] font-semibold text-sky-700">
                      +{dayEvents.length - 1} more
                    </span>
                  ) : null}

                  {inMonth && marker ? (
                    <div className="absolute bottom-1.5 right-1.5 flex items-center gap-1 text-slate-500 sm:bottom-2 sm:right-2">
                      {marker.handover ? <Clock3 className="h-3.5 w-3.5" /> : null}
                      {marker.note ? <StickyNote className="h-3.5 w-3.5" /> : null}
                    </div>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {selectionMode && selectedDays.length > 0 ? (
        <div className="sticky bottom-3 z-20 mx-auto mt-4 flex max-w-4xl flex-col gap-3 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-xl backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div className="px-1">
            <p className="font-semibold text-slate-900">
              {selectedDays.length} {selectedDays.length === 1 ? "day" : "days"} selected
            </p>
            <button
              type="button"
              disabled={saving}
              onClick={() => setSelectedDays([])}
              className="text-sm font-medium text-slate-500 hover:underline disabled:opacity-50"
            >
              Clear selection
            </button>
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            {participants.slice(0, 2).map((participant) => {
              const style = styleForParticipant(participants, participant.id);
              return (
                <button
                  key={participant.id}
                  type="button"
                  disabled={saving}
                  onClick={() => void applySelected(participant.id)}
                  className={`min-h-11 rounded-xl px-3 text-sm font-semibold transition disabled:opacity-50 ${style.button}`}
                >
                  {saving ? "Saving…" : participant.displayName}
                </button>
              );
            })}
            <button
              type="button"
              disabled={saving}
              onClick={() => void applySelected(null)}
              className="min-h-11 rounded-xl bg-slate-100 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Clear"}
            </button>
          </div>
        </div>
      ) : null}

      {detailsDate && calendarData ? (
        <DayDetailsPanel
          key={`${detailsDate}-${refreshKey}`}
          date={detailsDate}
          participants={calendarData.participants}
          assignments={calendarData.assignments}
          activeChildCount={calendarData.children.length}
          onClose={() => setDetailsDate(null)}
          onSaved={(savedMessage) => {
            setDetailsDate(null);
            setSelectedDays([]);
            setMessage(savedMessage);
            setRefreshKey((value) => value + 1);
          }}
        />
      ) : null}

      <p className="mx-auto mt-5 max-w-2xl text-center text-xs leading-5 text-slate-400">
        {accessMode === "editor"
          ? `Changes are saved to the shared calendar${calendarData?.children.length ? ` for ${calendarData.children.length} active ${calendarData.children.length === 1 ? "child" : "children"}` : ""}.`
          : "Preview changes stay on this device. A secure editor link unlocks the shared calendar."}
      </p>
    </main>
  );
}
