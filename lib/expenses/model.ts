import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import {
  children,
  expenseShares,
  expenses,
  participants,
} from "@/lib/db/schema";

export const expenseCategoryValues = [
  "school",
  "childcare",
  "medical",
  "sport",
  "clothing",
  "activity",
  "travel",
  "essentials",
  "other",
] as const;

export type ExpenseCategory = (typeof expenseCategoryValues)[number];
export type ExpenseSettlementStatus = "not_needed" | "outstanding" | "settled";

export const expenseRecurrenceFrequencyValues = [
  "weekly",
  "fortnightly",
  "monthly",
  "yearly",
] as const;

export const expenseRecurrenceSchema = z.object({
  frequency: z.enum(expenseRecurrenceFrequencyValues),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid recurrence end date.")
    .nullable(),
});

export type ExpenseRecurrence = z.infer<typeof expenseRecurrenceSchema>;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid date.")
  .refine((value) => !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime()), "Choose a valid date.");

export const expenseShareSchema = z.object({
  participantId: z.string().uuid(),
  shareCents: z.number().int().min(0).max(10_000_000),
});

export const expenseDetailsSchema = z
  .object({
    childId: z.string().uuid().nullable(),
    expenseDate: isoDate,
    title: z.string().trim().min(1, "Add a short expense title.").max(100),
    category: z.enum(expenseCategoryValues),
    amountCents: z.number().int().min(1, "Enter an amount greater than zero.").max(10_000_000),
    paidByParticipantId: z.string().uuid(),
    dueDate: isoDate.nullable(),
    note: z
      .string()
      .trim()
      .max(500, "Keep the note under 500 characters.")
      .nullable()
      .transform((value) => (value ? value : null)),
    shares: z.array(expenseShareSchema).min(1).max(2),
  })
  .superRefine((value, context) => {
    const participantIds = value.shares.map((share) => share.participantId);
    if (new Set(participantIds).size !== participantIds.length) {
      context.addIssue({ code: "custom", message: "Each parent can only have one share." });
    }

    if (!participantIds.includes(value.paidByParticipantId)) {
      context.addIssue({ code: "custom", message: "The parent who paid must have a share." });
    }

    const shareTotal = value.shares.reduce((sum, share) => sum + share.shareCents, 0);
    if (shareTotal !== value.amountCents) {
      context.addIssue({ code: "custom", message: "The parent shares must add up to the full expense." });
    }
  });

export const expenseWithIdSchema = expenseDetailsSchema.safeExtend({
  id: z.string().uuid(),
});

export const expenseProposalStateSchema = z.object({
  kind: z.literal("expense"),
  expense: expenseWithIdSchema.nullable(),
  recurrence: expenseRecurrenceSchema.nullable().optional(),
});

export type ExpenseDetails = z.infer<typeof expenseDetailsSchema>;
export type ExpenseSnapshot = z.infer<typeof expenseWithIdSchema>;

export function equalShares(
  amountCents: number,
  participantIds: string[],
  paidByParticipantId: string,
) {
  const uniqueIds = [...new Set(participantIds)].slice(0, 2);
  if (uniqueIds.length <= 1) {
    const participantId = uniqueIds[0] ?? paidByParticipantId;
    return [{ participantId, shareCents: amountCents }];
  }

  const base = Math.floor(amountCents / uniqueIds.length);
  let remainder = amountCents - base * uniqueIds.length;
  return uniqueIds.map((participantId) => {
    const receivesRemainder = participantId === paidByParticipantId && remainder > 0;
    if (receivesRemainder) remainder -= 1;
    return {
      participantId,
      shareCents: base + (receivesRemainder ? 1 : 0),
    };
  });
}

export function defaultSettlementStatus(
  _input: Pick<ExpenseDetails, "amountCents" | "paidByParticipantId" | "shares">,
): ExpenseSettlementStatus {
  return "outstanding";
}

export function financialSignature(
  input: Pick<ExpenseDetails, "amountCents" | "paidByParticipantId" | "shares">,
) {
  const shares = [...input.shares]
    .sort((a, b) => a.participantId.localeCompare(b.participantId))
    .map((share) => [share.participantId, share.shareCents]);
  return JSON.stringify([input.amountCents, input.paidByParticipantId, shares]);
}

export async function assertExpenseRelations(calendarId: string, details: ExpenseDetails) {
  const db = getDb();
  const [parentRows, childRows] = await Promise.all([
    db
      .select({ id: participants.id })
      .from(participants)
      .where(and(eq(participants.calendarId, calendarId), eq(participants.active, true))),
    details.childId
      ? db
          .select({ id: children.id })
          .from(children)
          .where(
            and(
              eq(children.calendarId, calendarId),
              eq(children.id, details.childId),
              eq(children.active, true),
            ),
          )
          .limit(1)
      : Promise.resolve([] as Array<{ id: string }>),
  ]);

  const activeParentIds = new Set(parentRows.map((row) => row.id));
  const referencedParentIds = new Set([
    details.paidByParticipantId,
    ...details.shares.map((share) => share.participantId),
  ]);

  for (const participantId of referencedParentIds) {
    if (!activeParentIds.has(participantId)) {
      throw new Error("Choose an active parent from this calendar.");
    }
  }

  if (details.childId && childRows.length === 0) {
    throw new Error("Choose an active child from this calendar.");
  }
}

export async function loadExpenseSnapshot(calendarId: string, expenseId: string) {
  const db = getDb();
  const rows = await db
    .select({
      id: expenses.id,
      childId: expenses.childId,
      expenseDate: expenses.expenseDate,
      title: expenses.title,
      category: expenses.category,
      amountCents: expenses.amountCents,
      paidByParticipantId: expenses.paidByParticipantId,
      dueDate: expenses.dueDate,
      note: expenses.note,
      settlementStatus: expenses.settlementStatus,
      settledAt: expenses.settledAt,
      settledByParticipantId: expenses.settledByParticipantId,
    })
    .from(expenses)
    .where(and(eq(expenses.calendarId, calendarId), eq(expenses.id, expenseId)))
    .limit(1);

  const expense = rows[0];
  if (!expense) return null;

  const shares = await db
    .select({
      participantId: expenseShares.participantId,
      shareCents: expenseShares.shareCents,
      paidCents: expenseShares.paidCents,
      paidAt: expenseShares.paidAt,
    })
    .from(expenseShares)
    .where(eq(expenseShares.expenseId, expenseId))
    .orderBy(asc(expenseShares.createdAt));

  return {
    ...expense,
    shares: shares.map((share) => ({
      ...share,
      paidAt: share.paidAt?.toISOString() ?? null,
    })),
  };
}
