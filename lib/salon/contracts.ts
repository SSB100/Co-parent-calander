import { z } from "zod";

const uuid = z.string().uuid();
export const salonDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Choose a valid date.");
const instant = z.iso.datetime({ offset: true });
const version = z.number().int().min(1);
export const salonRoleSchema = z.enum(["owner", "manager", "practitioner"]);
export type SalonRole = z.infer<typeof salonRoleSchema>;
export const salonSettingsSchema = z.object({
  businessName: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).default(""),
  location: z.string().trim().max(200).default(""),
  publicEnabled: z.boolean(),
  leadMinutes: z.number().int().min(0).max(43200),
  advanceDays: z.number().int().min(1).max(365),
  slotMinutes: z.enum(["5", "10", "15", "20", "30", "60"]).transform(Number).or(z.union([z.literal(5), z.literal(10), z.literal(15), z.literal(20), z.literal(30), z.literal(60)])),
  cancellationHours: z.number().int().min(0).max(720),
}).strict();
export type SalonSettings = z.infer<typeof salonSettingsSchema>;
export const salonDefaults: SalonSettings = { businessName: "", description: "", location: "", publicEnabled: false, leadMinutes: 60, advanceDays: 90, slotMinutes: 15, cancellationHours: 24 };
export const salonServiceSchema = z.object({
  id: uuid.optional(), name: z.string().trim().min(1).max(120), description: z.string().trim().max(1000).default(""),
  durationMinutes: z.number().int().min(5).max(720), bufferBeforeMinutes: z.number().int().min(0).max(240), bufferAfterMinutes: z.number().int().min(0).max(240),
  priceMinor: z.number().int().min(0).max(10000000).nullable().default(null), currency: z.string().regex(/^[A-Z]{3}$/).default("NZD"),
  active: z.boolean().default(true), bookable: z.boolean().default(false),
}).strict();
export type SalonService = z.infer<typeof salonServiceSchema> & { id: string };
export const salonSelfProfileSchema = z.object({ displayName: z.string().trim().min(1).max(100), bio: z.string().trim().max(500).default(""), kind: z.enum(["staff", "contractor"]).default("staff") }).strict();
export const salonPractitionerSchema = salonSelfProfileSchema.extend({ id: uuid, active: z.boolean(), bookable: z.boolean(), role: salonRoleSchema });
export type SalonPractitioner = z.infer<typeof salonPractitionerSchema> & { own: boolean; serviceIds: string[] };
export const salonEligibilitySchema = z.object({ practitionerId: uuid, serviceIds: z.array(uuid).max(100).transform(ids => [...new Set(ids)]) }).strict();
export const salonHoursSchema = z.object({ practitionerId: uuid, hours: z.array(z.object({ weekday: z.number().int().min(0).max(6), startMinute: z.number().int().min(0).max(1439), endMinute: z.number().int().min(1).max(1440) }).strict().refine(v => v.endMinute > v.startMinute, "Closing time must be after opening time.")).max(28) }).strict().refine(({ hours }) => !hours.some((a, i) => hours.some((b, j) => j > i && a.weekday === b.weekday && a.startMinute < b.endMinute && b.startMinute < a.endMinute)), "Working hours must not overlap.");
export type SalonWorkingHours = z.infer<typeof salonHoursSchema>["hours"][number] & { id: string; practitionerId: string };
export const salonTimeBlockSchema = z.object({ id: uuid.optional(), practitionerId: uuid, start: instant, end: instant, reason: z.string().trim().max(500).default(""), active: z.boolean().default(true) }).strict().refine(v => Date.parse(v.end) > Date.parse(v.start), "End time must be after start time.");
export type SalonTimeBlock = z.infer<typeof salonTimeBlockSchema> & { id: string };
const clientDetails = { clientName: z.string().trim().min(1).max(100), clientEmail: z.string().trim().email().max(254).or(z.literal("")).default(""), clientPhone: z.string().trim().max(40).default("") };
export const salonExpectedTermsSchema = z.object({
  serviceName: z.string().trim().min(1).max(120), durationMinutes: z.number().int().min(5).max(720),
  priceMinor: z.number().int().min(0).max(10000000).nullable(), currency: z.string().regex(/^[A-Z]{3}$/),
  cancellationHours: z.number().int().min(0).max(720),
}).strict();
export type SalonExpectedTerms = z.infer<typeof salonExpectedTermsSchema>;
export const salonBookingSchema = z.object({ requestId: uuid, practitionerId: uuid, serviceId: uuid, start: instant, expectedTerms: salonExpectedTermsSchema, ...clientDetails }).strict();
export const salonManualBookingSchema = salonBookingSchema.extend({ notes: z.string().trim().max(2000).default("") });
export const salonRescheduleSchema = z.object({ id: uuid, version, start: instant }).strict();
export const salonCancelSchema = z.object({ id: uuid, version }).strict();
export const salonInviteSchema = z.object({ role: z.enum(["manager", "practitioner"]), displayName: z.string().trim().min(1).max(100), kind: z.enum(["staff", "contractor"]).default("staff") }).strict();
export const salonRevokeInviteSchema = z.object({ id: uuid }).strict();
export const salonActionSchema = z.enum(["saveSettings", "saveService", "addSelf", "savePractitioner", "saveEligibility", "saveHours", "saveTimeBlock", "book", "reschedule", "cancel", "createInvite", "revokeInvite"]);
export type SalonAction = z.infer<typeof salonActionSchema>;
export type SalonAppointment = { id: string; practitionerId: string; practitionerName: string; serviceId: string; serviceName: string; durationMinutes: number; bufferBeforeMinutes: number; bufferAfterMinutes: number; priceMinor: number | null; currency: string; cancellationHours: number; start: string; end: string; busyStart: string; busyEnd: string; status: "confirmed" | "cancelled"; version: number; clientName: string; clientEmail: string; clientPhone: string; notes: string; ownClient: boolean; ownPractitioner: boolean; canManage: boolean; canCancel: boolean; canReschedule: boolean };
export type SalonSlot = { practitionerId: string; start: string; end: string };
export type SalonUpdate = { id: string; appointmentId: string; action: string; createdAt: string };
export type SalonInvitation = { id: string; role: "manager" | "practitioner"; displayName: string; kind: "staff" | "contractor"; expiresAt: string; revoked: boolean; used: boolean; codeHint: string };
export type SalonData = { calendarId: string; timezone: string; date: string; role: SalonRole; ownPractitionerId: string | null; canOrganise: boolean; canPublish: boolean; settings: SalonSettings; practitioners: SalonPractitioner[]; services: SalonService[]; hours: SalonWorkingHours[]; timeBlocks: SalonTimeBlock[]; appointments: SalonAppointment[]; appointmentsTruncated: boolean; updates: SalonUpdate[]; invitations: SalonInvitation[] };
export type PublicSalonPractitioner = { id: string; displayName: string; bio: string; serviceIds: string[] };
export type PublicSalonService = Pick<SalonService, "id" | "name" | "description" | "durationMinutes" | "priceMinor" | "currency">;
export type PublicSalonData = { calendarId: string; businessName: string; description: string; location: string; timezone: string; date: string; cancellationHours: number; leadMinutes: number; advanceDays: number; services: PublicSalonService[]; practitioners: PublicSalonPractitioner[]; slots: SalonSlot[] };
export type OwnSalonAppointment = { calendarId: string; businessName: string; location: string; timezone: string; date: string; appointment: Omit<SalonAppointment, "notes">; slots: SalonSlot[] };
export type SalonMutationResult = { ok: true; id?: string; version?: number; status?: "confirmed" | "cancelled"; code?: string; expiresAt?: string };
/** Trusted server identity only. Never construct this from request JSON. */
export type SalonUser = { id: string };
