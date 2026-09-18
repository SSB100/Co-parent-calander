import { parseISO } from "date-fns";
import { z } from "zod";
import { proposalReasonSchema } from "@/lib/approvals/http";
import { FORTNIGHT_SLOTS } from "@/lib/recurrence/fortnight";

export const parentingScheduleDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (value) => !Number.isNaN(parseISO(value).getTime()),
    "Choose a valid date.",
  );

export const parentingScheduleSlotSchema = z.object({
  morningParentId: z.string().uuid().nullable(),
  afternoonParentId: z.string().uuid().nullable(),
});

export const parentingScheduleUpsertSchema = z
  .object({
    scheduleId: z.string().uuid().nullable().optional(),
    anchorDate: parentingScheduleDateSchema,
    endDate: parentingScheduleDateSchema.nullable(),
    pattern: z
      .array(parentingScheduleSlotSchema)
      .length(FORTNIGHT_SLOTS),
    reason: proposalReasonSchema,
  })
  .superRefine((value, context) => {
    if (value.endDate && value.endDate < value.anchorDate) {
      context.addIssue({
        code: "custom",
        path: ["endDate"],
        message:
          "The repeating schedule end date cannot be before its start date.",
      });
    }

    if (
      value.pattern.every(
        (slot) =>
          slot.morningParentId === null &&
          slot.afternoonParentId === null,
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["pattern"],
        message:
          "Choose at least one repeating day before saving this schedule.",
      });
    }
  });

export const parentingScheduleDeleteSchema = z.object({
  scheduleId: z.string().uuid(),
  reason: proposalReasonSchema,
});

export type ParentingScheduleSlot =
  z.infer<typeof parentingScheduleSlotSchema>;

export type SavedParentingSchedule = {
  scheduleId: string;
  anchorDate: string;
  endDate: string | null;
  pattern: ParentingScheduleSlot[];
  createdAt: string;
};

export function emptyParentingSchedulePattern() {
  return Array.from({ length: FORTNIGHT_SLOTS }, () => ({
    morningParentId: null,
    afternoonParentId: null,
  }));
}
