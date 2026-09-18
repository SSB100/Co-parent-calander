import { z } from "zod";
import { childActivitySchema } from "@/lib/children/profile";

export const childIdSchema = z.string().uuid();

export const updateChildActivitySchema = childActivitySchema.safeExtend({
  id: z.string().uuid(),
});

export const deleteChildActivitySchema = z.object({
  id: z.string().uuid(),
});
