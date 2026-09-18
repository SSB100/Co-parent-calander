import {
  addDays,
  differenceInCalendarDays,
  format,
  isAfter,
  parseISO,
} from "date-fns";
import type { ParentingScheduleSlot } from "@/lib/parenting-schedules/model";

export type ParentingScheduleRecord = {
  id: string;
  anchorDate: string;
  endDate: string | null;
};

export type ParentingScheduleSlotRecord = ParentingScheduleSlot & {
  scheduleId: string;
  slotIndex: number;
};

export type ParentingScheduleChildRecord = {
  scheduleId: string;
  childId: string;
};

export type ManualParentingAssignment = {
  id: string;
  childId: string;
  date: string;
  morningParentId: string | null;
  afternoonParentId: string | null;
  handoverTime: string | null;
  handoverLocation: string | null;
  note: string | null;
};

export type EffectiveParentingAssignment = {
  id: string;
  childId: string;
  date: string;
  morningParentId: string | null;
  afternoonParentId: string | null;
  handoverTime: string | null;
  handoverLocation: string | null;
  note: string | null;
  source: "manual" | "recurring";
  recurringRuleId: string | null;
};

function dateKey(value: Date) {
  return format(value, "yyyy-MM-dd");
}

export function resolveParentingScheduleAssignments(input: {
  manualAssignments: ManualParentingAssignment[];
  schedules: ParentingScheduleRecord[];
  slots: ParentingScheduleSlotRecord[];
  scheduleChildren: ParentingScheduleChildRecord[];
  from: string;
  to: string;
}) {
  const result = new Map<string, EffectiveParentingAssignment>();
  const fromDate = parseISO(input.from);
  const toDate = parseISO(input.to);

  const slotsBySchedule = new Map<
    string,
    Map<number, ParentingScheduleSlotRecord>
  >();
  for (const slot of input.slots) {
    const scheduleSlots =
      slotsBySchedule.get(slot.scheduleId) ??
      new Map<number, ParentingScheduleSlotRecord>();
    scheduleSlots.set(slot.slotIndex, slot);
    slotsBySchedule.set(slot.scheduleId, scheduleSlots);
  }

  const childrenBySchedule = new Map<string, string[]>();
  for (const link of input.scheduleChildren) {
    const children =
      childrenBySchedule.get(link.scheduleId) ?? [];
    children.push(link.childId);
    childrenBySchedule.set(link.scheduleId, children);
  }

  for (const schedule of input.schedules) {
    const scheduleSlots = slotsBySchedule.get(schedule.id);
    const childIds = childrenBySchedule.get(schedule.id) ?? [];
    if (!scheduleSlots || childIds.length === 0) continue;

    const anchor = parseISO(schedule.anchorDate);
    let date = isAfter(anchor, fromDate) ? anchor : fromDate;

    while (!isAfter(date, toDate)) {
      const dateValue = dateKey(date);
      if (schedule.endDate && dateValue > schedule.endDate) break;

      const offset = differenceInCalendarDays(date, anchor);
      if (offset >= 0) {
        const slotIndex = offset % 14;
        const slot = scheduleSlots.get(slotIndex);
        if (
          slot &&
          (slot.morningParentId || slot.afternoonParentId)
        ) {
          for (const childId of childIds) {
            result.set(`${childId}:${dateValue}`, {
              id: `schedule:${schedule.id}:${childId}:${dateValue}`,
              childId,
              date: dateValue,
              morningParentId: slot.morningParentId,
              afternoonParentId: slot.afternoonParentId,
              handoverTime: null,
              handoverLocation: null,
              note: null,
              source: "recurring",
              // Compatibility alias for clients that still expose the old read-model field.
              recurringRuleId: schedule.id,
            });
          }
        }
      }

      date = addDays(date, 1);
    }
  }

  for (const assignment of input.manualAssignments) {
    const key = `${assignment.childId}:${assignment.date}`;
    if (
      !assignment.morningParentId &&
      !assignment.afternoonParentId
    ) {
      result.delete(key);
      continue;
    }

    result.set(key, {
      ...assignment,
      source: "manual",
      recurringRuleId: null,
    });
  }

  return [...result.values()].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.childId.localeCompare(b.childId),
  );
}
