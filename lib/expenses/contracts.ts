import { z } from "zod";
import { proposalReasonSchema } from "@/lib/approvals/http";
import { expenseDetailsSchema } from "@/lib/expenses/model";

export const expenseDateQuerySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/);

export const createExpenseSchema = expenseDetailsSchema.safeExtend({
  reason: proposalReasonSchema,
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
  paidCents: z.number().int().min(0).max(10_000_000),
});

export type SettlementUpdate = z.infer<typeof settlementUpdateSchema>;
