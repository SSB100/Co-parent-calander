import { z } from "zod";
import { FORTNIGHT_SLOTS } from "@/lib/recurrence/fortnight";

export const proposalIsoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/);

const proposalTime = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/)
  .nullable();

export const proposalAssignmentRowSchema = z.object({
  childId: z.string().uuid(),
  date: proposalIsoDate,
  morningParentId: z.string().uuid().nullable(),
  afternoonParentId: z.string().uuid().nullable(),
  handoverTime: proposalTime,
  handoverLocation: z.string().max(120).nullable(),
  note: z.string().max(500).nullable(),
});

export const parentingAssignmentsProposalStateSchema = z.object({
  kind: z.literal("parenting_assignments"),
  dates: z.array(proposalIsoDate).min(1).max(62),
  assignments: z.array(proposalAssignmentRowSchema).min(1),
});

const recurringSlotSchema = z.object({
  morningParentId: z.string().uuid().nullable(),
  afternoonParentId: z.string().uuid().nullable(),
});

export const recurringScheduleUpsertProposalStateSchema = z.object({
  kind: z.literal("recurring_schedule"),
  mode: z.literal("upsert"),
  scheduleId: z.string().uuid(),
  anchorDate: proposalIsoDate,
  endDate: proposalIsoDate.nullable(),
  pattern: z.array(recurringSlotSchema).length(FORTNIGHT_SLOTS),
});

export const recurringScheduleDeleteProposalStateSchema = z.object({
  kind: z.literal("recurring_schedule"),
  mode: z.literal("delete"),
  scheduleId: z.string().uuid(),
});

export const recurringScheduleProposalStateSchema = z.discriminatedUnion("mode", [
  recurringScheduleUpsertProposalStateSchema,
  recurringScheduleDeleteProposalStateSchema,
]);

export const sharedEventValueSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(80),
  description: z.string().max(500).nullable(),
  category: z.enum(["school", "sport", "medical", "birthday", "holiday", "activity", "other"]),
  startDate: proposalIsoDate,
  endDate: proposalIsoDate.nullable(),
});

export const sharedEventProposalStateSchema = z.object({
  kind: z.literal("shared_event"),
  event: sharedEventValueSchema.nullable(),
});

export const calendarProposalStateSchema = z.union([
  parentingAssignmentsProposalStateSchema,
  recurringScheduleProposalStateSchema,
  sharedEventProposalStateSchema,
]);

export type ProposalAssignmentRow = z.infer<typeof proposalAssignmentRowSchema>;
export type ParentingAssignmentsProposalState = z.infer<
  typeof parentingAssignmentsProposalStateSchema
>;
export type RecurringScheduleProposalState = z.infer<
  typeof recurringScheduleProposalStateSchema
>;
export type SharedEventProposalState = z.infer<typeof sharedEventProposalStateSchema>;
