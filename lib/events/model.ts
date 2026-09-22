import { differenceInCalendarDays, parseISO } from "date-fns";
import { z } from "zod";

export const eventCategoryValues = [
  "school",
  "sport",
  "medical",
  "birthday",
  "holiday",
  "activity",
  "other",
] as const;

export const eventRecurrenceValues = [
  "none",
  "weekly",
  "fortnightly",
  "monthly",
  "yearly",
] as const;

export const eventDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (value) => !Number.isNaN(parseISO(value).getTime()),
    "Choose a valid date.",
  );

export const eventDetailsSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Add an event title.")
      .max(80, "Keep the title under 80 characters."),
    description: z
      .string()
      .trim()
      .max(500, "Keep the event note under 500 characters.")
      .nullable()
      .transform((value) => (value ? value : null)),
    category: z.enum(eventCategoryValues),
    startDate: eventDateSchema,
    endDate: eventDateSchema.nullable(),
    recurrence: z.enum(eventRecurrenceValues).default("none"),
    recurrenceEndDate: eventDateSchema.nullable().default(null),
  })
  .superRefine((value, context) => {
    const endDate = value.endDate ?? value.startDate;
    if (endDate < value.startDate) {
      context.addIssue({
        code: "custom",
        message: "The event end date cannot be before the start date.",
      });
      return;
    }

    if (differenceInCalendarDays(parseISO(endDate), parseISO(value.startDate)) > 31) {
      context.addIssue({
        code: "custom",
        message: "Events can span up to 32 days.",
      });
    }

    if (
      value.recurrence !== "none" &&
      value.recurrenceEndDate &&
      value.recurrenceEndDate < value.startDate
    ) {
      context.addIssue({
        code: "custom",
        message: "The repeat-until date cannot be before the first event.",
      });
    }

    if (value.recurrence === "none" && value.recurrenceEndDate) {
      context.addIssue({
        code: "custom",
        message: "Choose a repeat option before setting a repeat-until date.",
      });
    }
  });

export const createEventSchema = eventDetailsSchema;

export const editEventSchema = eventDetailsSchema.safeExtend({
  id: z.string().uuid(),
});

export const deleteEventSchema = z.object({
  id: z.string().uuid(),
});

export type EventDetails = z.infer<typeof eventDetailsSchema>;
