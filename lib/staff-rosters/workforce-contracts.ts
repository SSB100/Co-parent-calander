import { z } from "zod";

export const staffClockActionSchema = z.object({
  action: z.enum(["clock_in", "clock_out"]),
  confirmUnrostered: z.boolean().optional().default(false),
});

export const staffTimesheetWeekSchema = z.object({
  weekStart: z.iso.date(),
});

export const staffTimesheetCorrectionSchema = z
  .object({
    clockSessionId: z.string().uuid(),
    requestedClockInAt: z.iso.datetime({ offset: true }).nullable().optional(),
    requestedClockOutAt: z.iso.datetime({ offset: true }).nullable().optional(),
    reason: z.string().trim().min(1, "Add a short reason.").max(500),
  })
  .refine(
    (value) => value.requestedClockInAt || value.requestedClockOutAt,
    "Request a corrected clock-in or clock-out time.",
  );

export const staffTimesheetCorrectionReviewSchema = z.object({
  correctionId: z.string().uuid(),
  decision: z.enum(["approved", "declined"]),
});

export const staffTimesheetManagerCorrectionSchema = z.object({
  clockSessionId: z.string().uuid(),
  clockInAt: z.iso.datetime({ offset: true }),
  clockOutAt: z.iso.datetime({ offset: true }),
  reason: z
    .string()
    .trim()
    .max(500, "Keep the correction note under 500 characters.")
    .transform((value) => value || null)
    .optional()
    .default(null),
});

const optionalTime = z
  .union([
    z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a valid time."),
    z.literal(""),
    z.null(),
  ])
  .transform((value) => (value ? value : null));

export const staffLeaveRequestSchema = z
  .object({
    startDate: z.iso.date(),
    endDate: z.iso.date(),
    allDay: z.boolean().default(true),
    startTime: optionalTime.optional().default(null),
    endTime: optionalTime.optional().default(null),
    note: z.string().trim().max(500).transform((value) => value || null).optional().default(null),
  })
  .superRefine((value, context) => {
    if (value.endDate < value.startDate) {
      context.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "Leave must end on or after it starts.",
      });
    }

    if (value.allDay) {
      if (value.startTime || value.endTime) {
        context.addIssue({
          code: "custom",
          path: ["startTime"],
          message: "All-day leave does not use start or end times.",
        });
      }
      return;
    }

    if (!value.startTime || !value.endTime) {
      context.addIssue({
        code: "custom",
        path: ["startTime"],
        message: "Part-day leave needs both a start and finish time.",
      });
      return;
    }

    if (value.endTime <= value.startTime) {
      context.addIssue({
        code: "custom",
        path: ["endTime"],
        message: "Leave finish time must be after the start time.",
      });
    }
  });

export const staffLeaveCancelSchema = z.object({
  leaveRequestId: z.string().uuid(),
});

export const staffLeaveReviewSchema = z.object({
  leaveRequestId: z.string().uuid(),
  decision: z.enum(["approved", "declined"]),
});

export const staffLeaveRangeSchema = z.object({
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});
