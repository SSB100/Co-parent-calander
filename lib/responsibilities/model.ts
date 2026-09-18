import {
  addMonths,
  addWeeks,
  addYears,
  differenceInCalendarDays,
  format,
  parseISO,
} from "date-fns";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import {
  children,
  events,
  expenses,
  participants,
  responsibilities,
  responsibilityChildren,
} from "@/lib/db/schema";

export const responsibilityCategoryValues = [
  "school",
  "medical",
  "sport",
  "activity",
  "transport",
  "shopping",
  "forms_permissions",
  "appointment",
  "home_admin",
  "other",
] as const;

export const responsibilityRecurrenceValues = [
  "none",
  "weekly",
  "fortnightly",
  "monthly",
  "yearly",
] as const;

export type ResponsibilityCategory = (typeof responsibilityCategoryValues)[number];
export type ResponsibilityRecurrence = (typeof responsibilityRecurrenceValues)[number];
export type ResponsibilityStatus =
  | "upcoming"
  | "due_soon"
  | "due_today"
  | "overdue"
  | "completed";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid due date.")
  .refine((value) => !Number.isNaN(parseISO(value).getTime()), "Choose a valid due date.");

const optionalTime = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Choose a valid time.")
  .nullable();

export const responsibilityDetailsSchema = z
  .object({
    title: z.string().trim().min(1, "Add a responsibility title.").max(100),
    childIds: z.array(z.string().uuid()).max(12),
    responsibleParticipantId: z.string().uuid(),
    dueDate: isoDate,
    dueTime: optionalTime,
    category: z.enum(responsibilityCategoryValues),
    note: z
      .string()
      .trim()
      .max(500, "Keep the note under 500 characters.")
      .nullable()
      .transform((value) => (value ? value : null)),
    recurrence: z.enum(responsibilityRecurrenceValues),
    recurrenceEndDate: isoDate.nullable(),
    linkedEventId: z.string().uuid().nullable(),
    linkedExpenseId: z.string().uuid().nullable(),
  })
  .superRefine((value, context) => {
    if (new Set(value.childIds).size !== value.childIds.length) {
      context.addIssue({ code: "custom", message: "Choose each child only once." });
    }
    if (value.recurrence === "none" && value.recurrenceEndDate) {
      context.addIssue({
        code: "custom",
        message: "Choose a repeat option before setting a repeat-until date.",
      });
    }
    if (
      value.recurrence !== "none" &&
      value.recurrenceEndDate &&
      value.recurrenceEndDate < value.dueDate
    ) {
      context.addIssue({
        code: "custom",
        message: "The repeat-until date cannot be before the first due date.",
      });
    }
  });

export const responsibilityWithIdSchema = responsibilityDetailsSchema.safeExtend({
  id: z.string().uuid(),
  seriesId: z.string().uuid(),
});

export const responsibilityProposalStateSchema = z.object({
  kind: z.literal("responsibility"),
  responsibility: responsibilityWithIdSchema.nullable(),
});

export type ResponsibilityDetails = z.infer<typeof responsibilityDetailsSchema>;
export type ResponsibilitySnapshot = z.infer<typeof responsibilityWithIdSchema>;

export const responsibilityQuickTemplates = [
  { key: "book_appointment", label: "Book appointment", title: "Book appointment", category: "appointment" },
  { key: "buy_item", label: "Buy item", title: "Buy item", category: "shopping" },
  { key: "return_form", label: "Sign/return form", title: "Sign/return form", category: "forms_permissions" },
  { key: "drop_off", label: "Drop off", title: "Drop off", category: "transport" },
  { key: "pick_up", label: "Pick up", title: "Pick up", category: "transport" },
  { key: "bring_item", label: "Bring/pack item", title: "Bring/pack item", category: "other" },
  { key: "register", label: "Register/enrol", title: "Register/enrol", category: "activity" },
  { key: "renew", label: "Renew", title: "Renew", category: "home_admin" },
  { key: "other", label: "Other", title: "", category: "other" },
] as const satisfies ReadonlyArray<{
  key: string;
  label: string;
  title: string;
  category: ResponsibilityCategory;
}>;

export function responsibilityStatus(
  input: { dueDate: string; completedAt?: Date | string | null },
  today: string,
): ResponsibilityStatus {
  if (input.completedAt) return "completed";
  if (input.dueDate < today) return "overdue";
  if (input.dueDate === today) return "due_today";

  const days = differenceInCalendarDays(parseISO(input.dueDate), parseISO(today));
  if (days <= 3) return "due_soon";
  return "upcoming";
}

export function nextResponsibilityDueDate(
  dueDate: string,
  recurrence: ResponsibilityRecurrence,
) {
  const parsed = parseISO(dueDate);
  if (recurrence === "weekly") return format(addWeeks(parsed, 1), "yyyy-MM-dd");
  if (recurrence === "fortnightly") return format(addWeeks(parsed, 2), "yyyy-MM-dd");
  if (recurrence === "monthly") return format(addMonths(parsed, 1), "yyyy-MM-dd");
  if (recurrence === "yearly") return format(addYears(parsed, 1), "yyyy-MM-dd");
  return null;
}

export function needsResponsibilityApproval(input: {
  sharedApprovalAvailable: boolean;
  actorParticipantId: string;
  previousResponsibleParticipantId?: string | null;
  proposedResponsibleParticipantId?: string | null;
}) {
  if (!input.sharedApprovalAvailable) return false;
  return Boolean(
    input.previousResponsibleParticipantId &&
      input.previousResponsibleParticipantId !== input.actorParticipantId ||
      input.proposedResponsibleParticipantId &&
      input.proposedResponsibleParticipantId !== input.actorParticipantId,
  );
}

export async function assertResponsibilityRelations(
  calendarId: string,
  details: ResponsibilityDetails,
) {
  const db = getDb();
  const [parentRows, childRows, eventRows, expenseRows] = await Promise.all([
    db
      .select({ id: participants.id })
      .from(participants)
      .where(
        and(
          eq(participants.calendarId, calendarId),
          eq(participants.id, details.responsibleParticipantId),
          eq(participants.active, true),
        ),
      )
      .limit(1),
    details.childIds.length
      ? db
          .select({ id: children.id })
          .from(children)
          .where(
            and(
              eq(children.calendarId, calendarId),
              eq(children.active, true),
              inArray(children.id, details.childIds),
            ),
          )
      : Promise.resolve([] as Array<{ id: string }>),
    details.linkedEventId
      ? db
          .select({ id: events.id })
          .from(events)
          .where(
            and(
              eq(events.calendarId, calendarId),
              eq(events.id, details.linkedEventId),
            ),
          )
          .limit(1)
      : Promise.resolve([] as Array<{ id: string }>),
    details.linkedExpenseId
      ? db
          .select({ id: expenses.id })
          .from(expenses)
          .where(
            and(
              eq(expenses.calendarId, calendarId),
              eq(expenses.id, details.linkedExpenseId),
            ),
          )
          .limit(1)
      : Promise.resolve([] as Array<{ id: string }>),
  ]);

  if (!parentRows[0]) throw new Error("Choose an active parent from this calendar.");
  if (childRows.length !== details.childIds.length) {
    throw new Error("Choose active children from this calendar.");
  }
  if (details.linkedEventId && !eventRows[0]) {
    throw new Error("Choose an event from this calendar.");
  }
  if (details.linkedExpenseId && !expenseRows[0]) {
    throw new Error("Choose an expense from this calendar.");
  }
}

export async function loadResponsibilitySnapshot(
  calendarId: string,
  responsibilityId: string,
) {
  const db = getDb();
  const rows = await db
    .select({
      id: responsibilities.id,
      seriesId: responsibilities.seriesId,
      title: responsibilities.title,
      responsibleParticipantId: responsibilities.responsibleParticipantId,
      dueDate: responsibilities.dueDate,
      dueTime: responsibilities.dueTime,
      category: responsibilities.category,
      note: responsibilities.note,
      recurrence: responsibilities.recurrence,
      recurrenceEndDate: responsibilities.recurrenceEndDate,
      linkedEventId: responsibilities.linkedEventId,
      linkedExpenseId: responsibilities.linkedExpenseId,
      completedAt: responsibilities.completedAt,
      completedByParticipantId: responsibilities.completedByParticipantId,
      nextOccurrenceId: responsibilities.nextOccurrenceId,
    })
    .from(responsibilities)
    .where(
      and(
        eq(responsibilities.calendarId, calendarId),
        eq(responsibilities.id, responsibilityId),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const childRows = await db
    .select({ childId: responsibilityChildren.childId })
    .from(responsibilityChildren)
    .where(eq(responsibilityChildren.responsibilityId, responsibilityId))
    .orderBy(asc(responsibilityChildren.createdAt));

  return {
    ...row,
    childIds: childRows.map((item) => item.childId),
  };
}
