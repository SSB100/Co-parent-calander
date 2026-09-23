import { z } from "zod";

export const staffAccessRoleSchema = z.enum(["owner", "manager", "staff"]);

const optionalUuid = z
  .union([z.string().uuid(), z.literal(""), z.null()])
  .transform((value) => (value ? value : null));

const optionalContactEmail = z.union([z.email().max(320), z.literal(""), z.null()]).optional().transform((value) => value || null);
const optionalContactPhone = z.union([z.string().trim().max(40), z.null()]).optional().transform((value) => value || null);
const optionalWeeklyMinutes = z.union([z.number().int().min(0).max(10080), z.null()]).optional().transform((value) => value ?? null);

export const createStaffMemberSchema = z.object({
  displayName: z.string().trim().min(1, "Add the staff member's name.").max(80),
  accessRole: z.enum(["manager", "staff"]).default("staff"),
  roleIds: z.array(z.string().uuid()).max(20).optional().default([]),
  defaultRoleId: optionalUuid.optional().default(null),
  defaultLocationId: optionalUuid.optional().default(null),
  contactEmail: optionalContactEmail,
  contactPhone: optionalContactPhone,
  expectedWeeklyMinutes: optionalWeeklyMinutes,
});

export const updateStaffMemberSchema = z.object({
  memberId: z.string().uuid(),
  displayName: z.string().trim().min(1).max(80),
  accessRole: z.enum(["manager", "staff"]),
  roleIds: z.array(z.string().uuid()).max(20).optional().default([]),
  defaultRoleId: optionalUuid.optional().default(null),
  defaultLocationId: optionalUuid.optional().default(null),
  contactEmail: optionalContactEmail,
  contactPhone: optionalContactPhone,
  expectedWeeklyMinutes: optionalWeeklyMinutes,
  active: z.boolean().default(true),
});

export const staffStructureKindSchema = z.enum(["role", "location"]);

export const createStaffStructureSchema = z.object({
  kind: staffStructureKindSchema,
  name: z.string().trim().min(1, "Add a name.").max(100),
});

export const archiveStaffStructureSchema = z.object({
  kind: staffStructureKindSchema,
  id: z.string().uuid(),
});

const timeValue = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a valid time.")
  .nullable();

export const staffAvailabilitySchema = z
  .object({
    memberId: z.string().uuid(),
    date: z.iso.date(),
    status: z.enum(["available", "unavailable"]),
    startTime: z
      .union([timeValue, z.literal("")])
      .transform((value) => (value ? value : null)),
    endTime: z
      .union([timeValue, z.literal("")])
      .transform((value) => (value ? value : null)),
    note: z
      .string()
      .trim()
      .max(240, "Keep the note under 240 characters.")
      .transform((value) => value || null)
      .optional()
      .default(null),
  })
  .superRefine((value, context) => {
    const hasStart = Boolean(value.startTime);
    const hasEnd = Boolean(value.endTime);

    if (hasStart !== hasEnd) {
      context.addIssue({
        code: "custom",
        path: [hasStart ? "endTime" : "startTime"],
        message: "Add both a start and end time, or leave both blank for all day.",
      });
      return;
    }

    if (value.startTime && value.endTime && value.endTime <= value.startTime) {
      context.addIssue({
        code: "custom",
        path: ["endTime"],
        message: "End time must be after start time.",
      });
    }
  });

export const staffAvailabilityRangeSchema = z
  .object({
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
  })
  .refine(
    (value) => !value.from || !value.to || value.to >= value.from,
    "Availability range end must be on or after the start.",
  );

export const staffAvailabilityIdSchema = z.string().uuid();


const shiftTimeValue = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a valid shift time.");

export const staffShiftSchema = z
  .object({
    memberId: z.string().uuid(),
    date: z.iso.date(),
    startTime: shiftTimeValue,
    endTime: shiftTimeValue,
    roleId: optionalUuid.optional().default(null),
    locationId: optionalUuid.optional().default(null),
    note: z
      .string()
      .trim()
      .max(500, "Keep the shift note under 500 characters.")
      .transform((value) => value || null)
      .optional()
      .default(null),
    overrideAvailabilityConflict: z.boolean().optional().default(false),
  })
  .superRefine((value, context) => {
    if (value.endTime <= value.startTime) {
      context.addIssue({
        code: "custom",
        path: ["endTime"],
        message: "Shift end time must be after the start time.",
      });
    }
  });

export const updateStaffShiftSchema = staffShiftSchema.safeExtend({
  shiftId: z.string().uuid(),
});

export const staffShiftIdSchema = z.string().uuid();

export const staffRosterWeekSchema = z.object({
  weekStart: z.iso.date(),
});

export const copyStaffRosterWeekSchema = z.object({
  weekStart: z.iso.date(),
});

export const staffRosterPublicationSchema = z.object({
  weekStart: z.iso.date(),
});

export const staffRosterOperationalHoursSchema = z
  .object({
    startMinute: z.number().int().min(0).max(23 * 60 + 45),
    endMinute: z.number().int().min(15).max(24 * 60),
  })
  .superRefine((value, context) => {
    if (value.startMinute % 15 !== 0 || value.endMinute % 15 !== 0) {
      context.addIssue({
        code: "custom",
        message: "Operational hours must use 15-minute increments.",
      });
    }
    if (value.endMinute <= value.startMinute) {
      context.addIssue({
        code: "custom",
        path: ["endMinute"],
        message: "Operational end time must be after the start time.",
      });
    }
  });
