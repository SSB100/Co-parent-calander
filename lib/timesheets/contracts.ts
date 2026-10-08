import { z } from "zod";

/** Standalone Timesheets contracts. These do not grant Staff Rosters access. */
export const TIMESHEETS_INCREMENTS = [5, 10, 15, 30, 60] as const;
export const DEFAULT_TIMESHEETS_INCREMENT = 15;
export const MAX_TIMESHEETS_DURATION_MINUTES = 24 * 60;
export const timesheetsIncrementSchema = z.union([
  z.literal(5), z.literal(10), z.literal(15), z.literal(30), z.literal(60),
]);
export type TimesheetsIncrement = z.infer<typeof timesheetsIncrementSchema>;
export const timesheetsRoleSchema = z.enum(["owner", "manager", "member"]);
export type TimesheetsRole = z.infer<typeof timesheetsRoleSchema>;
export const timesheetsDisambiguationSchema = z.enum(["earlier", "later"]);
export type TimesheetsDisambiguation = z.infer<typeof timesheetsDisambiguationSchema>;
export const timesheetsViewSchema = z.enum(["day", "week"]);
export type TimesheetsView = z.infer<typeof timesheetsViewSchema>;

export const timesheetsDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const instant = new Date(`${value}T00:00:00Z`);
  return value.slice(0, 4) !== "0000" && Number.isFinite(instant.getTime()) && instant.toISOString().slice(0, 10) === value;
}, "Choose a valid date.");
export const timesheetsTimezoneSchema = z.string().trim().min(1).max(100).refine(value => {
  // Fixed-offset inputs are not an organisation timezone, even on newer Intl runtimes.
  if (/^[+-]/.test(value)) return false;
  try { new Intl.DateTimeFormat("en", { timeZone: value }).format(0); return true; }
  catch { return false; }
}, "Choose a valid IANA timezone.");
export const timesheetsLocalTimeSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/, "Use a whole-minute date and time.")
  .refine(value => timesheetsDateSchema.safeParse(value.slice(0, 10)).success, "Choose a valid date and time.");

const uuid = z.string().uuid();
const version = z.number().int().min(1);
const name = z.string().trim().min(1).max(120);
const reason = z.string().trim().max(500).refine(value => !value || value.length >= 3, "Use at least 3 characters for the reason.").optional();
const versionedUpdate = (value: { id?: string; version?: number }) => !value.id || value.version !== undefined;
const updateMessage = { message: "Reload this record before editing.", path: ["version"] };

export const timesheetsSettingsSchema = z.object({ name, timezone: timesheetsTimezoneSchema, incrementMinutes: timesheetsIncrementSchema, version }).strict();
export const timesheetsStaffSchema = z.object({
  id: uuid.optional(), displayName: z.string().trim().min(1).max(100), email: z.string().trim().email().max(254).transform(value => value.toLowerCase()),
  role: z.enum(["manager", "member"]), active: z.boolean(), version: version.optional(),
}).strict().refine(versionedUpdate, updateMessage);
export const timesheetsAssignmentSchema = z.object({ managerStaffId: uuid, staffId: uuid, assigned: z.boolean() }).strict()
  .refine(value => value.managerStaffId !== value.staffId, "A manager already has access to their own entries.");
export const timesheetsClientSchema = z.object({ id: uuid.optional(), name, active: z.boolean(), version: version.optional() }).strict().refine(versionedUpdate, updateMessage);
export const timesheetsProjectSchema = z.object({ id: uuid.optional(), clientId: uuid, name, active: z.boolean(), version: version.optional() }).strict().refine(versionedUpdate, updateMessage);
export const timesheetsSaveEntrySchema = z.object({
  id: uuid.optional(), staffId: uuid, clientId: uuid.nullable(), projectId: uuid.nullable(),
  startLocal: timesheetsLocalTimeSchema, endLocal: timesheetsLocalTimeSchema,
  startDisambiguation: timesheetsDisambiguationSchema.optional(), endDisambiguation: timesheetsDisambiguationSchema.optional(),
  notes: z.string().trim().max(4000), billable: z.boolean(), organisationVersion: version, version: version.optional(), reason,
}).strict().refine(versionedUpdate, updateMessage)
  .refine(value => value.projectId === null || value.clientId !== null, { message: "Choose a client for this project.", path: ["clientId"] });
export const timesheetsDeleteEntrySchema = z.object({ id: uuid, version, reason }).strict();

export const timesheetsCommandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("saveSettings"), data: timesheetsSettingsSchema }).strict(),
  z.object({ action: z.literal("saveStaff"), data: timesheetsStaffSchema }).strict(),
  z.object({ action: z.literal("assignManager"), data: timesheetsAssignmentSchema }).strict(),
  z.object({ action: z.literal("saveClient"), data: timesheetsClientSchema }).strict(),
  z.object({ action: z.literal("saveProject"), data: timesheetsProjectSchema }).strict(),
  z.object({ action: z.literal("createInvite"), data: z.object({ staffId: uuid }).strict() }).strict(),
  z.object({ action: z.literal("revokeInvite"), data: z.object({ id: uuid }).strict() }).strict(),
  z.object({ action: z.literal("saveEntry"), data: timesheetsSaveEntrySchema }).strict(),
  z.object({ action: z.literal("deleteEntry"), data: timesheetsDeleteEntrySchema }).strict(),
]);
export type TimesheetsCommand = z.infer<typeof timesheetsCommandSchema>;
export type TimesheetsSaveEntry = z.infer<typeof timesheetsSaveEntrySchema>;
export type TimesheetsOrganisation = { id: string; name: string; timezone: string; incrementMinutes: TimesheetsIncrement; version: number };
export type TimesheetsStaff = { id: string; displayName: string; email: string; role: TimesheetsRole; active: boolean; own: boolean; linked: boolean; version: number };
export type TimesheetsClient = { id: string; name: string; active: boolean; version: number };
export type TimesheetsProject = { id: string; clientId: string; name: string; active: boolean; version: number };
export type TimesheetsAssignment = { managerStaffId: string; staffId: string };
export type TimesheetsEntry = {
  id: string; staffId: string; clientId: string | null; projectId: string | null;
  start: string; end: string; timezone: string; notes: string; billable: boolean;
  durationMinutes: number; incrementMinutes: TimesheetsIncrement; version: number;
};
export type TimesheetsInvitation = { id: string; staffId: string; email: string; expiresAt: string; revoked: boolean; used: boolean };
export type TimesheetsTotal = { staffId: string; totalMinutes: number; billableMinutes: number };
export type TimesheetsData = {
  calendarId: string; organisation: TimesheetsOrganisation; role: TimesheetsRole; ownStaffId: string | null;
  date: string; view: TimesheetsView; staff: TimesheetsStaff[]; clients: TimesheetsClient[]; projects: TimesheetsProject[];
  assignments: TimesheetsAssignment[]; entries: TimesheetsEntry[]; invitations: TimesheetsInvitation[]; totals: TimesheetsTotal[];
};
export type TimesheetsMutationResult = { ok: true; id?: string; version?: number; invitationUrl?: string; expiresAt?: string };
