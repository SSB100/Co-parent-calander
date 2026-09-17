import {
  addDays,
  differenceInCalendarDays,
  format,
  isAfter,
  parseISO,
  startOfWeek,
} from "date-fns";

export const FORTNIGHT_SLOTS = 14;
const WEEKDAY_CODES = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;

type RuleMetadata = {
  scheduleId: string;
  anchorDate: string;
  slot: number;
};

export type RecurrenceRule = {
  id: string;
  parentId: string;
  startDate: string;
  endDate: string | null;
  rrule: string;
};

export type RecurrenceRuleChild = {
  ruleId: string;
  childId: string;
};

export type ManualAssignment = {
  id: string;
  childId: string;
  date: string;
  parentId: string | null;
  handoverTime: string | null;
  handoverLocation: string | null;
  note: string | null;
};

export type ResolvedAssignment = {
  id: string;
  childId: string;
  date: string;
  parentId: string;
  handoverTime: string | null;
  handoverLocation: string | null;
  note: string | null;
  source: "manual" | "recurring";
  recurringRuleId: string | null;
};

export function normalizeAnchorDate(value: string) {
  return format(startOfWeek(parseISO(value), { weekStartsOn: 1 }), "yyyy-MM-dd");
}

export function dateForSlot(anchorDate: string, slot: number) {
  return format(addDays(parseISO(anchorDate), slot), "yyyy-MM-dd");
}

export function buildFortnightRuleText({
  scheduleId,
  anchorDate,
  slot,
}: RuleMetadata) {
  const weekday = WEEKDAY_CODES[slot % 7];
  return [
    "FREQ=WEEKLY",
    "INTERVAL=2",
    `BYDAY=${weekday}`,
    `X-COPARENT-SCHEDULE=${scheduleId}`,
    `X-COPARENT-ANCHOR=${anchorDate}`,
    `X-COPARENT-SLOT=${slot}`,
  ].join(";");
}

export function parseFortnightRuleText(value: string): RuleMetadata | null {
  const entries = new Map(
    value.split(";").map((part) => {
      const separator = part.indexOf("=");
      return separator === -1
        ? [part, ""]
        : [part.slice(0, separator), part.slice(separator + 1)];
    }),
  );

  const scheduleId = entries.get("X-COPARENT-SCHEDULE");
  const anchorDate = entries.get("X-COPARENT-ANCHOR");
  const slot = Number(entries.get("X-COPARENT-SLOT"));

  if (
    !scheduleId ||
    !anchorDate ||
    !/^\d{4}-\d{2}-\d{2}$/.test(anchorDate) ||
    !Number.isInteger(slot) ||
    slot < 0 ||
    slot >= FORTNIGHT_SLOTS
  ) {
    return null;
  }

  return { scheduleId, anchorDate, slot };
}

export function resolveRecurringAssignments({
  manualAssignments,
  rules,
  ruleChildren,
  from,
  to,
}: {
  manualAssignments: ManualAssignment[];
  rules: RecurrenceRule[];
  ruleChildren: RecurrenceRuleChild[];
  from: string;
  to: string;
}) {
  const fromDate = parseISO(from);
  const toDate = parseISO(to);
  const childrenByRule = new Map<string, string[]>();

  for (const link of ruleChildren) {
    const childIds = childrenByRule.get(link.ruleId) ?? [];
    childIds.push(link.childId);
    childrenByRule.set(link.ruleId, childIds);
  }

  const resolved = new Map<string, ResolvedAssignment>();

  for (const rule of rules) {
    const childIds = childrenByRule.get(rule.id) ?? [];
    if (childIds.length === 0) continue;

    const ruleStart = parseISO(rule.startDate);
    const daysUntilFrom = differenceInCalendarDays(fromDate, ruleStart);
    const occurrenceOffset = daysUntilFrom <= 0 ? 0 : Math.ceil(daysUntilFrom / 14) * 14;
    let occurrence = addDays(ruleStart, occurrenceOffset);

    while (!isAfter(occurrence, toDate)) {
      const date = format(occurrence, "yyyy-MM-dd");
      if (rule.endDate && date > rule.endDate) break;

      for (const childId of childIds) {
        const key = `${childId}:${date}`;
        resolved.set(key, {
          id: `recurring:${rule.id}:${childId}:${date}`,
          childId,
          date,
          parentId: rule.parentId,
          handoverTime: null,
          handoverLocation: null,
          note: null,
          source: "recurring",
          recurringRuleId: rule.id,
        });
      }

      occurrence = addDays(occurrence, 14);
    }
  }

  for (const assignment of manualAssignments) {
    const key = `${assignment.childId}:${assignment.date}`;
    if (!assignment.parentId) {
      resolved.delete(key);
      continue;
    }

    resolved.set(key, {
      ...assignment,
      parentId: assignment.parentId,
      source: "manual",
      recurringRuleId: null,
    });
  }

  return [...resolved.values()].sort(
    (a, b) => a.date.localeCompare(b.date) || a.childId.localeCompare(b.childId),
  );
}
