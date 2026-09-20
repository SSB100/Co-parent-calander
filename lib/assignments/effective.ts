import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  parentingAssignments,
  parentingScheduleChildren,
  parentingSchedules,
  parentingScheduleSlots,
} from "@/lib/db/schema";
import { resolveParentingScheduleAssignments } from "@/lib/parenting-schedules/resolver";

export async function loadEffectiveAssignmentMap({
  calendarId,
  childIds,
  from,
  to,
}: {
  calendarId: string;
  childIds: string[];
  from: string;
  to: string;
}) {
  const result = new Map<
    string,
    Awaited<ReturnType<typeof resolveParentingScheduleAssignments>>[number]
  >();

  if (childIds.length === 0) return result;

  const db = getDb();
  const [manualAssignments, schedules, slots, scheduleChildren] =
    await db.batch([
      db
        .select({
          id: parentingAssignments.id,
          childId: parentingAssignments.childId,
          date: parentingAssignments.assignmentDate,
          morningParentId: parentingAssignments.parentId,
          afternoonParentId:
            parentingAssignments.afternoonParentId,
          handoverTime: parentingAssignments.handoverTime,
          handoverLocation:
            parentingAssignments.handoverLocation,
          note: parentingAssignments.note,
        })
        .from(parentingAssignments)
        .where(
          and(
            eq(parentingAssignments.calendarId, calendarId),
            inArray(parentingAssignments.childId, childIds),
            gte(parentingAssignments.assignmentDate, from),
            lte(parentingAssignments.assignmentDate, to),
          ),
        ),
      db
        .select({
          id: parentingSchedules.id,
          anchorDate: parentingSchedules.anchorDate,
          endDate: parentingSchedules.endDate,
        })
        .from(parentingSchedules)
        .where(
          and(
            eq(parentingSchedules.calendarId, calendarId),
            eq(parentingSchedules.active, true),
            lte(parentingSchedules.anchorDate, to),
          ),
        ),
      db
        .select({
          scheduleId: parentingScheduleSlots.scheduleId,
          slotIndex: parentingScheduleSlots.slotIndex,
          morningParentId:
            parentingScheduleSlots.morningParentId,
          afternoonParentId:
            parentingScheduleSlots.afternoonParentId,
        })
        .from(parentingScheduleSlots)
        .innerJoin(
          parentingSchedules,
          eq(
            parentingScheduleSlots.scheduleId,
            parentingSchedules.id,
          ),
        )
        .where(
          and(
            eq(parentingSchedules.calendarId, calendarId),
            eq(parentingSchedules.active, true),
            lte(parentingSchedules.anchorDate, to),
          ),
        ),
      db
        .select({
          scheduleId: parentingScheduleChildren.scheduleId,
          childId: parentingScheduleChildren.childId,
        })
        .from(parentingScheduleChildren)
        .innerJoin(
          parentingSchedules,
          eq(
            parentingScheduleChildren.scheduleId,
            parentingSchedules.id,
          ),
        )
        .where(
          and(
            eq(parentingSchedules.calendarId, calendarId),
            eq(parentingSchedules.active, true),
            inArray(parentingScheduleChildren.childId, childIds),
            lte(parentingSchedules.anchorDate, to),
          ),
        ),
    ]);

  for (const assignment of resolveParentingScheduleAssignments({
    manualAssignments,
    schedules,
    slots,
    scheduleChildren,
    from,
    to,
  })) {
    result.set(
      `${assignment.childId}:${assignment.date}`,
      assignment,
    );
  }

  return result;
}
