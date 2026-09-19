import { z } from "zod";
import { childActivitySchema } from "@/lib/children/profile";

export const childIdSchema = z.string().uuid();

export const createChildSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, "Add the child's name.")
    .max(50, "Keep the child's name under 50 characters."),
});

export const updateChildActivitySchema = childActivitySchema.safeExtend({
  id: z.string().uuid(),
});

export const deleteChildActivitySchema = z.object({
  id: z.string().uuid(),
});
