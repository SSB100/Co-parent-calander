import { createHash } from "node:crypto";
import { addDays, format, parseISO } from "date-fns";

export type GoogleEventKind = "parenting" | "handover" | "shared_event";
export type ParentLabelMode = "names" | "neutral";

export type MappingParent = { id: string; displayName: string };
export type MappingChild = { id: string; displayName: string };
export type MappingAssignment = {
  id?: string;
  childId: string;
  date: string;
  morningParentId: string | null;
  afternoonParentId: string | null;
  handoverTime?: string | null;
  handoverLocation?: string | null;
  note?: string | null;
};
export type MappingSharedEvent = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  startDate: string;
  endDate: string | null;
  occurrenceKey?: string;
  seriesId?: string | null;
};
export type MappingSettings = {
  syncParenting: boolean;
  syncHandovers: boolean;
  syncSharedEvents: boolean;
  syncLocations: boolean;
  syncSharedNotes: boolean;
  parentLabelMode: ParentLabelMode;
};
export type GoogleEventBody = {
  summary: string;
  description: string;
  start: { date?: string; dateTime?: string; timeZone?: string };
  end: { date?: string; dateTime?: string; timeZone?: string };
  location?: string;
  extendedProperties?: { private: Record<string, string> };
};
export type DesiredGoogleEvent = {
  localKey: string;
  kind: GoogleEventKind;
  localEntityId: string | null;
  rangeStart: string;
  rangeEnd: string;
  body: GoogleEventBody;
};

const MANAGED_NOTICE = "Managed by Covie. Edit this event in the app.";

function shortHash(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 20);
}

export function googleEventIdForLocalKey(connectionId: string, localKey: string) {
  return `cpc${createHash("sha256").update(`${connectionId}:${localKey}`).digest("hex").slice(0, 48)}`;
}

export function googleAllDayExclusiveEnd(inclusiveEnd: string) {
  return format(addDays(parseISO(inclusiveEnd), 1), "yyyy-MM-dd");
}

function descriptionWithOptionalNote(note: string | null | undefined, include: boolean) {
  if (!include || !note?.trim()) return MANAGED_NOTICE;
  return `${MANAGED_NOTICE}\n\n${note.trim()}`;
}

function parentLabel(parents: MappingParent[], parentId: string | null, mode: ParentLabelMode) {
  if (!parentId) return "Unassigned";
  const index = parents.findIndex((parent) => parent.id === parentId);
  if (mode === "neutral") return index >= 0 ? `Parent ${index + 1}` : "Parent";
  return parents[index]?.displayName ?? "Parent";
}

function childNames(children: MappingChild[], childIds: string[]) {
  return childIds
    .map((id) => children.find((child) => child.id === id)?.displayName)
    .filter((value): value is string => Boolean(value))
    .join(", ");
}

function ownershipLabel(
  parents: MappingParent[],
  morningParentId: string | null,
  afternoonParentId: string | null,
  mode: ParentLabelMode,
) {
  if (morningParentId && morningParentId === afternoonParentId) {
    return parentLabel(parents, morningParentId, mode);
  }
  return `${parentLabel(parents, morningParentId, mode)} → ${parentLabel(parents, afternoonParentId, mode)}`;
}

function nextDate(date: string) {
  return format(addDays(parseISO(date), 1), "yyyy-MM-dd");
}

type ParentingGroup = {
  identity: string;
  childIds: string[];
  morningParentId: string | null;
  afternoonParentId: string | null;
  note: string | null;
};

function parentingGroupsForDate(
  rows: MappingAssignment[],
  children: MappingChild[],
  includeNotes: boolean,
) {
  const grouped = new Map<string, ParentingGroup>();
  for (const child of children) {
    const row = rows.find((item) => item.childId === child.id);
    const morningParentId = row?.morningParentId ?? null;
    const afternoonParentId = row?.afternoonParentId ?? null;
    if (!morningParentId && !afternoonParentId) continue;
    const note = includeNotes ? row?.note?.trim() || null : null;
    const state = `${morningParentId ?? "none"}:${afternoonParentId ?? "none"}:${note ?? ""}`;
    const existing = grouped.get(state) ?? {
      identity: state,
      childIds: [],
      morningParentId,
      afternoonParentId,
      note,
    };
    existing.childIds.push(child.id);
    grouped.set(state, existing);
  }

  return [...grouped.values()].map((group) => {
    const childIds = [...group.childIds].sort();
    return { ...group, childIds, identity: `${group.identity}:${childIds.join(",")}` };
  });
}

export function buildParentingGoogleEvents(input: {
  parents: MappingParent[];
  children: MappingChild[];
  assignments: MappingAssignment[];
  settings: MappingSettings;
}) {
  if (!input.settings.syncParenting) return [] as DesiredGoogleEvent[];

  const byDate = new Map<string, MappingAssignment[]>();
  for (const assignment of input.assignments) {
    const rows = byDate.get(assignment.date) ?? [];
    rows.push(assignment);
    byDate.set(assignment.date, rows);
  }

  const dates = [...byDate.keys()].sort();
  const result: DesiredGoogleEvent[] = [];
  type Segment = ParentingGroup & { start: string; end: string };
  let active = new Map<string, Segment>();
  let previousDate: string | null = null;

  const finish = (segment: Segment) => {
    const allChildren = segment.childIds.length === input.children.length;
    const childPrefix = allChildren ? "" : `${childNames(input.children, segment.childIds)}: `;
    const stateLabel = ownershipLabel(
      input.parents,
      segment.morningParentId,
      segment.afternoonParentId,
      input.settings.parentLabelMode,
    );
    result.push({
      localKey: `parenting:${shortHash(segment.identity)}:${segment.start}`,
      kind: "parenting",
      localEntityId: null,
      rangeStart: segment.start,
      rangeEnd: segment.end,
      body: {
        summary: `Parenting — ${childPrefix}${stateLabel}`,
        description: descriptionWithOptionalNote(segment.note, input.settings.syncSharedNotes),
        start: { date: segment.start },
        end: { date: googleAllDayExclusiveEnd(segment.end) },
      },
    });
  };

  for (const date of dates) {
    if (previousDate && date !== nextDate(previousDate)) {
      for (const segment of active.values()) finish(segment);
      active = new Map();
    }

    const groups = parentingGroupsForDate(
      byDate.get(date) ?? [],
      input.children,
      input.settings.syncSharedNotes,
    );
    const currentIds = new Set(groups.map((group) => group.identity));
    for (const [identity, segment] of active) {
      if (!currentIds.has(identity)) {
        finish(segment);
        active.delete(identity);
      }
    }

    for (const group of groups) {
      const existing = active.get(group.identity);
      if (existing && previousDate && date === nextDate(previousDate)) {
        existing.end = date;
      } else {
        active.set(group.identity, { ...group, start: date, end: date });
      }
    }
    previousDate = date;
  }

  for (const segment of active.values()) finish(segment);
  return result;
}

function addLocalMinutes(date: string, time: string, minutes: number) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.slice(0, 5).split(":").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day, hour, minute) + minutes * 60_000);
  const two = (number: number) => String(number).padStart(2, "0");
  return {
    date: `${value.getUTCFullYear()}-${two(value.getUTCMonth() + 1)}-${two(value.getUTCDate())}`,
    time: `${two(value.getUTCHours())}:${two(value.getUTCMinutes())}:00`,
  };
}

export function buildHandoverGoogleEvents(input: {
  parents: MappingParent[];
  children: MappingChild[];
  assignments: MappingAssignment[];
  settings: MappingSettings;
  timeZone: string;
}) {
  if (!input.settings.syncHandovers) return [] as DesiredGoogleEvent[];
  const grouped = new Map<string, MappingAssignment[]>();

  for (const assignment of input.assignments) {
    if (!assignment.handoverTime) continue;
    const key = [
      assignment.date,
      assignment.handoverTime.slice(0, 5),
      assignment.morningParentId ?? "none",
      assignment.afternoonParentId ?? "none",
      input.settings.syncLocations ? assignment.handoverLocation ?? "" : "",
      input.settings.syncSharedNotes ? assignment.note?.trim() ?? "" : "",
    ].join("|");
    const rows = grouped.get(key) ?? [];
    rows.push(assignment);
    grouped.set(key, rows);
  }

  const result: DesiredGoogleEvent[] = [];
  for (const rows of grouped.values()) {
    const first = rows[0];
    const childIds = [...new Set(rows.map((row) => row.childId))].sort();
    const allChildren = childIds.length === input.children.length;
    const childPrefix = allChildren ? "" : `${childNames(input.children, childIds)}: `;
    const from = parentLabel(input.parents, first.morningParentId, input.settings.parentLabelMode);
    const to = parentLabel(input.parents, first.afternoonParentId, input.settings.parentLabelMode);
    const transfer =
      first.morningParentId &&
      first.afternoonParentId &&
      first.morningParentId !== first.afternoonParentId
        ? `${from} to ${to}`
        : parentLabel(
            input.parents,
            first.afternoonParentId ?? first.morningParentId,
            input.settings.parentLabelMode,
          );
    const startTime = first.handoverTime!.slice(0, 5);
    const end = addLocalMinutes(first.date, startTime, 30);
    const identity = `${first.date}:${childIds.join(",")}:${first.morningParentId ?? "none"}:${first.afternoonParentId ?? "none"}`;

    result.push({
      localKey: `handover:${shortHash(identity)}:${first.date}`,
      kind: "handover",
      localEntityId: null,
      rangeStart: first.date,
      rangeEnd: first.date,
      body: {
        summary: `Handover — ${childPrefix}${transfer}`,
        description: descriptionWithOptionalNote(first.note, input.settings.syncSharedNotes),
        start: { dateTime: `${first.date}T${startTime}:00`, timeZone: input.timeZone },
        end: { dateTime: `${end.date}T${end.time}`, timeZone: input.timeZone },
        ...(input.settings.syncLocations && first.handoverLocation
          ? { location: first.handoverLocation }
          : {}),
      },
    });
  }
  return result;
}

export function buildSharedGoogleEvents(input: {
  events: MappingSharedEvent[];
  settings: MappingSettings;
}) {
  if (!input.settings.syncSharedEvents) return [] as DesiredGoogleEvent[];
  return input.events.map<DesiredGoogleEvent>((event) => {
    const end = event.endDate ?? event.startDate;
    return {
      localKey:
        event.seriesId && event.occurrenceKey
          ? `event:${event.occurrenceKey}`
          : `event:${event.id}`,
      kind: "shared_event",
      localEntityId: event.id,
      rangeStart: event.startDate,
      rangeEnd: end,
      body: {
        summary: event.title,
        description: descriptionWithOptionalNote(event.description, input.settings.syncSharedNotes),
        start: { date: event.startDate },
        end: { date: googleAllDayExclusiveEnd(end) },
      },
    };
  });
}

export function buildDesiredGoogleEvents(input: {
  parents: MappingParent[];
  children: MappingChild[];
  assignments: MappingAssignment[];
  events: MappingSharedEvent[];
  settings: MappingSettings;
  timeZone: string;
}) {
  return [
    ...buildParentingGoogleEvents(input),
    ...buildHandoverGoogleEvents(input),
    ...buildSharedGoogleEvents(input),
  ];
}
