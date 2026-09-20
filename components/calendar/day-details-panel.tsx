"use client";

import { CalendarDays, Clock3, LoaderCircle, MapPin, StickyNote, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ProposalActions } from "@/components/approvals/proposal-actions";
import { ProposalCard } from "@/components/approvals/proposal-card";
import { EventCategoryIcon } from "@/components/calendar/event-category-icon";
import { EventPanel } from "@/components/calendar/event-panel";
import { AttachmentPanel } from "@/components/attachments/attachment-panel";
import { LinkedItemsPanel } from "@/components/links/linked-items-panel";
import { DayExpenses } from "@/components/expenses/day-expenses";
import { DayResponsibilities } from "@/components/responsibilities/day-responsibilities";
import type { CalendarPendingProposal } from "@/lib/approvals/calendar-pending";
import {
  parentingAssignmentsProposalStateSchema,
  recurringScheduleProposalStateSchema,
  recurringScheduleSnapshotProposalStateSchema,
  sharedEventProposalStateSchema,
} from "@/lib/approvals/calendar-state";
import { ownershipForChoice, type OwnershipChoice } from "@/lib/assignments/ownership";
import {
  normalizeParentColorKey,
  parentColorOptions,
  parentProfileSlotIndex,
  type ParentProfileSlot,
} from "@/lib/parents/identity";

type Participant = {
  id: string;
  displayName: string;
  colorKey?: string;
  profileSlot?: ParentProfileSlot | null;
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
  recurrence?: "none" | "weekly" | "fortnightly" | "monthly" | "yearly";
};

type DayDetailsPanelProps = {
  date: string;
  participants: Participant[];
  currentParticipantId: string | null;
  currentMembershipId: string;
  assignments: AssignmentRow[];
  activeChildCount: number;
  pendingProposals: CalendarPendingProposal[];
  onClose: () => void;
  onSaved: (message: string) => void;
  onProposalChanged: () => void;
  onEventChanged: (message: string) => void;
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


function choiceLabel(choice: OwnershipChoice, themName: string) {
  if (choice === "me_full") return "Full day you";
  if (choice === "them_full") return `Full day ${themName}`;
  if (choice === "me_then_them") return `You → ${themName}`;
  if (choice === "them_then_me") return `${themName} → You`;
  return "Unassigned";
}

function participantChoiceClass(participants: Participant[], participant: Participant | null) {
  if (!participant) return "bg-[#BFEDE6] text-[#243139] hover:bg-[#A9E4DB]";
  const index = participants.findIndex((item) => item.id === participant.id);
  const slotIndex = parentProfileSlotIndex(participant.profileSlot, Math.max(index, 0));
  const key = normalizeParentColorKey(participant.colorKey, slotIndex);
  return (
    parentColorOptions.find((option) => option.key === key)?.buttonClass ??
    "bg-[#BFEDE6] text-[#243139] hover:bg-[#A9E4DB]"
  );
}

function participantLabel(
  participantId: string | null,
  participants: Participant[],
  currentParticipantId: string | null,
) {
  if (!participantId) return "Unassigned";
  if (participantId === currentParticipantId) return "You";
  return (
    participants.find((participant) => participant.id === participantId)?.displayName ??
    "Parent"
  );
}

function assignmentStateSummary(
  state: unknown,
  date: string,
  participants: Participant[],
  currentParticipantId: string | null,
) {
  const parsed = parentingAssignmentsProposalStateSchema.safeParse(state);
  if (!parsed.success) return null;
  const rows = parsed.data.assignments.filter((row) => row.date === date);
  if (rows.length === 0) return null;

  const morningValues = new Set(rows.map((row) => row.morningParentId));
  const afternoonValues = new Set(rows.map((row) => row.afternoonParentId));
  if (morningValues.size !== 1 || afternoonValues.size !== 1) {
    return "Mixed across children";
  }

  const morning = [...morningValues][0] ?? null;
  const afternoon = [...afternoonValues][0] ?? null;
  if (morning === afternoon) {
    return morning
      ? `Full day ${participantLabel(morning, participants, currentParticipantId)}`
      : "Unassigned";
  }

  return `${participantLabel(morning, participants, currentParticipantId)} → ${participantLabel(
    afternoon,
    participants,
    currentParticipantId,
  )}`;
}

function formatProposalDate(date: string) {
  return new Intl.DateTimeFormat("en-NZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

function eventStateSummary(state: unknown) {
  const parsed = sharedEventProposalStateSchema.safeParse(state);
  if (!parsed.success || !parsed.data.event) return null;
  const event = parsed.data.event;
  const range =
    event.endDate && event.endDate !== event.startDate
      ? `${formatProposalDate(event.startDate)} – ${formatProposalDate(event.endDate)}`
      : formatProposalDate(event.startDate);
  const recurrenceLabel =
    event.recurrence === "weekly"
      ? "Weekly"
      : event.recurrence === "fortnightly"
        ? "Fortnightly"
        : event.recurrence === "monthly"
          ? "Monthly"
          : event.recurrence === "yearly"
            ? "Yearly"
            : null;
  const repeat =
    recurrenceLabel
      ? ` · ${recurrenceLabel}${event.recurrenceEndDate ? ` until ${formatProposalDate(event.recurrenceEndDate)}` : ""}`
      : "";
  return `${event.title} · ${range}${repeat}`;
}

function recurringStateSummary(state: unknown) {
  const proposed = recurringScheduleProposalStateSchema.safeParse(state);
  if (proposed.success) {
    if (proposed.data.mode === "delete") return "Cancel repeating schedule";
    const end = proposed.data.endDate
      ? ` to ${formatProposalDate(proposed.data.endDate)}`
      : "";
    return `Fortnightly schedule from ${formatProposalDate(proposed.data.anchorDate)}${end}`;
  }

  const previous = recurringScheduleSnapshotProposalStateSchema.safeParse(state);
  if (previous.success && previous.data.schedule) {
    const end = previous.data.schedule.endDate
      ? ` to ${formatProposalDate(previous.data.schedule.endDate)}`
      : "";
    return `Fortnightly schedule from ${formatProposalDate(
      previous.data.schedule.anchorDate,
    )}${end}`;
  }

  return null;
}

function proposalSummaries(
  proposal: CalendarPendingProposal,
  date: string,
  participants: Participant[],
  currentParticipantId: string | null,
) {
  if (proposal.kind === "parenting") {
    return {
      agreed:
        assignmentStateSummary(
          proposal.previousState,
          date,
          participants,
          currentParticipantId,
        ) ?? "Current agreed schedule",
      proposed:
        assignmentStateSummary(
          proposal.proposedState,
          date,
          participants,
          currentParticipantId,
        ) ?? "Proposed schedule change",
    };
  }

  if (proposal.kind === "event") {
    return {
      agreed:
        eventStateSummary(proposal.previousState) ??
        (proposal.action === "create" ? "Not on the agreed calendar" : "Current event"),
      proposed:
        proposal.action === "delete"
          ? "Cancel event"
          : eventStateSummary(proposal.proposedState) ?? "Proposed event change",
    };
  }

  return {
    agreed: recurringStateSummary(proposal.previousState) ?? "Current repeating schedule",
    proposed: recurringStateSummary(proposal.proposedState) ?? "Proposed repeating schedule",
  };
}

export function DayDetailsPanel({
  date,
  participants,
  currentParticipantId,
  currentMembershipId,
  assignments,
  activeChildCount,
  pendingProposals,
  onClose,
  onSaved,
  onProposalChanged,
  onEventChanged,
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
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dayEvents, setDayEvents] = useState<CalendarEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [deletingEventId, setDeletingEventId] = useState<string | null>(null);
  const [eventMessage, setEventMessage] = useState<string | null>(null);

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

  async function deleteDayEvent(event: CalendarEvent) {
    if (readOnly || submitting || deletingEventId) return;
    const recurring = event.recurrence && event.recurrence !== "none";
    const confirmed = window.confirm(
      recurring
        ? `Delete “${event.title}” and all of its repeated occurrences?`
        : `Delete “${event.title}” from the shared calendar?`,
    );
    if (!confirmed) return;

    setDeletingEventId(event.id);
    setEventMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/events", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: event.id, reason: null }),
      });
      const body = (await response.json().catch(() => null)) as
        | { error?: string; pending?: boolean; approverName?: string | null }
        | null;
      if (!response.ok) {
        throw new Error(body?.error ?? "The event could not be deleted.");
      }

      const message = body?.pending
        ? body.approverName
          ? `Event cancellation sent to ${body.approverName} for approval.`
          : "Event cancellation sent for approval."
        : "Event removed.";

      if (!body?.pending) await refreshDayEvents();
      setEventMessage(message);
      onEventChanged(message);
      window.dispatchEvent(new Event("covie-records-updated"));
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "The event could not be deleted.",
      );
    } finally {
      setDeletingEventId(null);
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
    submittingRef.current = submitting || Boolean(deletingEventId);
  }, [deletingEventId, submitting]);

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
          reason: reason.trim() || null,
        }),
      });
      const body = (await response.json().catch(() => null)) as
        | { error?: string; pending?: boolean; approverName?: string | null }
        | null;
      if (!response.ok) throw new Error(body?.error ?? "That day could not be updated.");

      if (body?.pending) {
        onSaved(
          body.approverName
            ? `Change sent to ${body.approverName} for approval.`
            : "Change sent for approval.",
        );
      } else {
        onSaved(
          choice === "unassigned"
            ? "Day cleared."
            : `${choiceLabel(choice, them?.displayName ?? "them")} saved.`,
        );
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That day could not be updated.");
    } finally {
      setSubmitting(false);
    }
  }

  const choices: Array<{ value: OwnershipChoice; label: string; className: string }> = me
    ? them
      ? [
          { value: "me_full", label: "Full day you", className: participantChoiceClass(participants, me) },
          { value: "them_full", label: `Full day ${them.displayName}`, className: participantChoiceClass(participants, them) },
          { value: "me_then_them", label: `You → ${them.displayName}`, className: "bg-[#FFD0CB] text-[#243139] hover:bg-[#FFC0B9]" },
          { value: "them_then_me", label: `${them.displayName} → You`, className: "bg-[#DDD3FA] text-[#243139] hover:bg-[#CEC1F6]" },
          { value: "unassigned", label: "Unassigned", className: "bg-[#F7DC86] text-[#243139] hover:bg-[#F2D16B]" },
        ]
      : [
          { value: "me_full", label: "Full day you", className: participantChoiceClass(participants, me) },
          { value: "unassigned", label: "Unassigned", className: "bg-[#F7DC86] text-[#243139] hover:bg-[#F2D16B]" },
        ]
    : [{ value: "unassigned", label: "Unassigned", className: "bg-[#F7DC86] text-[#243139] hover:bg-[#F2D16B]" }];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#243139]/35 sm:items-center sm:p-4">
      <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="day-details-title" aria-describedby={error ? "day-details-error" : undefined} aria-busy={submitting || Boolean(deletingEventId)} tabIndex={-1} className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-3xl border-2 border-[#243139] bg-white p-5 shadow-[7px_7px_0_#765ED6] sm:rounded-3xl sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="day-details-title" className="text-2xl font-semibold text-slate-900">
              {new Intl.DateTimeFormat("en-NZ", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`))}
            </h2>
          </div>
          <button ref={closeButtonRef} type="button" aria-label="Close day details" disabled={submitting || Boolean(deletingEventId)} onClick={onClose} className="covie-icon-button flex h-10 w-10 shrink-0 items-center justify-center rounded-xl disabled:opacity-50"><X className="h-5 w-5" aria-hidden="true" /></button>
        </div>

        <div className="mt-5 border-b border-slate-200 pb-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 font-semibold text-slate-900">
                <CalendarDays className="h-4 w-4 text-[#D94D43]" aria-hidden="true" />
                Events
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Shared plans recorded for this day.
              </p>
            </div>
            {!readOnly ? (
              <EventPanel
                onChanged={() => {
                  void refreshDayEvents();
                  onEventChanged("Events updated.");
                  window.dispatchEvent(new Event("covie-records-updated"));
                }}
                initialDate={date}
                includeRangeTools={false}
                buttonLabel="Create event"
              />
            ) : null}
          </div>

          {eventMessage ? (
            <p role="status" className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-700">
              {eventMessage}
            </p>
          ) : null}

          <div className="mt-3 space-y-2">
            {eventsLoading ? (
              <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
                <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                Loading events…
              </div>
            ) : dayEvents.length === 0 ? (
              <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
                No events on this day.
              </p>
            ) : (
              dayEvents.map((event) => (
                <div key={event.id} className="rounded-xl border border-[#F4C64E] bg-[#FFF9DF] px-4 py-3">
                  <div className="flex items-start gap-3">
                    <span className="text-lg" aria-hidden="true">
                      <EventCategoryIcon category={event.category} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-slate-900">{event.title}</p>
                        <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                          {categoryLabels[event.category] ?? "Other"}
                        </span>
                      </div>
                      {event.description ? (
                        <p className="mt-1 text-sm leading-5 text-slate-600">{event.description}</p>
                      ) : null}
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <AttachmentPanel
                          entityType="event"
                          entityId={event.id}
                          defaultCategory="school_form"
                          title="Files"
                          compact
                        />
                        <LinkedItemsPanel
                          entityType="event"
                          entityId={event.id}
                          title="Related"
                          compact
                        />
                        {!readOnly ? (
                          <button
                            type="button"
                            onClick={() => void deleteDayEvent(event)}
                            disabled={submitting || Boolean(deletingEventId)}
                            className="ml-auto inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                          >
                            {deletingEventId === event.id ? (
                              <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            )}
                            Delete event
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Current custody</p>
          <p className="mt-1 font-semibold text-slate-900">{initialState.choice === "mixed" ? "Mixed across children" : choiceLabel(initialState.choice, them?.displayName ?? "them")}</p>
        </div>

        {error ? <div id="day-details-error" role="alert" className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div> : null}

        {pendingProposals.length > 0 ? (
          <div className="mt-5 space-y-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">Pending changes</p>
              <p className="mt-1 text-xs text-slate-500">
                The agreed calendar stays in place until a proposal is accepted.
              </p>
            </div>
            {pendingProposals.map((proposal) => {
              const summaries = proposalSummaries(
                proposal,
                date,
                participants,
                currentParticipantId,
              );
              return (
                <ProposalCard
                  key={proposal.id}
                  status={proposal.status}
                  title={proposal.title}
                  proposedByName={proposal.proposedByName}
                  approverName={proposal.approverName}
                  reason={proposal.reason}
                  agreedSummary={summaries.agreed}
                  proposedSummary={summaries.proposed}
                  actions={
                    <ProposalActions
                      proposalId={proposal.id}
                      currentMembershipId={currentMembershipId}
                      proposedByMembershipId={proposal.proposedByMembershipId}
                      approverMembershipId={proposal.approverMembershipId}
                      onChanged={onProposalChanged}
                    />
                  }
                />
              );
            })}
          </div>
        ) : null}

        {!readOnly ? (
          <div className="mt-6">
            <p className="text-sm font-semibold text-slate-800">Custody for this day</p>
            <p className="mt-1 text-xs text-slate-500">Choose the complete day state in one tap.</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2" role="group" aria-label="Custody state">
              {choices.map((item) => (
                <button key={item.value} type="button" aria-pressed={choice === item.value} onClick={() => { setChoice(item.value); setError(null); }} disabled={submitting} className={`min-h-12 rounded-xl border px-3 text-sm font-semibold transition ${item.className} ${choice === item.value ? "border-[#243139] ring-2 ring-[#243139] ring-offset-2" : "border-transparent"}`}>{item.label}</button>
              ))}
            </div>
          </div>
        ) : null}

        <div className={`mt-6 space-y-4 ${detailsDisabled || readOnly ? "opacity-60" : ""}`}>
          <label className="block"><span className="flex items-center gap-2 text-sm font-semibold text-slate-800"><Clock3 className="h-4 w-4" aria-hidden="true" />Handover time</span><input type="time" value={handoverTime} disabled={detailsDisabled || readOnly} onChange={(event) => setHandoverTime(event.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200 disabled:bg-slate-50" /></label>
          <label className="block"><span className="flex items-center gap-2 text-sm font-semibold text-slate-800"><MapPin className="h-4 w-4" aria-hidden="true" />Handover location</span><input type="text" maxLength={120} value={handoverLocation} disabled={detailsDisabled || readOnly} placeholder="e.g. School gate, home, rugby club" onChange={(event) => setHandoverLocation(event.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200 disabled:bg-slate-50" /></label>
          <label className="block"><span className="flex items-center gap-2 text-sm font-semibold text-slate-800"><StickyNote className="h-4 w-4" aria-hidden="true" />Note</span><textarea rows={3} maxLength={500} value={note} disabled={detailsDisabled || readOnly} placeholder="Short practical note for this day" onChange={(event) => setNote(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200 disabled:bg-slate-50" /></label>
        </div>

        {!readOnly ? (
          <label className="mt-5 block">
            <span className="text-sm font-semibold text-slate-800">Reason for change <span className="font-normal text-slate-400">(optional)</span></span>
            <textarea
              rows={2}
              maxLength={500}
              value={reason}
              disabled={submitting}
              placeholder="e.g. Family birthday lunch"
              onChange={(event) => setReason(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200 disabled:opacity-60"
            />
            <span className="mt-1 block text-xs text-slate-500">
              Used only if this change needs the other parent&apos;s approval.
            </span>
          </label>
        ) : null}



        <DayResponsibilities date={date} readOnly={readOnly} onChanged={onProposalChanged} />

        <DayExpenses date={date} readOnly={readOnly} />

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" disabled={submitting} onClick={onClose} className="covie-action-secondary min-h-12 rounded-xl px-4 text-sm disabled:opacity-50">Close</button>
          {!readOnly ? <button type="button" disabled={submitting || Boolean(deletingEventId) || choice === "mixed" || !selectedOwnership} onClick={() => void save()} className="covie-primary-action inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-5 text-sm disabled:opacity-50">{submitting ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}Save day</button> : null}
        </div>
      </section>
    </div>
  );
}
