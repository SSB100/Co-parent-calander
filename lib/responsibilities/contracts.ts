import { z } from "zod";
import { proposalReasonSchema } from "@/lib/approvals/http";
import { responsibilityDetailsSchema } from "@/lib/responsibilities/model";

export const responsibilityDateQuerySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/);

export const createResponsibilitySchema = responsibilityDetailsSchema.safeExtend({
  reason: proposalReasonSchema,
});

export const editResponsibilitySchema = responsibilityDetailsSchema.safeExtend({
  id: z.string().uuid(),
  reason: proposalReasonSchema,
});

export const deleteResponsibilitySchema = z.object({
  id: z.string().uuid(),
  reason: proposalReasonSchema,
});

export const responsibilityIdSchema = z.string().uuid();

export const responsibilityCompletionSchema = z.object({
  operation: z.enum(["complete", "reopen"]),
});

export type ResponsibilityCompletionOperation =
  z.infer<typeof responsibilityCompletionSchema>["operation"];
