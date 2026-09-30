import { z } from "zod";

export const facilityDefaults = {
  openMinute: 8 * 60,
  closeMinute: 22 * 60,
  openDays: [0, 1, 2, 3, 4, 5, 6],
  minDuration: 30,
  maxDuration: 240,
  minNoticeHours: 0,
  advanceDays: 90,
  cancellationHours: 0,
  maxActiveBookings: 10,
  requireApproval: false,
  shareTitles: false,
};
export const facilityRulesSchema = z.object({
  openMinute: z.number().int().min(0).max(1439),
  closeMinute: z.number().int().min(1).max(1440),
  openDays: z.array(z.number().int().min(0).max(6)).min(1).max(7).transform((days) => [...new Set(days)]),
  minDuration: z.number().int().min(15).max(1440),
  maxDuration: z.number().int().min(15).max(1440),
  minNoticeHours: z.number().int().min(0).max(720),
  advanceDays: z.number().int().min(1).max(365),
  cancellationHours: z.number().int().min(0).max(720),
  maxActiveBookings: z.number().int().min(1).max(100),
  requireApproval: z.boolean(),
  shareTitles: z.boolean(),
}).refine((rule) => rule.closeMinute > rule.openMinute, { message: "Closing time must be after opening time." })
  .refine((rule) => rule.maxDuration >= rule.minDuration, { message: "Maximum duration must be at least the minimum." })
  .refine((rule) => rule.minDuration <= rule.closeMinute - rule.openMinute, { message: "The minimum booking must fit inside opening hours." });
export type FacilityRules = z.infer<typeof facilityRulesSchema>;
export const facilityResourceSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Add a resource name.").max(100),
  description: z.string().trim().max(1000).default(""),
  location: z.string().trim().max(160).default(""),
  capacity: z.number().int().min(1).max(10000).nullable().default(null),
  active: z.boolean().default(true),
});
export const facilityBookingSchema = z.object({
  id: z.string().uuid().optional(),
  version: z.number().int().min(1).optional(),
  requestId: z.string().uuid().optional(),
  resourceId: z.string().uuid(),
  title: z.string().trim().max(120).default(""),
  notes: z.string().trim().max(2000).default(""),
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Choose a valid start time."),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Choose a valid end time."),
}).refine((booking) => !booking.id || booking.version, { message: "Reload this booking before editing." })
  .refine((booking) => booking.id || booking.requestId, { message: "Reopen the booking form and try again." });
export const facilityDecisionSchema = z.object({
  id: z.string().uuid(),
  version: z.number().int().min(1),
  action: z.enum(["confirm", "decline", "cancel"]),
});
export type FacilityResource = { id: string; name: string; description: string; location: string; capacity: number | null; active: boolean };
export type FacilityBooking = { id: string; resourceId: string; title: string; notes: string; start: string; end: string; status: "pending" | "confirmed" | "cancelled" | "declined"; own: boolean; version: number; canManage: boolean };
export type FacilityUpdate = { id: string; action: string; resourceName: string; createdAt: string };
export type FacilityData = { resources: FacilityResource[]; bookings: FacilityBooking[]; rules: FacilityRules; updates: FacilityUpdate[]; owner: boolean; role: "owner" | "manager" | "member" | "viewer"; managedResourceIds: string[]; canBook: boolean; timezone: string; date: string };
