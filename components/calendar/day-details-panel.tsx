"use client";

import { Clock3, MapPin, StickyNote, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

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

type AssignmentPeriod = "full_day" | "morning" | "afternoon";
type SlotValue = string | null | "";

type DayDetailsPanelProps = {
  date: string;
  participants: Participant[];
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

const periodLabels: Record<AssignmentPeriod, string> = {
  full_day: "Full day",
  morning: "Morning",
  afternoon: "Afternoon",
};

export function DayDetailsPanel({
  date,
  participants,
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

  const dayAssignments = useMemo(
    () => assignments.filter((assignment) => assignment.date === date),
    [assignments, date],
  );

  const initialState = useMemo(() => {
    const slotValue = (field: "morningParentId" | "afternoonParentId"): SlotValue => {
      const values: Array<string | null> = dayAssignments.map(
        (assignment) => assignment[field] ?? null,
      );
      while (values.length < activeChildCount) values.push(null);
      if (values.length === 0) return null;
      const unique = new Set(values);
      return unique.size === 1 ? values[0] : "";
    };

    const morningParentId = slotValue("morningParentId");
    const afternoonParentId = slotValue("afternoonParentId");
    const fullDayParentId: SlotValue =
      morningParentId !== "" &&
      afternoonParentId !== "" &&
      morningParentId === afternoonParentId
        ? morningParentId
        : "";

    const commonValue = <K extends "handoverTime" | "handoverLocation" | "note">(key: K) => {
      if (dayAssignments.length === 0) return null;
      const values = new Set(dayAssignments.map((assignment) => assignment[key] ?? null));
      return values.size === 1 ? [...values][0] : null;
    };

    return {
      isMixed:
        morningParentId === "" ||
        afternoonParentId === "" ||
        morningParentId !== afternoonParentId,
      fullDayParentId,
      morningParentId,
      afternoonParentId,
      handoverTime: commonValue("handoverTime")?.slice(0, 5) ?? "",
      handoverLocation: commonValue("handoverLocation") ?? "",
      note: commonValue("note") ?? "",
    };
  }, [activeChildCount, dayAssignments]);

  const [period, setPeriod] = useState<AssignmentPeriod>("full_day");
  const [parentId, setParentId] = useState<SlotValue>(initialState.fullDayParentId);
  const [handoverTime, setHandoverTime] = useState(initialState.handoverTime);
  const [handoverLocation, setHandoverLocation] = useState(initialState.handoverLocation);
  const [note, setNote] = useState(initialState.note);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  function labelForSlot(value: SlotValue) {
    if (value === "") return "Mixed";
    if (value === null) return "Unassigned";
    return participants.find((participant) => participant.id === value)?.displayName ?? "Assigned";
  }

  function choosePeriod(nextPeriod: AssignmentPeriod) {
    setPeriod(nextPeriod);
    if (nextPeriod === "full_day") setParentId(initialState.fullDayParentId);
    if (nextPeriod === "morning") setParentId(initialState.morningParentId);
    if (nextPeriod === "afternoon") setParentId(initialState.afternoonParentId);
    setError(null);
  }

  const otherHalfHasAssignment =
    period === "morning"
      ? initialState.afternoonParentId !== null
      : period === "afternoon"
        ? initialState.morningParentId !== null
        : false;
  const projectedAnyAssignment =
    parentId !== "" &&
    (period === "full_day" ? parentId !== null : parentId !== null || otherHalfHasAssignment);
  const detailsDisabled = !projectedAnyAssignment;

  async function save() {
    if (parentId === "" || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/assignment-details", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          date,
          period,
          parentId,
          handoverTime: projectedAnyAssignment && handoverTime ? handoverTime : null,
          handoverLocation:
            projectedAnyAssignment && handoverLocation ? handoverLocation : null,
          note: projectedAnyAssignment && note ? note : null,
        }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(body?.error ?? "That day could not be updated.");
      }

      if (parentId) {
        onSaved(`${periodLabels[period]} assignment saved.`);
      } else if (period === "full_day") {
        onSaved("Day cleared.");
      } else {
        onSaved(`${periodLabels[period]} cleared.`);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That day could not be updated.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/35 sm:items-center sm:p-4">
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="day-details-title"
        aria-describedby={error ? "day-details-error" : undefined}
        aria-busy={submitting}
        tabIndex={-1}
        className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Day details</p>
            <h2 id="day-details-title" className="mt-1 text-2xl font-semibold text-slate-900">
              {new Intl.DateTimeFormat("en-NZ", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
                timeZone: "UTC",
              }).format(new Date(`${date}T00:00:00Z`))}
            </h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="Close day details"
            disabled={submitting}
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm">
          <div>
            <span className="block text-xs font-semibold uppercase tracking-wide text-slate-400">Morning</span>
            <span className="mt-1 block font-semibold text-slate-800">{labelForSlot(initialState.morningParentId)}</span>
          </div>
          <div>
            <span className="block text-xs font-semibold uppercase tracking-wide text-slate-400">Afternoon</span>
            <span className="mt-1 block font-semibold text-slate-800">{labelForSlot(initialState.afternoonParentId)}</span>
          </div>
        </div>

        {initialState.isMixed ? (
          <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
            This day is split or mixed. Choose Full day, Morning or Afternoon so you only change the part you intend to update.
          </div>
        ) : null}

        {error ? (
          <div
            id="day-details-error"
            role="alert"
            className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
          >
            {error}
          </div>
        ) : null}

        <div className="mt-6">
          <p className="text-sm font-semibold text-slate-800">Which part of the day?</p>
          <div className="mt-2 grid grid-cols-3 gap-2" role="group" aria-label="Assignment period">
            {(Object.keys(periodLabels) as AssignmentPeriod[]).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={period === value}
                onClick={() => choosePeriod(value)}
                disabled={submitting}
                className={`min-h-11 rounded-xl border px-2 text-sm font-semibold transition ${
                  period === value
                    ? "border-blue-600 bg-blue-600 text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {periodLabels[value]}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5">
          <p className="text-sm font-semibold text-slate-800">Who has this time?</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {participants.slice(0, 2).map((participant) => (
              <button
                key={participant.id}
                type="button"
                aria-pressed={parentId === participant.id}
                onClick={() => setParentId(participant.id)}
                disabled={readOnly}
                className={`min-h-12 rounded-xl border px-4 text-sm font-semibold transition ${
                  parentId === participant.id
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {participant.displayName}
              </button>
            ))}
            <button
              type="button"
              aria-pressed={parentId === null}
              onClick={() => setParentId(null)}
              disabled={readOnly}
              className={`min-h-12 rounded-xl border px-4 text-sm font-semibold transition ${
                parentId === null
                  ? "border-slate-500 bg-slate-100 text-slate-900"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              Unassigned
            </button>
          </div>
          {parentId === "" ? (
            <p className="mt-2 text-xs text-amber-700">Choose a parent or Unassigned before saving.</p>
          ) : null}
        </div>

        <div className={`mt-6 space-y-4 ${detailsDisabled || readOnly ? "opacity-50" : ""}`}>
          <label className="block">
            <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <Clock3 className="h-4 w-4" aria-hidden="true" />
              Handover time
            </span>
            <input
              type="time"
              value={handoverTime}
              disabled={detailsDisabled || readOnly}
              onChange={(event) => setHandoverTime(event.target.value)}
              className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200 disabled:bg-slate-50"
            />
          </label>

          <label className="block">
            <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <MapPin className="h-4 w-4" aria-hidden="true" />
              Handover location
            </span>
            <input
              type="text"
              maxLength={120}
              value={handoverLocation}
              disabled={detailsDisabled || readOnly}
              placeholder="e.g. School gate, home, rugby club"
              onChange={(event) => setHandoverLocation(event.target.value)}
              className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200 disabled:bg-slate-50"
            />
          </label>

          <label className="block">
            <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <StickyNote className="h-4 w-4" aria-hidden="true" />
              Note
            </span>
            <textarea
              rows={4}
              maxLength={500}
              value={note}
              disabled={detailsDisabled || readOnly}
              placeholder="Short practical note for this day"
              onChange={(event) => setNote(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200 disabled:bg-slate-50"
            />
            <span className="mt-1 block text-right text-xs text-slate-400">{note.length}/500</span>
          </label>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            className="min-h-12 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {readOnly ? "Close" : "Cancel"}
          </button>
          {!readOnly ? (
            <button
              type="button"
              disabled={parentId === "" || submitting}
              onClick={() => void save()}
              className="min-h-12 rounded-xl bg-slate-900 px-5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "Saving…" : `Save ${periodLabels[period].toLowerCase()}`}
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
}
