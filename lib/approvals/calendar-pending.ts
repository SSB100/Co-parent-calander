import {
  differenceInCalendarDays,
  eachDayOfInterval,
  parseISO,
} from "date-fns";
import {
  parentingAssignmentsProposalStateSchema,
  recurringScheduleProposalStateSchema,
  recurringScheduleSnapshotProposalStateSchema,
  sharedEventProposalStateSchema,
} from "@/lib/approvals/calendar-state";

export type CalendarPendingProposal = {
  id: string;
  entityType: string;
  entityId: string;
  action: "create" | "edit" | "delete";
  status: "waiting";
  proposedByMembershipId: string;
  proposedByParticipantId: string | null;
  proposedByName: string;
  approverMembershipId: string | null;
  approverParticipantId: string | null;
  approverName: string | null;
  reason: string | null;
  previousState: unknown;
  proposedState: unknown;
  submittedAt: Date | null;
  affectedDates: string[];
  kind: "parenting" | "event" | "recurring_schedule";
  title: string;
};

type PendingSource = {
  id: string;
  entityType: string;
  entityId: string;
  action: "create" | "edit" | "delete";
  status: "draft" | "waiting" | "approved" | "declined" | "withdrawn";
  proposedByMembershipId: string;
  proposedByParticipantId: string | null;
  proposedByName: string;
  approverMembershipId: string | null;
  approverParticipantId: string | null;
  approverName: string | null;
  reason: string | null;
  previousState: unknown;
  proposedState: unknown;
  submittedAt: Date | null;
};

function inRange(date: string, from: string, to: string) {
  return date >= from && date <= to;
}

function addEventDates(
  target: Set<string>,
  state: unknown,
  from: string,
  to: string,
) {
  const parsed = sharedEventProposalStateSchema.safeParse(state);
  const event = parsed.success ? parsed.data.event : null;
  if (!event) return;

  const end = event.endDate ?? event.startDate;
  for (const day of eachDayOfInterval({
    start: parseISO(event.startDate),
    end: parseISO(end),
  })) {
    const date = day.toISOString().slice(0, 10);
    if (inRange(date, from, to)) target.add(date);
  }
}

function addRecurringDates(
  target: Set<string>,
  schedule: {
    anchorDate: string;
    endDate: string | null;
    pattern: Array<{
      morningParentId: string | null;
      afternoonParentId: string | null;
    }>;
  },
  from: string,
  to: string,
) {
  for (const day of eachDayOfInterval({
    start: parseISO(from),
    end: parseISO(to),
  })) {
    const date = day.toISOString().slice(0, 10);
    if (date < schedule.anchorDate) continue;
    if (schedule.endDate && date > schedule.endDate) continue;

    const offset = differenceInCalendarDays(
      parseISO(date),
      parseISO(schedule.anchorDate),
    );
    if (offset < 0) continue;
    const slot = ((offset % 14) + 14) % 14;
    const ownership = schedule.pattern[slot];
    if (ownership?.morningParentId || ownership?.afternoonParentId) {
      target.add(date);
    }
  }
}

function proposalDates(
  proposal: PendingSource,
  from: string,
  to: string,
) {
  const dates = new Set<string>();

  const assignments = parentingAssignmentsProposalStateSchema.safeParse(
    proposal.proposedState,
  );
  if (assignments.success) {
    for (const date of assignments.data.dates) {
      if (inRange(date, from, to)) dates.add(date);
    }
    return [...dates].sort();
  }

  if (proposal.entityType === "shared_event") {
    addEventDates(dates, proposal.previousState, from, to);
    addEventDates(dates, proposal.proposedState, from, to);
    return [...dates].sort();
  }

  const recurring = recurringScheduleProposalStateSchema.safeParse(
    proposal.proposedState,
  );
  if (recurring.success && recurring.data.mode === "upsert") {
    addRecurringDates(dates, recurring.data, from, to);
    return [...dates].sort();
  }

  if (recurring.success && recurring.data.mode === "delete") {
    const previous = recurringScheduleSnapshotProposalStateSchema.safeParse(
      proposal.previousState,
    );
    if (previous.success && previous.data.schedule) {
      addRecurringDates(dates, previous.data.schedule, from, to);
    }
    return [...dates].sort();
  }

  return [];
}

function proposalKind(proposal: PendingSource): CalendarPendingProposal["kind"] {
  if (proposal.entityType === "shared_event") return "event";
  if (parentingAssignmentsProposalStateSchema.safeParse(proposal.proposedState).success) {
    return "parenting";
  }
  return "recurring_schedule";
}

function proposalTitle(proposal: PendingSource) {
  const event = sharedEventProposalStateSchema.safeParse(proposal.proposedState);
  if (event.success && event.data.event) return event.data.event.title;

  const previousEvent = sharedEventProposalStateSchema.safeParse(
    proposal.previousState,
  );
  if (previousEvent.success && previousEvent.data.event) {
    return previousEvent.data.event.title;
  }

  if (parentingAssignmentsProposalStateSchema.safeParse(proposal.proposedState).success) {
    return "Parenting schedule change";
  }

  return proposal.action === "delete"
    ? "Cancel repeating schedule"
    : proposal.action === "create"
      ? "New repeating schedule"
      : "Repeating schedule change";
}

export function projectCalendarPendingProposals(input: {
  proposals: PendingSource[];
  from: string;
  to: string;
}) {
  return input.proposals
    .filter((proposal) => proposal.status === "waiting")
    .map<CalendarPendingProposal>((proposal) => ({
      id: proposal.id,
      entityType: proposal.entityType,
      entityId: proposal.entityId,
      action: proposal.action,
      status: "waiting",
      proposedByMembershipId: proposal.proposedByMembershipId,
      proposedByParticipantId: proposal.proposedByParticipantId,
      proposedByName: proposal.proposedByName,
      approverMembershipId: proposal.approverMembershipId,
      approverParticipantId: proposal.approverParticipantId,
      approverName: proposal.approverName,
      reason: proposal.reason,
      previousState: proposal.previousState,
      proposedState: proposal.proposedState,
      submittedAt: proposal.submittedAt,
      affectedDates: proposalDates(proposal, input.from, input.to),
      kind: proposalKind(proposal),
      title: proposalTitle(proposal),
    }));
}
