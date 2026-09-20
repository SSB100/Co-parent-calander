import { z } from "zod";
import { proposalReasonSchema } from "@/lib/approvals/http";
import {
  expenseDetailsSchema,
  expenseRecurrenceSchema,
} from "@/lib/expenses/model";

export const expenseDateQuerySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/);

export const createExpenseSchema = expenseDetailsSchema
  .safeExtend({
    reason: proposalReasonSchema,
    recurrence: expenseRecurrenceSchema.nullable().default(null),
  })
  .superRefine((value, context) => {
    if (
      value.recurrence?.endDate &&
      value.recurrence.endDate < value.expenseDate
    ) {
      context.addIssue({
        code: "custom",
        path: ["recurrence", "endDate"],
        message: "The recurrence end date cannot be before the first cost.",
      });
    }
  });

export const editExpenseSchema = expenseDetailsSchema.safeExtend({
  id: z.string().uuid(),
  reason: proposalReasonSchema,
});

export const deleteExpenseSchema = z.object({
  id: z.string().uuid(),
  reason: proposalReasonSchema,
});

export const expenseIdSchema = z.string().uuid();

export const settlementUpdateSchema = z.object({
  paymentCents: z.number().int().min(1).max(10_000_000),
});

export type SettlementUpdate = z.infer<typeof settlementUpdateSchema>;
