import {
  FORTNIGHT_SLOTS,
  parseFortnightRuleText,
} from "@/lib/recurrence/fortnight";

export type SavedScheduleSlot = {
  morningParentId: string | null;
  afternoonParentId: string | null;
};

export type SavedScheduleRuleRow = {
  id: string;
  parentId: string;
  rrule: string;
  startDate: string;
  endDate: string | null;
  createdAt: Date;
};

export type SavedSchedule = {
  scheduleId: string;
  anchorDate: string;
  endDate: string | null;
  pattern: SavedScheduleSlot[];
  createdAt: string;
};

export function emptySavedSchedulePattern() {
  return Array.from({ length: FORTNIGHT_SLOTS }, () => ({
    morningParentId: null,
    afternoonParentId: null,
  }));
}

export function groupSavedSchedules(ruleRows: SavedScheduleRuleRow[]) {
  const grouped = new Map<string, SavedSchedule>();

  for (const rule of ruleRows) {
    const metadata = parseFortnightRuleText(rule.rrule);
    if (!metadata) continue;

    const existing = grouped.get(metadata.scheduleId) ?? {
      scheduleId: metadata.scheduleId,
      anchorDate: metadata.anchorDate,
      endDate: rule.endDate,
      pattern: emptySavedSchedulePattern(),
      createdAt: rule.createdAt.toISOString(),
    };

    const slot = existing.pattern[metadata.slot];
    if (metadata.period === "full_day") {
      slot.morningParentId = rule.parentId;
      slot.afternoonParentId = rule.parentId;
    } else if (metadata.period === "morning") {
      slot.morningParentId = rule.parentId;
    } else {
      slot.afternoonParentId = rule.parentId;
    }

    if (rule.endDate && (!existing.endDate || rule.endDate < existing.endDate)) {
      existing.endDate = rule.endDate;
    }
    if (rule.createdAt.toISOString() < existing.createdAt) {
      existing.createdAt = rule.createdAt.toISOString();
    }

    grouped.set(metadata.scheduleId, existing);
  }

  return [...grouped.values()].sort(
    (a, b) =>
      a.anchorDate.localeCompare(b.anchorDate) ||
      a.createdAt.localeCompare(b.createdAt),
  );
}
