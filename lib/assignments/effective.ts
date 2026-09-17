import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  parentingAssignments,
  recurringRuleChildren,
  recurringRules,
} from "@/lib/db/schema";
import { resolveRecurringAssignments } from "@/lib/recurrence/fortnight";

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
    Awaited<ReturnType<typeof resolveRecurringAssignments>>[number]
  >();
  if (childIds.length === 0) return result;

  const db = getDb();
  const [manualAssignments, rules, ruleChildren] = await db.batch([
    db
      .select({
        id: parentingAssignments.id,
        childId: parentingAssignments.childId,
        date: parentingAssignments.assignmentDate,
        morningParentId: parentingAssignments.parentId,
        afternoonParentId: parentingAssignments.afternoonParentId,
        handoverTime: parentingAssignments.handoverTime,
        handoverLocation: parentingAssignments.handoverLocation,
        note: parentingAssignments.note,
      })
      .from(parentingAssignments)
      .where(
        and(
          eq(parentingAssignments.calendarId, calendarId),
          eq(parentingAssignments.source, "manual"),
          inArray(parentingAssignments.childId, childIds),
          gte(parentingAssignments.assignmentDate, from),
          lte(parentingAssignments.assignmentDate, to),
        ),
      ),
    db
      .select({
        id: recurringRules.id,
        parentId: recurringRules.parentId,
        startDate: recurringRules.startDate,
        endDate: recurringRules.endDate,
        rrule: recurringRules.rrule,
      })
      .from(recurringRules)
      .where(and(eq(recurringRules.calendarId, calendarId), eq(recurringRules.active, true))),
    db
      .select({
        ruleId: recurringRuleChildren.recurringRuleId,
        childId: recurringRuleChildren.childId,
      })
      .from(recurringRuleChildren)
      .innerJoin(recurringRules, eq(recurringRuleChildren.recurringRuleId, recurringRules.id))
      .where(
        and(
          eq(recurringRules.calendarId, calendarId),
          eq(recurringRules.active, true),
          inArray(recurringRuleChildren.childId, childIds),
        ),
      ),
  ]);

  for (const assignment of resolveRecurringAssignments({
    manualAssignments,
    rules,
    ruleChildren,
    from,
    to,
  })) {
    result.set(`${assignment.childId}:${assignment.date}`, assignment);
  }

  return result;
}
