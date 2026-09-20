import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";

export type HomeUrgency = "overdue" | "due_today" | "due_soon" | "upcoming";

export function urgencyForDate(
  dueDate: string,
  today: string,
  dueSoonDays = 3,
): HomeUrgency {
  if (dueDate < today) return "overdue";
  if (dueDate === today) return "due_today";

  const days = differenceInCalendarDays(parseISO(dueDate), parseISO(today));
  if (days <= dueSoonDays) return "due_soon";
  return "upcoming";
}

export function attentionCutoff(today: string, days = 3) {
  return format(addDays(parseISO(today), days), "yyyy-MM-dd");
}

export function expenseReimbursementContext(input: {
  amountCents: number;
  paidByParticipantId: string;
  shares: Array<{
    participantId: string;
    shareCents: number;
    paidCents?: number;
  }>;
  currentParticipantId: string | null;
}) {
  const remainingShares = input.shares.map((share) => ({
    ...share,
    remainingCents: Math.max(0, share.shareCents - (share.paidCents ?? 0)),
  }));

  if (!input.currentParticipantId) {
    return {
      direction: "shared" as const,
      amountCents: remainingShares.reduce(
        (sum, share) => sum + share.remainingCents,
        0,
      ),
    };
  }

  if (input.currentParticipantId === input.paidByParticipantId) {
    return {
      direction: "owed_to_you" as const,
      amountCents: remainingShares
        .filter(
          (share) => share.participantId !== input.currentParticipantId,
        )
        .reduce((sum, share) => sum + share.remainingCents, 0),
    };
  }

  const currentShare = remainingShares.find(
    (share) => share.participantId === input.currentParticipantId,
  );
  return {
    direction: "you_owe" as const,
    amountCents: currentShare?.remainingCents ?? 0,
  };
}

type GenericRecord = Record<string, unknown>;

function record(value: unknown): GenericRecord | null {
  return value && typeof value === "object" ? (value as GenericRecord) : null;
}

function firstRecord(value: unknown, key: string) {
  const parent = record(value);
  return parent ? record(parent[key]) : null;
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function dateSummary(value: unknown) {
  const date = text(value);
  return date ? date : null;
}

export function proposalDisplay(input: {
  entityType: string;
  action: "create" | "edit" | "delete";
  previousState: unknown;
  proposedState: unknown;
}) {
  const actionLabel =
    input.action === "create"
      ? "New"
      : input.action === "delete"
        ? "Remove"
        : "Change";

  if (input.entityType === "expense") {
    const state =
      firstRecord(input.proposedState, "expense") ??
      firstRecord(input.previousState, "expense");
    const title = text(state?.title) ?? "shared cost";
    return {
      title: `${actionLabel} shared cost`,
      summary: title,
    };
  }

  if (input.entityType === "responsibility") {
    const state =
      firstRecord(input.proposedState, "responsibility") ??
      firstRecord(input.previousState, "responsibility");
    const title = text(state?.title) ?? "task";
    const dueDate = dateSummary(state?.dueDate);
    return {
      title: `${actionLabel} task`,
      summary: dueDate ? `${title} · due ${dueDate}` : title,
    };
  }

  if (input.entityType === "shared_event") {
    const state =
      firstRecord(input.proposedState, "event") ??
      firstRecord(input.previousState, "event");
    const title = text(state?.title) ?? "event";
    const startDate = dateSummary(state?.startDate);
    return {
      title: `${actionLabel} event`,
      summary: startDate ? `${title} · ${startDate}` : title,
    };
  }

  if (input.entityType === "parenting_schedule") {
    return {
      title: `${actionLabel} parenting schedule`,
      summary: "Shared parenting calendar change",
    };
  }

  return {
    title: `${actionLabel} shared item`,
    summary: "Shared change",
  };
}

export function aggregateParentingLabel(input: {
  rows: Array<{
    morningParentId: string | null;
    afternoonParentId: string | null;
  }>;
  childCount: number;
  currentParticipantId: string | null;
  participants: Array<{ id: string; displayName: string }>;
}) {
  if (input.childCount === 0 || input.rows.length === 0) return "Not assigned yet";

  const morning = new Set(input.rows.map((row) => row.morningParentId ?? null));
  const afternoon = new Set(input.rows.map((row) => row.afternoonParentId ?? null));
  if (
    input.rows.length !== input.childCount ||
    morning.size !== 1 ||
    afternoon.size !== 1
  ) {
    return "Mixed across children";
  }

  const morningId = [...morning][0] ?? null;
  const afternoonId = [...afternoon][0] ?? null;

  function label(participantId: string | null) {
    if (!participantId) return "Unassigned";
    if (participantId === input.currentParticipantId) return "You";
    return (
      input.participants.find((participant) => participant.id === participantId)
        ?.displayName ?? "Parent"
    );
  }

  if (morningId && morningId === afternoonId) {
    return `Full day ${label(morningId)}`;
  }

  return `${label(morningId)} → ${label(afternoonId)}`;
}
