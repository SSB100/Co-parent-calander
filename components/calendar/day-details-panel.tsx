"use client";

import { CalendarDays, Clock3, LoaderCircle, MapPin, StickyNote, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { EventPanel } from "@/components/calendar/event-panel";
import { ownershipForChoice, type OwnershipChoice } from "@/lib/assignments/ownership";

type Participant = {
  id: string;
  displayName: string;
};

type AssignmentRow = {
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

type DayDetailsPanelProps = {
  date: string;
  participants: Participant[];
  currentParticipantId: string | null;
  assignments: AssignmentRow[];
  activeChildCount: number;
  onClose: () => void;
  onSaved: (message: string) => void;
  readOnly?: boolean;
};

const focusableSelector = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

const categoryLabels: Record<string, string> = {
  school: "School",
  sport: "Sport",
  medical: "Medical",
  birthday: "Birthday",
  holiday: "Holiday",
  activity: "Activity",
  other: "Other",
};

const categoryIcons: Record<string, string> = {
  school: "🏫",
  sport: "⚽",
  medical: "🩺",
  birthday: "🎂",
  holiday: "🌴",
  activity: "⭐",
  other: "📌",
};

function choiceLabel(choice: OwnershipChoice, themName: string) {
  if (choice === "me_full") return "Full day you";
  if (choice === "them_full") return `Full day ${themName}`;
  if (choice === "me_then_them") return `You → ${themName}`;
  if (choice === "them_then_me") return `${themName} → You`;
  return "Unassigned";
}

export function DayDetailsPanel({
  date,
  participants,
  currentParticipantId,
  assignments,
  activeChildCount,
  onClose,
  onSaved,
  readOnly = false,
}: DayDetailsPanelProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const submittingRef = useRef(false);

  const me = useMemo(
    () => participants.find((participant) => participant.id === currentParticipantId) ?? participants[0] ?? null,
    [currentParticipantId, participants],
  );
  const them = useMemo(
    () => participants.find((participant) => participant.id !== me?.id) ?? null,
    [me, participants],
  );

  const dayAssignments = useMemo(
    () => assignments.filter((assignment) => assignment.date === date),
    [assignments, date],
  );

  const initialState = useMemo(() => {
    const slotValue = (field: "morningParentId" | "afternoonParentId") => {
      const values: Array<string | null> = dayAssignments.map((assignment) => assignment[field] ?? null);
      while (values.length < activeChildCount) values.push(null);
      if (values.length === 0) return null;
      const unique = new Set(values);
      return unique.size === 1 ? values[0] : "mixed";
    };

    const morningParentId = slotValue("morningParentId");
    const afternoonParentId = slotValue("afternoonParentId");

    let choice: OwnershipChoice | "mixed" = "mixed";
    if (morningParentId !== "mixed" && afternoonParentId !== "mixed") {
      if (!morningParentId && !afternoonParentId) choice = "unassigned";
      else if (me && morningParentId === me.id && afternoonParentId === me.id) choice = "me_full";
      else if (them && morningParentId === them.id && afternoonParentId === them.id) choice = "them_full";
      else if (me && them && morningParentId === me.id && afternoonParentId === them.id) choice = "me_then_them";
      else if (me && them && morningParentId === them.id && afternoonParentId === me.id) choice = "them_then_me";
    }

    const commonValue = <K extends "handoverTime" | "handoverLocation" | "note">(key: K) => {
      if (dayAssignments.length === 0) return null;
      const values = new Set(dayAssignments.map((assignment) => assignment[key] ?? null));
      return values.size === 1 ? [...values][0] : null;
    };

    return {
      choice,
      handoverTime: commonValue("handoverTime")?.slice(0, 5) ?? "",
      handoverLocation: commonValue("handoverLocation") ?? "",
      note: commonValue("note") ?? "",
    };
  }, [activeChildCount, dayAssignments, me, them]);

  const [choice, setChoice] = useState<OwnershipChoice | "mixed">(initialState.choice);
  const [handoverTime, setHandoverTime] = useState(initialState.handoverTime);
  const [handoverLocation, setHandoverLocation] = useState(initialState.handoverLocation);
  const [note, setNote] = useState(initialState.note);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dayEvents, setDayEvents] = useState<CalendarEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);

  async function refreshDayEvents() {
    setEventsLoading(true);
    try {
      const response = await fetch(`/api/events?date=${encodeURIComponent(date)}`, { cache: "no-store" });
      const body = (await response.json().catch(() => null)) as { events?: CalendarEvent[] } | null;
      if (response.ok) setDayEvents(body?.events ?? []);
    } finally {
      setEventsLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/events?date=${encodeURIComponent(date)}`, { cache: "no-store" })
      .then(async (response) => ({
        response,
        body: (await response.json().catch(() => null)) as { events?: CalendarEvent[] } | null,
      }))
      .then(({ response, body }) => {
        if (!cancelled && response.ok) setDayEvents(body?.events ?? []);
      })
      .finally(() => {
        if (!cancelled) setEventsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [date]);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    submittingRef.current = submitting;
  }, [submitting]);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      const dialog = dialogRef.current;
      if (!dialog) return;
      if (event.key === "Escape") {
        if (!submittingRef.current) {
          event.preventDefault();
          onCloseRef.current();
        }
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector)).filter(
        (element) => element.getClientRects().length > 0,
      );
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, []);

  const selectedOwnership =
    choice !== "mixed" && choice !== "unassigned" && me && them
      ? ownershipForChoice(choice, me.id, them.id)
      : choice === "unassigned"
        ? { morningParentId: null, afternoonParentId: null }
        : choice === "me_full" && me
          ? { morningParentId: me.id, afternoonParentId: me.id }
          : null;
  const hasAssignment = Boolean(selectedOwnership?.morningParentId || selectedOwnership?.afternoonParentId);
  const detailsDisabled = choice === "mixed" || !hasAssignment;

  async function save() {
    if (choice === "mixed" || submitting || !selectedOwnership) return;

    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/assignment-details", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          date,
          ownership: selectedOwnership,
          handoverTime: hasAssignment && handoverTime ? handoverTime : null,
          handoverLocation: hasAssignment && handoverLocation ? handoverLocation : null,
          note: hasAssignment && note ? note : null,
        }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? "That day could not be updated.");

      onSaved(choice === "unassigned" ? "Day cleared." : `${choiceLabel(choice, them?.displayName ?? "them")} saved.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That day could not be updated.");
    } finally {
      setSubmitting(false);
    }
  }

  const choices: Array<{ value: OwnershipChoice; label: string }> = me
    ? them
      ? [
          { value: "me_full", label: "Full day you" },
          { value: "them_full", label: `Full day ${them.displayName}` },
          { value: "me_then_them", label: `You → ${them.displayName}` },
          { value: "them_then_me", label: `${them.displayName} → You` },
          { value: "unassigned", label: "Unassigned" },
        ]
      : [
          { value: "me_full", label: "Full day you" },
          { value: "unassigned", label: "Unassigned" },
        ]
    : [{ value: "unassigned", label: "Unassigned" }];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/35 sm:items-center sm:p-4">
      <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="day-details-title" aria-describedby={error ? "day-details-error" : undefined} aria-busy={submitting} tabIndex={-1} className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Day details</p>
            <h2 id="day-details-title" className="mt-1 text-2xl font-semibold text-slate-900">
              {new Intl.DateTimeFormat("en-NZ", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`))}
            </h2>
          </div>
          <button ref={closeButtonRef} type="button" aria-label="Close day details" disabled={submitting} onClick={onClose} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-50"><X className="h-5 w-5" aria-hidden="true" /></button>
        </div>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Current custody</p>
          <p className="mt-1 font-semibold text-slate-900">{initialState.choice === "mixed" ? "Mixed across children" : choiceLabel(initialState.choice, them?.displayName ?? "them")}</p>
        </div>

        {error ? <div id="day-details-error" role="alert" className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div> : null}

        {!readOnly ? (
          <div className="mt-6">
            <p className="text-sm font-semibold text-slate-800">Custody for this day</p>
            <p className="mt-1 text-xs text-slate-500">Choose the complete day state in one tap.</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2" role="group" aria-label="Custody state">
              {choices.map((item) => (
                <button key={item.value} type="button" aria-pressed={choice === item.value} onClick={() => { setChoice(item.value); setError(null); }} disabled={submitting} className={`min-h-12 rounded-xl border px-3 text-sm font-semibold transition ${choice === item.value ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}>{item.label}</button>
              ))}
            </div>
          </div>
        ) : null}

        <div className={`mt-6 space-y-4 ${detailsDisabled || readOnly ? "opacity-60" : ""}`}>
          <label className="block"><span className="flex items-center gap-2 text-sm font-semibold text-slate-800"><Clock3 className="h-4 w-4" aria-hidden="true" />Handover time</span><input type="time" value={handoverTime} disabled={detailsDisabled || readOnly} onChange={(event) => setHandoverTime(event.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200 disabled:bg-slate-50" /></label>
          <label className="block"><span className="flex items-center gap-2 text-sm font-semibold text-slate-800"><MapPin className="h-4 w-4" aria-hidden="true" />Handover location</span><input type="text" maxLength={120} value={handoverLocation} disabled={detailsDisabled || readOnly} placeholder="e.g. School gate, home, rugby club" onChange={(event) => setHandoverLocation(event.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200 disabled:bg-slate-50" /></label>
          <label className="block"><span className="flex items-center gap-2 text-sm font-semibold text-slate-800"><StickyNote className="h-4 w-4" aria-hidden="true" />Note</span><textarea rows={3} maxLength={500} value={note} disabled={detailsDisabled || readOnly} placeholder="Short practical note for this day" onChange={(event) => setNote(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200 disabled:bg-slate-50" /></label>
        </div>

        <div className="mt-6 border-t border-slate-200 pt-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 font-semibold text-slate-900"><CalendarDays className="h-4 w-4 text-sky-600" aria-hidden="true" />Events on this day</p>
              <p className="mt-1 text-xs text-slate-500">Birthdays, school events, sport, appointments and other shared plans.</p>
            </div>
            {!readOnly ? <EventPanel onChanged={() => void refreshDayEvents()} initialDate={date} includeRangeTools={false} buttonLabel="Create event" /> : null}
          </div>

          <div className="mt-3 space-y-2">
            {eventsLoading ? (
              <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />Loading events…</div>
            ) : dayEvents.length === 0 ? (
              <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">No events on this day.</p>
            ) : dayEvents.map((event) => (
              <div key={event.id} className="rounded-2xl border border-sky-200 bg-sky-50/70 px-4 py-3">
                <div className="flex items-start gap-3">
                  <span className="text-lg" aria-hidden="true">{categoryIcons[event.category] ?? "📌"}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-slate-900">{event.title}</p><span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-sky-700">{categoryLabels[event.category] ?? "Other"}</span></div>
                    {event.description ? <p className="mt-1 text-sm leading-5 text-slate-600">{event.description}</p> : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" disabled={submitting} onClick={onClose} className="min-h-12 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Close</button>
          {!readOnly ? <button type="button" disabled={submitting || choice === "mixed" || !selectedOwnership} onClick={() => void save()} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">{submitting ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}Save day</button> : null}
        </div>
      </section>
    </div>
  );
}
