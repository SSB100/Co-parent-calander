"use client";

import { format, parseISO } from "date-fns";
import { CalendarPlus2, LoaderCircle, Pencil, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { RangeAssignmentPanel } from "@/components/calendar/range-assignment-panel";

type EventCategory =
  | "school"
  | "sport"
  | "medical"
  | "birthday"
  | "holiday"
  | "activity"
  | "other";

type EventRecurrence = "none" | "weekly" | "fortnightly" | "monthly" | "yearly";

type CalendarEvent = {
  id: string;
  title: string;
  description: string | null;
  category: EventCategory;
  startDate: string;
  endDate: string | null;
  recurrence: EventRecurrence;
  recurrenceEndDate: string | null;
};

type EventPanelProps = {
  onChanged?: () => void;
  initialDate?: string;
  includeRangeTools?: boolean;
  buttonLabel?: string;
};

const categoryLabels: Record<EventCategory, string> = {
  school: "School",
  sport: "Sport",
  medical: "Medical",
  birthday: "Birthday",
  holiday: "Holiday",
  activity: "Activity",
  other: "Other",
};

const categoryIcons: Record<EventCategory, string> = {
  school: "🏫",
  sport: "⚽",
  medical: "🩺",
  birthday: "🎂",
  holiday: "🌴",
  activity: "⭐",
  other: "📌",
};

const recurrenceLabels: Record<EventRecurrence, string> = {
  none: "Does not repeat",
  weekly: "Weekly",
  fortnightly: "Fortnightly",
  monthly: "Monthly",
  yearly: "Yearly",
};

const focusableSelector = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function blankForm(initialDate?: string) {
  return {
    title: "",
    description: "",
    category: "activity" as EventCategory,
    startDate: initialDate ?? format(new Date(), "yyyy-MM-dd"),
    endDate: "",
    recurrence: "none" as EventRecurrence,
    recurrenceEndDate: "",
  };
}

export function EventPanel({
  onChanged,
  initialDate,
  includeRangeTools = true,
  buttonLabel = "Create event",
}: EventPanelProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const savingRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(() => blankForm(initialDate));
  const [reason, setReason] = useState("");
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
  }, [open]);

  async function loadEvents() {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/events", { cache: "no-store" });
      const body = (await response.json().catch(() => null)) as { events?: CalendarEvent[]; error?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? "Events could not be loaded.");
      setEvents(body?.events ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Events could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  async function openPanel() {
    setOpen(true);
    setEditingId(null);
    setForm(blankForm(initialDate));
    setReason("");
    await loadEvents();
  }

  function editEvent(event: CalendarEvent) {
    setEditingId(event.id);
    setForm({
      title: event.title,
      description: event.description ?? "",
      category: event.category,
      startDate: event.startDate,
      endDate: event.endDate ?? "",
      recurrence: event.recurrence,
      recurrenceEndDate: event.recurrenceEndDate ?? "",
    });
    setReason("");
    setMessage(null);
  }

  async function saveEvent() {
    if (saving) return;
    setSaving(true);
    setMessage(null);
    try {
      const payload = {
        ...(editingId ? { id: editingId } : {}),
        title: form.title,
        description: form.description || null,
        category: form.category,
        startDate: form.startDate,
        endDate: form.endDate || null,
        recurrence: form.recurrence,
        recurrenceEndDate:
          form.recurrence === "none" ? null : form.recurrenceEndDate || null,
        reason: reason.trim() || null,
      };
      const response = await fetch("/api/events", {
        method: editingId ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await response.json().catch(() => null)) as
        | { error?: string; pending?: boolean; approverName?: string | null }
        | null;
      if (!response.ok) throw new Error(body?.error ?? "The event could not be saved.");

      const wasEditing = Boolean(editingId);
      setEditingId(null);
      setForm(blankForm(initialDate));
      setReason("");
      await loadEvents();
      setMessage(
        body?.pending
          ? body.approverName
            ? `Event change sent to ${body.approverName} for approval.`
            : "Event change sent for approval."
          : wasEditing
            ? "Event updated."
            : "Event added to the shared calendar.",
      );
      onChanged?.();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The event could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteEvent(id: string) {
    if (saving) return;
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/events", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id,
          reason: reason.trim() || null,
        }),
      });
      const body = (await response.json().catch(() => null)) as
        | { error?: string; pending?: boolean; approverName?: string | null }
        | null;
      if (!response.ok) throw new Error(body?.error ?? "The event could not be deleted.");
      if (editingId === id) {
        setEditingId(null);
        setForm(blankForm(initialDate));
        setReason("");
      }
      await loadEvents();
      setMessage(
        body?.pending
          ? body.approverName
            ? `Event cancellation sent to ${body.approverName} for approval.`
            : "Event cancellation sent for approval."
          : "Event removed.",
      );
      onChanged?.();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The event could not be deleted.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void openPanel()}
        className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-sky-600 px-3 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700"
      >
        <CalendarPlus2 className="h-4 w-4" aria-hidden="true" />
        <span>{buttonLabel}</span>
      </button>
      {includeRangeTools ? <RangeAssignmentPanel onChanged={onChanged} /> : null}

      {open ? (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/35 p-0 backdrop-blur-sm sm:items-center sm:p-6">
          <section
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="event-panel-title"
            aria-describedby="event-panel-description"
            aria-busy={loading || saving}
            tabIndex={-1}
            className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sky-700">
                  <CalendarPlus2 className="h-5 w-5" aria-hidden="true" />
                </div>
                <h2 id="event-panel-title" className="text-xl font-semibold text-slate-900">
                  {editingId ? "Edit event" : "Create event"}
                </h2>
                <p id="event-panel-description" className="mt-1 text-sm leading-6 text-slate-500">
                  Add birthdays, school shows, sport, appointments, holidays or anything both parents should see. When both parents are linked, shared event changes wait for approval.
                </p>
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                aria-label="Close event panel"
                disabled={saving}
                onClick={() => setOpen(false)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 disabled:opacity-50"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <label className="sm:col-span-2">
                <span className="text-sm font-semibold text-slate-800">Event name</span>
                <input
                  value={form.title}
                  maxLength={80}
                  onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                  placeholder="e.g. Drake's school production"
                  className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                />
              </label>

              <label>
                <span className="text-sm font-semibold text-slate-800">Type</span>
                <select
                  value={form.category}
                  onChange={(event) => setForm((current) => ({ ...current, category: event.target.value as EventCategory }))}
                  className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                >
                  {(Object.keys(categoryLabels) as EventCategory[]).map((value) => (
                    <option key={value} value={value}>{categoryIcons[value]} {categoryLabels[value]}</option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-2">
                <label>
                  <span className="text-sm font-semibold text-slate-800">Starts</span>
                  <input type="date" value={form.startDate} onChange={(event) => setForm((current) => ({ ...current, startDate: event.target.value }))} className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 px-2 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200" />
                </label>
                <label>
                  <span className="text-sm font-semibold text-slate-800">Event ends</span>
                  <input type="date" value={form.endDate} min={form.startDate} onChange={(event) => setForm((current) => ({ ...current, endDate: event.target.value }))} className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 px-2 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200" />
                </label>
              </div>

              <label>
                <span className="text-sm font-semibold text-slate-800">Repeat</span>
                <select
                  value={form.recurrence}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      recurrence: event.target.value as EventRecurrence,
                      recurrenceEndDate:
                        event.target.value === "none" ? "" : current.recurrenceEndDate,
                    }))
                  }
                  className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                >
                  {(Object.keys(recurrenceLabels) as EventRecurrence[]).map((value) => (
                    <option key={value} value={value}>{recurrenceLabels[value]}</option>
                  ))}
                </select>
              </label>

              {form.recurrence !== "none" ? (
                <label>
                  <span className="text-sm font-semibold text-slate-800">
                    Repeat until <span className="font-normal text-slate-400">(optional)</span>
                  </span>
                  <input
                    type="date"
                    min={form.startDate}
                    value={form.recurrenceEndDate}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        recurrenceEndDate: event.target.value,
                      }))
                    }
                    className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 px-2 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  />
                </label>
              ) : null}

              <label className="sm:col-span-2">
                <span className="text-sm font-semibold text-slate-800">Details</span>
                <textarea
                  rows={3}
                  maxLength={500}
                  value={form.description}
                  onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                  placeholder="Optional time, venue, what to bring, or other practical details"
                  className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                />
              </label>

              <label className="sm:col-span-2">
                <span className="text-sm font-semibold text-slate-800">
                  Reason for change <span className="font-normal text-slate-400">(optional)</span>
                </span>
                <textarea
                  rows={2}
                  maxLength={500}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="e.g. School has changed the show date"
                  className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                />
                <span className="mt-1 block text-xs text-slate-500">
                  Used only if the other parent needs to approve this event change.
                </span>
              </label>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={saving || !form.title.trim() || !form.startDate}
                onClick={() => void saveEvent()}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {saving ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CalendarPlus2 className="h-4 w-4" aria-hidden="true" />}
                {editingId ? "Save changes" : "Create event"}
              </button>
              {editingId ? (
                <button type="button" disabled={saving} onClick={() => { setEditingId(null); setForm(blankForm(initialDate)); setReason(""); setMessage(null); }} className="min-h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                  Cancel edit
                </button>
              ) : null}
            </div>

            {message ? <p role="status" aria-live="polite" className="mt-4 rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-700">{message}</p> : null}

            <div className="mt-6 border-t border-slate-200 pt-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-slate-900">Upcoming events</h3>
                  <p className="text-xs text-slate-500">Visible to everyone who can view this calendar.</p>
                </div>
                {loading ? <LoaderCircle className="h-4 w-4 animate-spin text-slate-400" aria-hidden="true" /> : null}
              </div>

              <div className="mt-3 space-y-2">
                {!loading && events.length === 0 ? <p className="rounded-xl bg-slate-50 px-4 py-4 text-sm text-slate-500">No upcoming events yet.</p> : null}
                {events.map((event) => (
                  <div key={event.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 p-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span aria-hidden="true">{categoryIcons[event.category]}</span>
                        <p className="truncate font-semibold text-slate-900">{event.title}</p>
                        <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700">{categoryLabels[event.category]}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {format(parseISO(event.startDate), "d MMM yyyy")}
                        {event.endDate && event.endDate !== event.startDate ? ` – ${format(parseISO(event.endDate), "d MMM yyyy")}` : ""}
                        {event.recurrence !== "none"
                          ? ` · ${recurrenceLabels[event.recurrence]}${event.recurrenceEndDate ? ` until ${format(parseISO(event.recurrenceEndDate), "d MMM yyyy")}` : ""}`
                          : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button type="button" aria-label={`Edit ${event.title}`} onClick={() => editEvent(event)} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"><Pencil className="h-4 w-4" aria-hidden="true" /></button>
                      <button type="button" aria-label={`Delete ${event.title}`} onClick={() => void deleteEvent(event.id)} className="flex h-9 w-9 items-center justify-center rounded-lg text-rose-600 hover:bg-rose-50"><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
