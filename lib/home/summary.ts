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


export type ProposalChangeDetail = {
  label: string;
  before: string | null;
  after: string | null;
};

type ProposalDetailContext = {
  participants: Array<{ id: string; displayName: string }>;
  children: Array<{ id: string; displayName: string }>;
};

const proposalMoney = new Intl.NumberFormat("en-NZ", {
  style: "currency",
  currency: "NZD",
  minimumFractionDigits: 2,
});

function cents(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? proposalMoney.format(value / 100)
    : null;
}

function readableDate(value: unknown) {
  const date = text(value);
  if (!date) return null;
  try {
    return format(parseISO(date), "d MMM yyyy");
  } catch {
    return date;
  }
}

function readableTime(value: unknown) {
  const valueText = text(value);
  return valueText ? valueText.slice(0, 5) : null;
}

function titleCase(value: unknown) {
  const valueText = text(value);
  if (!valueText) return null;
  return valueText
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function participantValue(value: unknown, context: ProposalDetailContext) {
  if (value === null) return "Unassigned";
  const participantId = text(value);
  if (!participantId) return null;
  return (
    context.participants.find((participant) => participant.id === participantId)
      ?.displayName ?? "Parent"
  );
}

function childValue(value: unknown, context: ProposalDetailContext) {
  if (value === null) return "General / all children";
  const childId = text(value);
  if (!childId) return null;
  return (
    context.children.find((child) => child.id === childId)?.displayName ??
    "Child"
  );
}

function childListValue(value: unknown, context: ProposalDetailContext) {
  if (!Array.isArray(value)) return null;
  if (value.length === 0) return "General / all children";
  const labels = value
    .map((childId) => childValue(childId, context))
    .filter((label): label is string => Boolean(label));
  return labels.length ? labels.sort().join(", ") : null;
}

function noteValue(value: unknown) {
  if (value === null) return "None";
  return text(value);
}

function recurrenceValue(value: unknown) {
  const valueText = text(value);
  if (!valueText) return null;
  if (valueText === "none") return "Does not repeat";
  if (valueText === "fortnightly") return "Every 2 weeks";
  return titleCase(valueText);
}

function addChange(
  details: ProposalChangeDetail[],
  label: string,
  before: string | null,
  after: string | null,
) {
  if (before === after || (!before && !after)) return;
  details.push({ label, before, after });
}

function shareMap(value: GenericRecord | null) {
  const result = new Map<string, number>();
  if (!Array.isArray(value?.shares)) return result;
  for (const rawShare of value.shares) {
    const share = record(rawShare);
    const participantId = text(share?.participantId);
    if (!participantId || typeof share?.shareCents !== "number") continue;
    result.set(participantId, share.shareCents);
  }
  return result;
}

function assignmentMap(value: unknown) {
  const root = record(value);
  const result = new Map<string, GenericRecord>();
  if (root?.kind !== "parenting_assignments" || !Array.isArray(root.assignments)) {
    return result;
  }
  for (const rawAssignment of root.assignments) {
    const assignment = record(rawAssignment);
    const childId = text(assignment?.childId);
    const date = text(assignment?.date);
    if (assignment && childId && date) {
      result.set(`${date}:${childId}`, assignment);
    }
  }
  return result;
}

function assignmentSummary(
  assignment: GenericRecord | undefined,
  context: ProposalDetailContext,
) {
  if (!assignment) return null;
  const morning = participantValue(assignment.morningParentId, context);
  const afternoon = participantValue(assignment.afternoonParentId, context);
  let ownership =
    morning === afternoon
      ? morning === "Unassigned"
        ? "Unassigned"
        : `${morning} all day`
      : `${morning ?? "Unassigned"} → ${afternoon ?? "Unassigned"}`;

  const handoverTime = readableTime(assignment.handoverTime);
  const handoverLocation = text(assignment.handoverLocation);
  const note = text(assignment.note);
  if (handoverTime) ownership += ` · handover ${handoverTime}`;
  if (handoverLocation) ownership += ` at ${handoverLocation}`;
  if (note) ownership += ` · note: ${note}`;
  return ownership;
}

function recurringSchedule(value: unknown) {
  const root = record(value);
  if (!root) return null;
  if (root.kind === "recurring_schedule_snapshot") {
    return record(root.schedule);
  }
  if (root.kind === "recurring_schedule" && root.mode === "upsert") {
    return root;
  }
  return null;
}

function scheduleSlotSummary(
  rawSlot: unknown,
  context: ProposalDetailContext,
) {
  const slot = record(rawSlot);
  if (!slot) return null;
  const morning = participantValue(slot.morningParentId, context);
  const afternoon = participantValue(slot.afternoonParentId, context);
  if (morning === afternoon) {
    return morning === "Unassigned" ? "Unassigned" : `${morning} all day`;
  }
  return `${morning ?? "Unassigned"} → ${afternoon ?? "Unassigned"}`;
}

export function proposalChangeDetails(input: {
  entityType: string;
  action: "create" | "edit" | "delete";
  previousState: unknown;
  proposedState: unknown;
  participants: ProposalDetailContext["participants"];
  children: ProposalDetailContext["children"];
}) {
  const details: ProposalChangeDetail[] = [];
  const context: ProposalDetailContext = {
    participants: input.participants,
    children: input.children,
  };

  if (input.entityType === "expense") {
    const before = firstRecord(input.previousState, "expense");
    const after = firstRecord(input.proposedState, "expense");

    addChange(details, "Title", text(before?.title), text(after?.title));
    addChange(details, "Amount", cents(before?.amountCents), cents(after?.amountCents));
    addChange(
      details,
      "Paid by",
      participantValue(before?.paidByParticipantId, context),
      participantValue(after?.paidByParticipantId, context),
    );
    addChange(details, "Cost date", readableDate(before?.expenseDate), readableDate(after?.expenseDate));
    addChange(details, "Due date", readableDate(before?.dueDate), readableDate(after?.dueDate));
    addChange(details, "Category", titleCase(before?.category), titleCase(after?.category));
    addChange(
      details,
      "Child",
      childValue(before?.childId, context),
      childValue(after?.childId, context),
    );
    addChange(details, "Note", noteValue(before?.note), noteValue(after?.note));

    const beforeShares = shareMap(before);
    const afterShares = shareMap(after);
    const shareParticipants = new Set([
      ...beforeShares.keys(),
      ...afterShares.keys(),
    ]);
    for (const participantId of shareParticipants) {
      const name =
        context.participants.find((participant) => participant.id === participantId)
          ?.displayName ?? "Parent";
      addChange(
        details,
        `${name}'s share`,
        beforeShares.has(participantId) ? cents(beforeShares.get(participantId)) : null,
        afterShares.has(participantId) ? cents(afterShares.get(participantId)) : null,
      );
    }

    const beforeRoot = record(input.previousState);
    const afterRoot = record(input.proposedState);
    const beforeRecurrence = record(beforeRoot?.recurrence);
    const afterRecurrence = record(afterRoot?.recurrence);
    addChange(
      details,
      "Repeats",
      recurrenceValue(beforeRecurrence?.frequency),
      recurrenceValue(afterRecurrence?.frequency),
    );
    addChange(
      details,
      "Repeats until",
      readableDate(beforeRecurrence?.endDate),
      readableDate(afterRecurrence?.endDate),
    );
    return details;
  }

  if (input.entityType === "responsibility") {
    const before = firstRecord(input.previousState, "responsibility");
    const after = firstRecord(input.proposedState, "responsibility");

    addChange(details, "Task", text(before?.title), text(after?.title));
    addChange(
      details,
      "Assigned to",
      participantValue(before?.responsibleParticipantId, context),
      participantValue(after?.responsibleParticipantId, context),
    );
    addChange(details, "Due date", readableDate(before?.dueDate), readableDate(after?.dueDate));
    addChange(details, "Due time", readableTime(before?.dueTime), readableTime(after?.dueTime));
    addChange(details, "Category", titleCase(before?.category), titleCase(after?.category));
    addChange(
      details,
      "Children",
      childListValue(before?.childIds, context),
      childListValue(after?.childIds, context),
    );
    addChange(details, "Repeats", recurrenceValue(before?.recurrence), recurrenceValue(after?.recurrence));
    addChange(
      details,
      "Repeats until",
      readableDate(before?.recurrenceEndDate),
      readableDate(after?.recurrenceEndDate),
    );
    addChange(details, "Note", noteValue(before?.note), noteValue(after?.note));
    return details;
  }

  if (input.entityType === "shared_event") {
    const before = firstRecord(input.previousState, "event");
    const after = firstRecord(input.proposedState, "event");

    addChange(details, "Event", text(before?.title), text(after?.title));
    addChange(details, "Start date", readableDate(before?.startDate), readableDate(after?.startDate));
    addChange(details, "End date", readableDate(before?.endDate), readableDate(after?.endDate));
    addChange(details, "Category", titleCase(before?.category), titleCase(after?.category));
    addChange(details, "Repeats", recurrenceValue(before?.recurrence), recurrenceValue(after?.recurrence));
    addChange(
      details,
      "Repeats until",
      readableDate(before?.recurrenceEndDate),
      readableDate(after?.recurrenceEndDate),
    );
    addChange(details, "Description", noteValue(before?.description), noteValue(after?.description));
    return details;
  }

  if (input.entityType === "parenting_schedule") {
    const beforeAssignments = assignmentMap(input.previousState);
    const afterAssignments = assignmentMap(input.proposedState);
    const assignmentKeys = [...new Set([
      ...beforeAssignments.keys(),
      ...afterAssignments.keys(),
    ])].sort();

    for (const key of assignmentKeys) {
      const before = beforeAssignments.get(key);
      const after = afterAssignments.get(key);
      const source = after ?? before;
      if (!source) continue;
      const childName = childValue(source.childId, context) ?? "Child";
      const date = readableDate(source.date) ?? text(source.date) ?? "Date";
      addChange(
        details,
        `${childName} · ${date}`,
        assignmentSummary(before, context),
        assignmentSummary(after, context),
      );
    }
    if (details.length > 0) return details;

    const beforeSchedule = recurringSchedule(input.previousState);
    const afterSchedule = recurringSchedule(input.proposedState);
    if (beforeSchedule || afterSchedule) {
      addChange(
        details,
        "Starts",
        readableDate(beforeSchedule?.anchorDate),
        readableDate(afterSchedule?.anchorDate),
      );
      addChange(
        details,
        "Ends",
        readableDate(beforeSchedule?.endDate),
        readableDate(afterSchedule?.endDate),
      );

      const weekdays = [
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
        "Sunday",
      ];
      const beforePattern = Array.isArray(beforeSchedule?.pattern)
        ? beforeSchedule.pattern
        : [];
      const afterPattern = Array.isArray(afterSchedule?.pattern)
        ? afterSchedule.pattern
        : [];
      const slotCount = Math.max(beforePattern.length, afterPattern.length);
      for (let index = 0; index < slotCount; index += 1) {
        addChange(
          details,
          `Week ${Math.floor(index / 7) + 1} ${weekdays[index % 7]}`,
          scheduleSlotSummary(beforePattern[index], context),
          scheduleSlotSummary(afterPattern[index], context),
        );
      }
    }
    return details;
  }

  return details;
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
