"use client";

import { addDays, format, isValid, parseISO, startOfWeek } from "date-fns";
import { CalendarRange, LoaderCircle, Pencil, Plus, Repeat2, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const focusableSelector = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

type Participant = {
  id: string;
  displayName: string;
  colorKey: string;
};

type ScheduleSlot = {
  morningParentId: string | null;
  afternoonParentId: string | null;
};

type SavedSchedule = {
  scheduleId: string;
  anchorDate: string;
  endDate: string | null;
  pattern: ScheduleSlot[];
  createdAt: string;
};

type SchedulePayload = {
  schedules: SavedSchedule[];
  participants: Participant[];
  currentParticipantId: string | null;
};

function defaultAnchorDate() {
  return format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");
}

function emptySlot(): ScheduleSlot {
  return { morningParentId: null, afternoonParentId: null };
}

function fullDaySlot(parentId: string): ScheduleSlot {
  return { morningParentId: parentId, afternoonParentId: parentId };
}

function emptyPattern() {
  return Array.from({ length: 14 }, () => emptySlot());
}

function slotMatches(a: ScheduleSlot, b: ScheduleSlot) {
  return a.morningParentId === b.morningParentId && a.afternoonParentId === b.afternoonParentId;
}

function statusFor(schedule: SavedSchedule) {
  const today = format(new Date(), "yyyy-MM-dd");
  if (schedule.endDate && schedule.endDate < today) return "ended" as const;
  if (schedule.anchorDate > today) return "upcoming" as const;
  return "current" as const;
}

function statusClasses(status: ReturnType<typeof statusFor>) {
  if (status === "current") return "bg-emerald-100 text-emerald-800";
  if (status === "upcoming") return "bg-blue-100 text-blue-800";
  return "bg-slate-100 text-slate-600";
}

function scheduleRangeLabel(schedule: SavedSchedule) {
  const start = format(parseISO(schedule.anchorDate), "d MMM yyyy");
  const end = schedule.endDate ? format(parseISO(schedule.endDate), "d MMM yyyy") : "No end date";
  return `${start} – ${end}`;
}

function slotColor(participants: Participant[], parentId: string | null) {
  const index = participants.findIndex((participant) => participant.id === parentId);
  if (index === 0) return "bg-emerald-100";
  if (index === 1) return "bg-violet-100";
  return "bg-white";
}

export function RecurringSchedulePanel({ onChanged }: { onChanged?: () => void }) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const savingRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [currentParticipantId, setCurrentParticipantId] = useState<string | null>(null);
  const [schedules, setSchedules] = useState<SavedSchedule[]>([]);
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [anchorDate, setAnchorDate] = useState(defaultAnchorDate);
  const [endDate, setEndDate] = useState("");
  const [pattern, setPattern] = useState<ScheduleSlot[]>(emptyPattern);
  const [reason, setReason] = useState("");
  const [pendingDeleteScheduleId, setPendingDeleteScheduleId] = useState<string | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    savingRef.current = saving;
  }, [saving]);

  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      const dialog = dialogRef.current;
      if (!dialog) return;
      if (event.key === "Escape") {
        if (!savingRef.current) {
          event.preventDefault();
          setOpen(false);
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
      const activeElement = document.activeElement;
      if (event.shiftKey && (activeElement === first || !dialog.contains(activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [open]);

  const me = useMemo(
    () => participants.find((participant) => participant.id === currentParticipantId) ?? participants[0] ?? null,
    [participants, currentParticipantId],
  );
  const otherParent = useMemo(
    () => participants.find((participant) => participant.id !== me?.id) ?? null,
    [participants, me],
  );

  const previewWeeks = useMemo(() => {
    const parsed = parseISO(anchorDate);
    if (!isValid(parsed) || pattern.length !== 14) return [];
    const monday = startOfWeek(parsed, { weekStartsOn: 1 });
    return Array.from({ length: 4 }, (_, weekIndex) =>
      Array.from({ length: 7 }, (_, dayIndex) => {
        const offset = weekIndex * 7 + dayIndex;
        const date = addDays(monday, offset);
        const dateKey = format(date, "yyyy-MM-dd");
        const ended = Boolean(endDate && dateKey > endDate);
        return { date, slot: ended ? emptySlot() : (pattern[offset % 14] ?? emptySlot()), ended };
      }),
    );
  }, [anchorDate, endDate, pattern]);

  async function loadSchedules() {
    const response = await fetch("/api/recurring-schedule", { cache: "no-store" });
    const body = (await response.json().catch(() => null)) as SchedulePayload | { error?: string } | null;
    if (!response.ok || !body || !("schedules" in body)) {
      throw new Error(body && "error" in body && body.error ? body.error : "The repeating schedules could not be loaded.");
    }
    setParticipants(body.participants.slice(0, 2));
    setCurrentParticipantId(body.currentParticipantId ?? null);
    setSchedules(body.schedules);
    return body;
  }

  async function openPanel() {
    setOpen(true);
    setLoading(true);
    setMessage(null);
    setEditorOpen(false);
    try {
      await loadSchedules();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The repeating schedules could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  function startNewSchedule() {
    setEditingScheduleId(null);
    setAnchorDate(defaultAnchorDate());
    setEndDate("");
    setPattern(emptyPattern());
    setReason("");
    setMessage(null);
    setEditorOpen(true);
  }

  function editSchedule(schedule: SavedSchedule) {
    setEditingScheduleId(schedule.scheduleId);
    setAnchorDate(schedule.anchorDate);
    setEndDate(schedule.endDate ?? "");
    setPattern(schedule.pattern.length === 14 ? schedule.pattern.map((slot) => ({ ...slot })) : emptyPattern());
    setReason("");
    setMessage(null);
    setEditorOpen(true);
  }

  function labelFor(parentId: string | null) {
    if (!parentId) return "Unassigned";
    if (parentId === currentParticipantId) return "You";
    return "Them";
  }

  function slotLabel(slot: ScheduleSlot) {
    if (!slot.morningParentId && !slot.afternoonParentId) return "Unassigned";
    if (slot.morningParentId && slot.morningParentId === slot.afternoonParentId) {
      return `Full day ${labelFor(slot.morningParentId)}`;
    }
    return `${labelFor(slot.morningParentId)} → ${labelFor(slot.afternoonParentId)}`;
  }

  function cycleSlot(slotIndex: number) {
    if (!me || saving) return;
    const states: ScheduleSlot[] = otherParent
      ? [
          fullDaySlot(me.id),
          fullDaySlot(otherParent.id),
          { morningParentId: me.id, afternoonParentId: otherParent.id },
          { morningParentId: otherParent.id, afternoonParentId: me.id },
          emptySlot(),
        ]
      : [fullDaySlot(me.id), emptySlot()];

    setPattern((current) => {
      const next = current.map((slot) => ({ ...slot }));
      const currentIndex = states.findIndex((state) => slotMatches(state, next[slotIndex]));
      next[slotIndex] = states[currentIndex < 0 ? 0 : (currentIndex + 1) % states.length];
      return next;
    });
  }

  function applyWeekOnWeekOff() {
    if (!me || !otherParent) return;
    setPattern([
      ...Array.from({ length: 7 }, () => fullDaySlot(me.id)),
      ...Array.from({ length: 7 }, () => fullDaySlot(otherParent.id)),
    ]);
  }

  function applyAlternatingWeekends() {
    if (!me || !otherParent) return;
    const next = emptyPattern();
    next[5] = fullDaySlot(me.id);
    next[6] = fullDaySlot(me.id);
    next[12] = fullDaySlot(otherParent.id);
    next[13] = fullDaySlot(otherParent.id);
    setPattern(next);
  }

  function copyWeekOne() {
    setPattern((current) => [
      ...current.slice(0, 7).map((slot) => ({ ...slot })),
      ...current.slice(0, 7).map((slot) => ({ ...slot })),
    ]);
  }

  async function saveSchedule() {
    if (saving) return;
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/recurring-schedule", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scheduleId: editingScheduleId,
          anchorDate,
          endDate: endDate || null,
          pattern,
          reason: deleteReason.trim() || null,
        }),
      });
      const body = (await response.json().catch(() => null)) as
        | { error?: string; pending?: boolean; approverName?: string | null }
        | null;
      if (!response.ok) throw new Error(body?.error ?? "The repeating schedule could not be saved.");
      await loadSchedules();
      setEditorOpen(false);
      setEditingScheduleId(null);
      setReason("");
      setMessage(
        body?.pending
          ? body.approverName
            ? `Schedule change sent to ${body.approverName} for approval.`
            : "Schedule change sent for approval."
          : "Schedule saved. It will take effect automatically on its start date.",
      );
      onChanged?.();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The repeating schedule could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  function startDeleteSchedule(schedule: SavedSchedule) {
    if (saving) return;
    setPendingDeleteScheduleId(schedule.scheduleId);
    setDeleteReason("");
    setMessage(null);
  }

  async function deleteSchedule(schedule: SavedSchedule) {
    if (saving) return;
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/recurring-schedule", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scheduleId: schedule.scheduleId,
          reason: reason.trim() || null,
        }),
      });
      const body = (await response.json().catch(() => null)) as
        | { error?: string; pending?: boolean; approverName?: string | null }
        | null;
      if (!response.ok) throw new Error(body?.error ?? "That saved schedule could not be deleted.");
      await loadSchedules();
      if (editingScheduleId === schedule.scheduleId) {
        setEditorOpen(false);
        setEditingScheduleId(null);
        setReason("");
      }
      setPendingDeleteScheduleId(null);
      setDeleteReason("");
      setMessage(
        body?.pending
          ? body.approverName
            ? `Schedule cancellation sent to ${body.approverName} for approval.`
            : "Schedule cancellation sent for approval."
          : "Schedule deleted. Manual calendar changes are unchanged.",
      );
      onChanged?.();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "That saved schedule could not be deleted.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button type="button" onClick={() => void openPanel()} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50">
        <Repeat2 className="h-4 w-4" aria-hidden="true" /><span>Schedules</span>
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/35 p-0 backdrop-blur-sm sm:items-center sm:p-6">
          <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="repeat-title" aria-describedby="repeat-description" aria-busy={loading || saving} tabIndex={-1} className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700"><CalendarRange className="h-5 w-5" aria-hidden="true" /></div>
                <h2 id="repeat-title" className="text-xl font-semibold text-slate-900">Repeating schedules</h2>
                <p id="repeat-description" className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">Keep your current plan and prepare the next one in advance. When both parents are linked, schedule changes stay pending until approved.</p>
              </div>
              <button ref={closeButtonRef} type="button" aria-label="Close repeating schedules" disabled={saving} onClick={() => setOpen(false)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 disabled:opacity-50"><X className="h-5 w-5" aria-hidden="true" /></button>
            </div>

            {message ? <p role="status" aria-live="polite" className="mt-4 rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-700">{message}</p> : null}

            {loading ? (
              <div role="status" className="mt-8 flex items-center gap-2 rounded-2xl bg-slate-50 px-4 py-5 text-sm text-slate-600"><LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />Loading schedules…</div>
            ) : !editorOpen ? (
              <>
                <div className="mt-6 flex items-center justify-between gap-3">
                  <div><p className="text-sm font-semibold text-slate-900">Saved schedules</p><p className="text-xs leading-5 text-slate-500">Schedules cannot overlap. Give the current plan an end date before a new plan begins.</p></div>
                  <button type="button" disabled={saving || participants.length === 0} onClick={startNewSchedule} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"><Plus className="h-4 w-4" aria-hidden="true" />New schedule</button>
                </div>

                <div className="mt-4 space-y-3">
                  {schedules.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-7 text-center"><p className="font-semibold text-slate-800">No repeating schedules yet</p><p className="mt-1 text-sm text-slate-500">Create one now, or set up a future plan before your current arrangement changes.</p></div>
                  ) : schedules.map((schedule, index) => {
                    const status = statusFor(schedule);
                    const assignedDays = schedule.pattern.filter((slot) => slot.morningParentId || slot.afternoonParentId).length;
                    return (
                      <div key={schedule.scheduleId} className="rounded-2xl border border-slate-200 bg-white p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-slate-900">Schedule {index + 1}</p><span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${statusClasses(status)}`}>{status}</span></div>
                            <p className="mt-1 text-sm text-slate-600">{scheduleRangeLabel(schedule)}</p>
                            <p className="mt-1 text-xs text-slate-500">{assignedDays} of 14 fortnight days assigned</p>
                          </div>
                          <div className="flex gap-2">
                            <button type="button" disabled={saving} onClick={() => editSchedule(schedule)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Pencil className="h-4 w-4" aria-hidden="true" />Edit</button>
                            <button type="button" disabled={saving} onClick={() => startDeleteSchedule(schedule)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"><Trash2 className="h-4 w-4" aria-hidden="true" />Delete</button>
                          </div>
                        </div>
                        {pendingDeleteScheduleId === schedule.scheduleId ? (
                          <div className="mt-4 rounded-xl border border-rose-100 bg-rose-50/60 p-3">
                            <p className="text-sm font-semibold text-slate-900">Cancel this repeating schedule?</p>
                            <p className="mt-1 text-xs text-slate-600">The agreed schedule stays active until the cancellation is approved. Manual day changes are not removed.</p>
                            <label className="mt-3 block">
                              <span className="text-xs font-semibold text-slate-700">Reason <span className="font-normal text-slate-400">(optional)</span></span>
                              <input
                                type="text"
                                maxLength={500}
                                value={deleteReason}
                                disabled={saving}
                                onChange={(event) => setDeleteReason(event.target.value)}
                                placeholder="e.g. Replacing it with the new term schedule"
                                className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200 disabled:opacity-60"
                              />
                            </label>
                            <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                              <button
                                type="button"
                                disabled={saving}
                                onClick={() => {
                                  setPendingDeleteScheduleId(null);
                                  setDeleteReason("");
                                }}
                                className="min-h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                              >
                                Keep schedule
                              </button>
                              <button
                                type="button"
                                disabled={saving}
                                onClick={() => void deleteSchedule(schedule)}
                                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                              >
                                {saving ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Trash2 className="h-4 w-4" aria-hidden="true" />}
                                Submit cancellation
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <>
                <div className="mt-6 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{editingScheduleId ? "Edit schedule" : "New schedule"}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">Tap each day to cycle: Full day You → Full day Them → You → Them → Them → You → Unassigned. Manual calendar changes still take priority.</p>
                  </div>
                  <button type="button" disabled={saving} onClick={() => setEditorOpen(false)} className="min-h-10 rounded-xl px-3 text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50">Back to schedules</button>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <label className="block"><span className="text-xs font-semibold uppercase tracking-wide text-slate-500">First week starts</span><input type="date" value={anchorDate} disabled={saving} onChange={(event) => setAnchorDate(event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base font-medium text-slate-800 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200" /><span className="mt-1 block text-xs text-slate-400">The pattern starts on the Monday of this week.</span></label>
                  <label className="block"><span className="text-xs font-semibold uppercase tracking-wide text-slate-500">End date</span><input type="date" value={endDate} min={anchorDate} disabled={saving} onChange={(event) => setEndDate(event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base font-medium text-slate-800 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200" /><span className="mt-1 block text-xs text-slate-400">Optional for the final schedule. A later schedule cannot overlap an open-ended one.</span></label>
                </div>

                <label className="mt-4 block">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Reason for change <span className="font-normal normal-case tracking-normal text-slate-400">(optional)</span>
                  </span>
                  <textarea
                    rows={2}
                    maxLength={500}
                    value={reason}
                    disabled={saving}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="e.g. New school-term arrangement"
                    className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200 disabled:opacity-60"
                  />
                  <span className="mt-1 block text-xs text-slate-400">
                    Used only if the other parent needs to approve this schedule change.
                  </span>
                </label>

                <div className="mt-5 flex flex-wrap gap-2">
                  <button type="button" disabled={saving || !me || !otherParent} onClick={applyWeekOnWeekOff} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40">Week on / week off</button>
                  <button type="button" disabled={saving || !me || !otherParent} onClick={applyAlternatingWeekends} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40">Alternate weekends</button>
                  <button type="button" disabled={saving} onClick={copyWeekOne} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40">Copy week 1 to week 2</button>
                  <button type="button" disabled={saving} onClick={() => setPattern(emptyPattern())} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50 disabled:opacity-40">Clear pattern</button>
                </div>

                <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
                  <div className="grid grid-cols-[3.5rem_1fr_1fr] bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500"><span>Day</span><span>Week 1</span><span>Week 2</span></div>
                  {weekdays.map((weekday, index) => (
                    <div key={weekday} className="grid grid-cols-[3.5rem_1fr_1fr] items-center gap-2 border-t border-slate-100 px-3 py-2">
                      <span className="text-sm font-semibold text-slate-600">{weekday}</span>
                      {[index, index + 7].map((slotIndex) => {
                        const slot = pattern[slotIndex] ?? emptySlot();
                        return (
                          <button key={slotIndex} type="button" disabled={saving || participants.length === 0} onClick={() => cycleSlot(slotIndex)} className="relative min-h-12 overflow-hidden rounded-xl border border-slate-200 bg-white px-2 text-left text-xs font-semibold text-slate-800 transition hover:ring-2 hover:ring-slate-200 disabled:opacity-40" aria-label={`${weekday}, ${slotIndex < 7 ? "week 1" : "week 2"}: ${slotLabel(slot)}. Tap to change.`}>
                            <span className={`pointer-events-none absolute inset-x-0 top-0 h-1/2 ${slotColor(participants, slot.morningParentId)}`} aria-hidden="true" />
                            <span className={`pointer-events-none absolute inset-x-0 bottom-0 h-1/2 ${slotColor(participants, slot.afternoonParentId)}`} aria-hidden="true" />
                            {slot.morningParentId !== slot.afternoonParentId ? <span className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-white/90" aria-hidden="true" /> : null}
                            <span className="relative z-10 block leading-4">{slotLabel(slot)}</span>
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>

                <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
                  <div className="flex flex-wrap items-end justify-between gap-2"><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Schedule preview</p><p className="mt-1 text-sm font-semibold text-slate-900">First four weeks</p></div><p className="text-xs text-slate-500">{endDate ? `Stops after ${format(parseISO(endDate), "d MMM yyyy")}` : "Repeats until you end or delete it"}</p></div>
                  <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase text-slate-400 sm:text-xs">{weekdays.map((weekday) => <span key={weekday}>{weekday}</span>)}</div>
                  <div className="mt-1 space-y-1.5">
                    {previewWeeks.map((week, weekIndex) => (
                      <div key={weekIndex} className="grid grid-cols-7 gap-1">
                        {week.map((item) => (
                          <div key={format(item.date, "yyyy-MM-dd")} className={`relative min-h-14 overflow-hidden rounded-lg border px-1 py-1.5 text-center sm:min-h-16 ${item.ended ? "border-slate-200 bg-slate-100 text-slate-400" : "border-slate-200 bg-white text-slate-700"}`}>
                            {!item.ended ? <><span className={`pointer-events-none absolute inset-x-0 top-0 h-1/2 ${slotColor(participants, item.slot.morningParentId)}`} aria-hidden="true" /><span className={`pointer-events-none absolute inset-x-0 bottom-0 h-1/2 ${slotColor(participants, item.slot.afternoonParentId)}`} aria-hidden="true" />{item.slot.morningParentId !== item.slot.afternoonParentId ? <span className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-white/90" aria-hidden="true" /> : null}</> : null}
                            <span className="relative z-10 block text-[10px] font-semibold opacity-70 sm:text-xs">{format(item.date, "d MMM")}</span>
                            <span className="relative z-10 mt-1 block text-[8px] font-semibold leading-3 sm:text-[10px]">{item.ended ? "Ended" : slotLabel(item.slot)}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <button type="button" disabled={saving} onClick={() => setEditorOpen(false)} className="min-h-12 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
                  <button type="button" disabled={saving || participants.length === 0} onClick={() => void saveSchedule()} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">{saving ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Repeat2 className="h-4 w-4" aria-hidden="true" />}{editingScheduleId ? "Save changes" : "Save schedule"}</button>
                </div>
              </>
            )}
          </section>
        </div>
      ) : null}
    </>
  );
}
