import { z } from "zod";
import { getSql } from "@/lib/db";
import type { TemplateSession } from "@/lib/calendar-sharing/access";
import { localDateInTimeZone } from "@/lib/calendar/time";
import { generateInviteCode, normalizeInviteCode } from "@/lib/security/invites";
import { hashToken } from "@/lib/security/tokens";
import {
  salonActionSchema, salonBookingSchema, salonCancelSchema, salonDateSchema, salonDefaults,
  salonEligibilitySchema, salonHoursSchema, salonInviteSchema, salonManualBookingSchema,
  salonPractitionerSchema, salonRescheduleSchema, salonRevokeInviteSchema, salonSelfProfileSchema,
  salonServiceSchema, salonSettingsSchema, salonTimeBlockSchema,
  type OwnSalonAppointment, type PublicSalonData, type SalonAction, type SalonAppointment,
  type SalonData, type SalonMutationResult, type SalonRole, type SalonSettings, type SalonSlot, type SalonUser,
} from "./contracts";
import { generateSalonSlots, salonDayBounds, type SlotProvider, type SlotService } from "./slots";

export type SalonSession = TemplateSession;
export class SalonError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
type Access = { calendarId: string; userId: string; calendarName: string; timezone: string; role: SalonRole; practitionerId: string | null; canOrganise: boolean };
const uuid = z.string().uuid();
function isoInstant(value: string | Date) { return new Date(value).toISOString(); }
function validDate(date: string | undefined, timezone: string) { return salonDateSchema.parse(date ?? localDateInTimeZone(timezone)); }
function requireSalon(session: SalonSession) {
  if (session.calendarType !== "salon_bookings") throw new SalonError("Choose a Salon calendar.", 403);
}
/** Re-read current authority. A stale session permission never grants Salon capabilities. */
async function currentAccess(session: SalonSession): Promise<Access> {
  requireSalon(session);
  const sql = getSql();
  const rows = await sql`SELECT c.id, c.name, c.timezone, m.permission, p.id AS practitioner_id, p.role, p.active
    FROM calendars c JOIN calendar_memberships m ON m.calendar_id=c.id AND m.user_id=${session.userId}
    LEFT JOIN salon_practitioners p ON p.calendar_id=c.id AND p.user_id=m.user_id
    WHERE c.id=${session.calendarId} AND c.calendar_type='salon_bookings' AND c.archived_at IS NULL`;
  const row = rows[0];
  if (!row || row.permission === "viewer" || (row.permission !== "owner" && !row.active)) throw new SalonError("Your Salon access has changed. Ask the business owner for access.", 403);
  const role: SalonRole = row.permission === "owner" ? "owner" : row.role === "manager" ? "manager" : "practitioner";
  return { calendarId: row.id, userId: session.userId, calendarName: row.name, timezone: row.timezone, role, practitionerId: row.active ? row.practitioner_id : null, canOrganise: role !== "practitioner" };
}
async function verifyReadAccess(session: SalonSession, before: Access) {
  const after = await currentAccess(session);
  if (after.role !== before.role || after.practitionerId !== before.practitionerId || after.timezone !== before.timezone) {
    throw new SalonError("Your Salon access changed while this view loaded. Reload the calendar.", 403);
  }
}
async function settingsFor(calendarId: string, calendarName: string): Promise<SalonSettings> {
  const sql = getSql();
  const rows = await sql`SELECT business_name, description, location, public_enabled, lead_minutes, advance_days, slot_minutes, cancellation_hours FROM salon_settings WHERE calendar_id=${calendarId}`;
  const row = rows[0];
  return row ? { businessName: row.business_name, description: row.description, location: row.location, publicEnabled: row.public_enabled, leadMinutes: row.lead_minutes, advanceDays: row.advance_days, slotMinutes: row.slot_minutes, cancellationHours: row.cancellation_hours } : { ...salonDefaults, businessName: calendarName };
}

type AppointmentRow = { id: string; practitioner_id: string; practitioner_name: string; service_id: string; service_name: string; duration_minutes: number; buffer_before_minutes: number; buffer_after_minutes: number; price_minor: number | null; currency: string; cancellation_hours: number; start_at: string | Date; end_at: string | Date; busy_start_at: string | Date; busy_end_at: string | Date; status: "confirmed" | "cancelled"; version: number; client_user_id: string | null; practitioner_user_id: string; client_name: string; client_email: string; client_phone: string; notes: string };
function appointmentProjection(row: AppointmentRow, userId: string, staff: boolean): SalonAppointment {
  const start = isoInstant(row.start_at), end = isoInstant(row.end_at);
  const upcoming = row.status === "confirmed" && Date.parse(staff ? end : start) > Date.now();
  const ownClient = row.client_user_id === userId;
  const ownPractitioner = row.practitioner_user_id === userId;
  const canManage = staff || ownClient;
  const beforeCutoff = Date.now() <= Date.parse(start) - row.cancellation_hours * 3600000;
  return { id: row.id, practitionerId: row.practitioner_id, practitionerName: row.practitioner_name, serviceId: row.service_id, serviceName: row.service_name, durationMinutes: row.duration_minutes, bufferBeforeMinutes: row.buffer_before_minutes, bufferAfterMinutes: row.buffer_after_minutes, priceMinor: row.price_minor, currency: row.currency, cancellationHours: row.cancellation_hours, start, end, busyStart: isoInstant(row.busy_start_at), busyEnd: isoInstant(row.busy_end_at), status: row.status, version: row.version, clientName: row.client_name, clientEmail: row.client_email, clientPhone: row.client_phone, notes: staff ? row.notes : "", ownClient, ownPractitioner, canManage, canCancel: canManage && upcoming && (staff || beforeCutoff), canReschedule: canManage && upcoming && (staff || beforeCutoff) };
}

export async function loadSalon(session: SalonSession, date?: string): Promise<SalonData> {
  const access = await currentAccess(session);
  const selectedDate = validDate(date, access.timezone);
  const bounds = salonDayBounds(access.timezone, selectedDate);
  const sql = getSql();
  const [settings, practitioners, services, hours, timeBlocks, appointments, updates, invitations] = await Promise.all([
    settingsFor(access.calendarId, access.calendarName),
    sql`SELECT p.id,p.display_name,p.bio,p.kind,p.role,p.active,p.bookable,p.user_id=${access.userId} AS own,
      COALESCE((SELECT array_agg(ps.service_id ORDER BY ps.service_id) FROM salon_practitioner_services ps WHERE ps.calendar_id=p.calendar_id AND ps.practitioner_id=p.id AND ps.active),'{}'::uuid[]) AS service_ids
      FROM salon_practitioners p WHERE p.calendar_id=${access.calendarId} AND (${access.canOrganise} OR p.id=${access.practitionerId}::uuid) ORDER BY p.active DESC,p.display_name`,
    sql`SELECT id,name,description,duration_minutes,buffer_before_minutes,buffer_after_minutes,price_minor,currency,active,bookable FROM salon_services WHERE calendar_id=${access.calendarId} ORDER BY active DESC,name`,
    sql`SELECT id,practitioner_id,weekday,start_minute,end_minute FROM salon_working_hours WHERE calendar_id=${access.calendarId} AND active AND (${access.canOrganise} OR practitioner_id=${access.practitionerId}::uuid) ORDER BY weekday,start_minute`,
    sql`SELECT id,practitioner_id,start_at,end_at,reason,active FROM salon_time_blocks WHERE calendar_id=${access.calendarId} AND active AND start_at<${bounds.end}::timestamptz AND end_at>${bounds.start}::timestamptz AND (${access.canOrganise} OR practitioner_id=${access.practitionerId}::uuid) ORDER BY start_at`,
    sql`WITH upcoming AS (
      SELECT id FROM salon_appointments WHERE calendar_id=${access.calendarId} AND (${access.canOrganise} OR practitioner_id=${access.practitionerId}::uuid)
      AND end_at>=now()-interval '7 days' ORDER BY start_at LIMIT 201
    ), selected_day AS (
      SELECT id FROM salon_appointments WHERE calendar_id=${access.calendarId} AND (${access.canOrganise} OR practitioner_id=${access.practitionerId}::uuid)
      AND busy_start_at<${bounds.end}::timestamptz AND busy_end_at>${bounds.start}::timestamptz
    ), relevant AS (SELECT id FROM upcoming UNION SELECT id FROM selected_day)
    SELECT a.*,p.display_name AS practitioner_name,p.user_id AS practitioner_user_id,(SELECT count(*) FROM upcoming)>=201 AS window_truncated
    FROM salon_appointments a JOIN relevant r ON r.id=a.id JOIN salon_practitioners p ON p.id=a.practitioner_id AND p.calendar_id=a.calendar_id
    WHERE a.calendar_id=${access.calendarId} ORDER BY a.start_at`,
    sql`SELECT u.id,u.appointment_id,u.action,u.created_at FROM salon_updates u JOIN salon_appointments a ON a.id=u.appointment_id AND a.calendar_id=u.calendar_id
      WHERE u.calendar_id=${access.calendarId} AND (${access.canOrganise} OR a.practitioner_id=${access.practitionerId}::uuid) ORDER BY u.created_at DESC LIMIT 100`,
    access.canOrganise ? sql`SELECT i.id,r.role,r.display_name,r.kind,i.expires_at,i.revoked_at IS NOT NULL AS revoked,i.use_count>=i.max_uses AS used,i.code_hint
      FROM calendar_invites i JOIN salon_invite_roles r ON r.invite_id=i.id AND r.calendar_id=i.calendar_id
      WHERE i.calendar_id=${access.calendarId} AND (${access.role === "owner"} OR i.created_by_user_id=${access.userId}) ORDER BY i.created_at DESC LIMIT 100` : Promise.resolve([]),
  ]);
  await verifyReadAccess(session, access);
  return { calendarId: access.calendarId, timezone: access.timezone, date: selectedDate, role: access.role, ownPractitionerId: access.practitionerId, canOrganise: access.canOrganise, canPublish: access.role === "owner", settings,
    practitioners: practitioners.map(p => ({ id: p.id, displayName: p.display_name, bio: p.bio, kind: p.kind, role: p.role, active: p.active, bookable: p.bookable, own: p.own, serviceIds: p.service_ids })),
    services: services.map(s => ({ id: s.id, name: s.name, description: s.description, durationMinutes: s.duration_minutes, bufferBeforeMinutes: s.buffer_before_minutes, bufferAfterMinutes: s.buffer_after_minutes, priceMinor: s.price_minor, currency: s.currency, active: s.active, bookable: s.bookable })),
    hours: hours.map(h => ({ id: h.id, practitionerId: h.practitioner_id, weekday: h.weekday, startMinute: h.start_minute, endMinute: h.end_minute })),
    timeBlocks: timeBlocks.map(b => ({ id: b.id, practitionerId: b.practitioner_id, start: isoInstant(b.start_at), end: isoInstant(b.end_at), reason: b.reason, active: b.active })),
    appointments: appointments.map(a => appointmentProjection(a as AppointmentRow, access.userId, true)), appointmentsTruncated: appointments.some(a => a.window_truncated),
    updates: updates.map(u => ({ id: u.id, appointmentId: u.appointment_id, action: u.action, createdAt: isoInstant(u.created_at) })),
    invitations: invitations.map(i => ({ id: i.id, role: i.role, displayName: i.display_name, kind: i.kind, expiresAt: isoInstant(i.expires_at), revoked: i.revoked, used: i.used, codeHint: i.code_hint })),
  };
}

type SlotsContext = { calendarId: string; timezone: string; date: string; settings: SalonSettings; serviceId: string; practitionerId?: string; ownPractitionerId?: string | null; publicOnly: boolean; snapshot?: SlotService; excludeAppointmentId?: string };
async function slotsFor(context: SlotsContext): Promise<SalonSlot[]> {
  const { calendarId, timezone, date, settings, serviceId, practitionerId, publicOnly } = context;
  uuid.parse(serviceId); if (practitionerId) uuid.parse(practitionerId);
  const bounds = salonDayBounds(timezone, date);
  const sql = getSql();
  const [services, practitioners, hours, busy] = await Promise.all([
    sql`SELECT duration_minutes,buffer_before_minutes,buffer_after_minutes FROM salon_services WHERE id=${serviceId} AND calendar_id=${calendarId} AND active AND (NOT ${publicOnly} OR bookable)`,
    sql`SELECT p.id FROM salon_practitioners p JOIN calendar_memberships m ON m.calendar_id=p.calendar_id AND m.user_id=p.user_id
      JOIN salon_practitioner_services ps ON ps.calendar_id=p.calendar_id AND ps.practitioner_id=p.id AND ps.service_id=${serviceId} AND ps.active
      WHERE p.calendar_id=${calendarId} AND p.active AND m.permission IN ('owner','editor') AND (NOT ${publicOnly} OR p.bookable)
      AND (${practitionerId ?? null}::uuid IS NULL OR p.id=${practitionerId ?? null}::uuid)
      AND (${context.ownPractitionerId === undefined} OR p.id=${context.ownPractitionerId ?? null}::uuid)`,
    sql`SELECT practitioner_id,weekday,start_minute,end_minute FROM salon_working_hours WHERE calendar_id=${calendarId} AND active`,
    sql`SELECT practitioner_id,busy_start_at AS start,busy_end_at AS "end" FROM salon_appointments WHERE calendar_id=${calendarId} AND status='confirmed'
      AND busy_start_at<${bounds.end}::timestamptz AND busy_end_at>${bounds.start}::timestamptz AND (${context.excludeAppointmentId ?? null}::uuid IS NULL OR id<>${context.excludeAppointmentId ?? null}::uuid)
      UNION ALL SELECT practitioner_id,start_at AS start,end_at AS "end" FROM salon_time_blocks WHERE calendar_id=${calendarId} AND active AND start_at<${bounds.end}::timestamptz AND end_at>${bounds.start}::timestamptz`,
  ]);
  if (!services[0]) return [];
  const current = services[0];
  const service = context.snapshot ?? { durationMinutes: current.duration_minutes, bufferBeforeMinutes: current.buffer_before_minutes, bufferAfterMinutes: current.buffer_after_minutes };
  const providers: SlotProvider[] = practitioners.map(p => ({ id: p.id, hours: hours.filter(h => h.practitioner_id === p.id).map(h => ({ weekday: h.weekday, startMinute: h.start_minute, endMinute: h.end_minute })), busy: busy.filter(b => b.practitioner_id === p.id).map(b => ({ start: isoInstant(b.start), end: isoInstant(b.end) })) }));
  return generateSalonSlots({ timezone, date, rules: settings, service, providers });
}
export async function loadSalonSlots(session: SalonSession, date: string, serviceId: string, practitionerId?: string): Promise<SalonSlot[]> {
  const access = await currentAccess(session);
  const settings = await settingsFor(access.calendarId, access.calendarName);
  const slots = await slotsFor({ calendarId: access.calendarId, timezone: access.timezone, date: validDate(date, access.timezone), settings, serviceId, practitionerId, publicOnly: false, ownPractitionerId: access.canOrganise ? undefined : access.practitionerId });
  await verifyReadAccess(session, access);
  return slots;
}
export async function loadSalonAppointmentSlots(session: SalonSession, id: string, date: string): Promise<SalonSlot[]> {
  const access = await currentAccess(session); uuid.parse(id);
  const sql = getSql();
  const rows = await sql`SELECT id,service_id,practitioner_id,duration_minutes,buffer_before_minutes,buffer_after_minutes FROM salon_appointments
    WHERE id=${id} AND calendar_id=${access.calendarId} AND status='confirmed' AND end_at>now() AND (${access.canOrganise} OR practitioner_id=${access.practitionerId}::uuid)`;
  const a = rows[0]; if (!a) throw new SalonError("This appointment is unavailable.", 404);
  const slots = await slotsFor({ calendarId: access.calendarId, timezone: access.timezone, date: validDate(date, access.timezone), settings: await settingsFor(access.calendarId, access.calendarName), serviceId: a.service_id, practitionerId: a.practitioner_id, publicOnly: false, snapshot: { durationMinutes: a.duration_minutes, bufferBeforeMinutes: a.buffer_before_minutes, bufferAfterMinutes: a.buffer_after_minutes }, excludeAppointmentId: a.id });
  await verifyReadAccess(session, access);
  return slots;
}

export async function loadPublicSalon(calendarId: string, date?: string, serviceId?: string, practitionerId?: string): Promise<PublicSalonData> {
  uuid.parse(calendarId); if (serviceId) uuid.parse(serviceId); if (practitionerId) uuid.parse(practitionerId);
  const sql = getSql();
  const businesses = await sql`SELECT c.name,c.timezone,s.business_name,s.description,s.location,s.lead_minutes,s.advance_days,s.slot_minutes,s.cancellation_hours FROM calendars c JOIN salon_settings s ON s.calendar_id=c.id WHERE c.id=${calendarId} AND c.calendar_type='salon_bookings' AND c.archived_at IS NULL AND s.public_enabled`;
  const business = businesses[0]; if (!business) throw new SalonError("This booking page is not available.", 404);
  const selectedDate = validDate(date, business.timezone);
  const [services, practitioners] = await Promise.all([
    sql`SELECT s.id,s.name,s.description,s.duration_minutes,s.price_minor,s.currency FROM salon_services s WHERE s.calendar_id=${calendarId} AND s.active AND s.bookable
      AND EXISTS(SELECT 1 FROM salon_practitioner_services ps JOIN salon_practitioners p ON p.id=ps.practitioner_id AND p.calendar_id=ps.calendar_id JOIN calendar_memberships m ON m.calendar_id=p.calendar_id AND m.user_id=p.user_id
      WHERE ps.calendar_id=s.calendar_id AND ps.service_id=s.id AND ps.active AND p.active AND p.bookable AND m.permission IN ('owner','editor')) ORDER BY s.name`,
    sql`SELECT p.id,p.display_name,p.bio,array_agg(s.id ORDER BY s.id) AS service_ids FROM salon_practitioners p
      JOIN calendar_memberships m ON m.calendar_id=p.calendar_id AND m.user_id=p.user_id
      JOIN salon_practitioner_services ps ON ps.practitioner_id=p.id AND ps.calendar_id=p.calendar_id AND ps.active
      JOIN salon_services s ON s.id=ps.service_id AND s.calendar_id=ps.calendar_id AND s.active AND s.bookable
      WHERE p.calendar_id=${calendarId} AND p.active AND p.bookable AND m.permission IN ('owner','editor') GROUP BY p.id,p.display_name,p.bio ORDER BY p.display_name`,
  ]);
  const settings: SalonSettings = { businessName: business.business_name, description: business.description, location: business.location, publicEnabled: true, leadMinutes: business.lead_minutes, advanceDays: business.advance_days, slotMinutes: business.slot_minutes, cancellationHours: business.cancellation_hours };
  const slots = serviceId && services.some(s => s.id === serviceId) ? await slotsFor({ calendarId, timezone: business.timezone, date: selectedDate, settings, serviceId, practitionerId, publicOnly: true }) : [];
  // Publication or account membership may change during the parallel reads. Fail
  // closed if any displayed service/provider has since left the public allowlist.
  const finalScope = await sql`SELECT c.id,c.timezone,
    (SELECT count(*)::int FROM salon_practitioners p JOIN calendar_memberships m ON m.calendar_id=p.calendar_id AND m.user_id=p.user_id
      WHERE p.calendar_id=c.id AND p.id=ANY(${practitioners.map(p => p.id)}::uuid[]) AND p.active AND p.bookable AND m.permission IN ('owner','editor')
      AND EXISTS(SELECT 1 FROM salon_practitioner_services ps JOIN salon_services sv ON sv.id=ps.service_id AND sv.calendar_id=ps.calendar_id WHERE ps.calendar_id=p.calendar_id AND ps.practitioner_id=p.id AND ps.active AND sv.active AND sv.bookable)) AS practitioner_count,
    (SELECT count(*)::int FROM salon_services sv WHERE sv.calendar_id=c.id AND sv.id=ANY(${services.map(v => v.id)}::uuid[]) AND sv.active AND sv.bookable) AS service_count,
    (SELECT count(*)::int FROM jsonb_to_recordset(${JSON.stringify(practitioners.flatMap(p => p.service_ids.map((id: string) => ({ practitioner_id: p.id, service_id: id }))))}::jsonb) pair(practitioner_id uuid,service_id uuid)
      JOIN salon_practitioner_services ps ON ps.calendar_id=c.id AND ps.practitioner_id=pair.practitioner_id AND ps.service_id=pair.service_id AND ps.active) AS pair_count
    FROM calendars c JOIN salon_settings st ON st.calendar_id=c.id
    WHERE c.id=${calendarId} AND c.calendar_type='salon_bookings' AND c.archived_at IS NULL AND st.public_enabled`;
  if (!finalScope[0] || finalScope[0].timezone !== business.timezone || finalScope[0].practitioner_count !== practitioners.length || finalScope[0].service_count !== services.length || finalScope[0].pair_count !== practitioners.reduce((total, p) => total + p.service_ids.length, 0)) {
    throw new SalonError("This booking page changed while it loaded. Please reload.", 409);
  }
  // Construct every public property explicitly; database rows are never spread into this response.
  return { calendarId, businessName: business.business_name, description: business.description, location: business.location, timezone: business.timezone, date: selectedDate, cancellationHours: business.cancellation_hours, leadMinutes: business.lead_minutes, advanceDays: business.advance_days,
    services: services.map(s => ({ id: s.id, name: s.name, description: s.description, durationMinutes: s.duration_minutes, priceMinor: s.price_minor, currency: s.currency })),
    practitioners: practitioners.map(p => ({ id: p.id, displayName: p.display_name, bio: p.bio, serviceIds: p.service_ids })), slots };
}

export async function loadOwnAppointment(userId: string, id: string, date?: string): Promise<OwnSalonAppointment> {
  uuid.parse(userId); uuid.parse(id); const sql = getSql();
  const rows = await sql`SELECT a.id,a.calendar_id,a.practitioner_id,a.service_id,a.service_name,a.duration_minutes,a.buffer_before_minutes,a.buffer_after_minutes,
    a.price_minor,a.currency,a.cancellation_hours,a.start_at,a.end_at,a.busy_start_at,a.busy_end_at,a.status,a.version,a.client_user_id,a.client_name,a.client_email,a.client_phone,''::text AS notes,
    p.display_name AS practitioner_name,p.user_id AS practitioner_user_id,c.name AS calendar_name,c.timezone,c.archived_at,
    COALESCE(NULLIF(s.business_name,''),'Salon') AS business_name,COALESCE(s.location,'') AS location
    FROM salon_appointments a JOIN calendars c ON c.id=a.calendar_id AND c.calendar_type='salon_bookings'
    JOIN salon_practitioners p ON p.id=a.practitioner_id AND p.calendar_id=a.calendar_id LEFT JOIN salon_settings s ON s.calendar_id=a.calendar_id
    WHERE a.id=${id} AND a.client_user_id=${userId}`;
  const a = rows[0]; if (!a) throw new SalonError("This appointment is unavailable.", 404);
  const selectedDate = validDate(date, a.timezone);
  const projected = appointmentProjection(a as AppointmentRow, userId, false);
  if (a.archived_at) { projected.canManage = false; projected.canCancel = false; projected.canReschedule = false; }
  // Client response has no private notes property at all.
  const { notes: privateNotes, ...appointment } = projected;
  void privateNotes;
  const slots = appointment.canReschedule ? await slotsFor({ calendarId: a.calendar_id, timezone: a.timezone, date: selectedDate, settings: await settingsFor(a.calendar_id, a.calendar_name), serviceId: a.service_id, practitionerId: a.practitioner_id, publicOnly: false, snapshot: { durationMinutes: a.duration_minutes, bufferBeforeMinutes: a.buffer_before_minutes, bufferAfterMinutes: a.buffer_after_minutes }, excludeAppointmentId: a.id }) : [];
  return { calendarId: a.calendar_id, businessName: a.business_name, location: a.location, timezone: a.timezone, date: selectedDate, appointment, slots };
}

function mutationResult(value: unknown): SalonMutationResult {
  return z.object({ ok: z.literal(true), id: uuid.optional(), version: z.number().int().optional(), status: z.enum(["confirmed", "cancelled"]).optional() }).parse(value);
}
export async function mutateSalon(session: SalonSession, action: SalonAction, data: unknown): Promise<SalonMutationResult> {
  requireSalon(session); salonActionSchema.parse(action); const sql = getSql();
  if (action === "book") {
    const input = salonManualBookingSchema.parse(data);
    const rows = await sql`SELECT salon_book(${session.calendarId}::uuid,${session.userId}::uuid,${JSON.stringify(input)}::jsonb,false) AS result`;
    return mutationResult(rows[0]?.result);
  }
  if (action === "reschedule" || action === "cancel") {
    const input = action === "reschedule" ? salonRescheduleSchema.parse(data) : salonCancelSchema.parse(data);
    const rows = await sql`SELECT salon_change_appointment(${session.userId}::uuid,${input.id}::uuid,${input.version},${action},${"start" in input ? input.start : null}::timestamptz,${session.calendarId}::uuid) AS result`;
    return mutationResult(rows[0]?.result);
  }
  const schemas = { saveSettings: salonSettingsSchema, saveService: salonServiceSchema, addSelf: salonSelfProfileSchema, savePractitioner: salonPractitionerSchema, saveEligibility: salonEligibilitySchema, saveHours: salonHoursSchema, saveTimeBlock: salonTimeBlockSchema, createInvite: salonInviteSchema, revokeInvite: salonRevokeInviteSchema };
  const input = schemas[action].parse(data);
  let payload: object = input; let code: string | undefined; let expiresAt: string | undefined;
  if (action === "createInvite") {
    code = generateInviteCode(); const normalized = normalizeInviteCode(code); expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
    payload = { ...input, codeHash: hashToken(normalized), codeHint: normalized.slice(-4), expiresAt };
  }
  const rows = await sql`SELECT salon_mutate(${session.calendarId}::uuid,${session.userId}::uuid,${action},${JSON.stringify(payload)}::jsonb) AS result`;
  return { ...mutationResult(rows[0]?.result), ...(code ? { code, expiresAt } : {}) };
}
export async function bookPublicSalon(user: SalonUser, calendarId: string, input: unknown): Promise<SalonMutationResult> {
  uuid.parse(user.id); uuid.parse(calendarId); const data = salonBookingSchema.parse(input); const sql = getSql();
  const rows = await sql`SELECT salon_book(${calendarId}::uuid,${user.id}::uuid,${JSON.stringify(data)}::jsonb,true) AS result`;
  return mutationResult(rows[0]?.result);
}
export async function changeOwnAppointment(user: SalonUser, action: "reschedule" | "cancel", input: unknown): Promise<SalonMutationResult> {
  uuid.parse(user.id); z.enum(["reschedule", "cancel"]).parse(action);
  const data = action === "reschedule" ? salonRescheduleSchema.parse(input) : salonCancelSchema.parse(input); const sql = getSql();
  const rows = await sql`SELECT salon_change_appointment(${user.id}::uuid,${data.id}::uuid,${data.version},${action},${"start" in data ? data.start : null}::timestamptz,NULL::uuid) AS result`;
  return mutationResult(rows[0]?.result);
}
export async function redeemSalonInvitation(codeHash: string, userId: string): Promise<string | undefined> {
  z.string().regex(/^[a-f0-9]{64}$/).parse(codeHash); uuid.parse(userId); const sql = getSql();
  try {
    const rows = await sql`SELECT salon_redeem_invitation(${codeHash},${userId}::uuid) AS calendar_id`;
    return rows[0]?.calendar_id ?? undefined;
  } catch (error) {
    if (error && typeof error === "object" && "constraint" in error && typeof error.constraint === "string" && ["salon_invite_access", "salon_invite_member", "salon_scope"].includes(error.constraint)) return undefined;
    throw error;
  }
}

/** Route-safe errors without leaking SQL, table names, contacts, or query parameters. */
export function salonErrorResponse(error: unknown): { error: string; status: number } {
  if (error instanceof SalonError) return { error: error.message, status: error.status };
  if (error instanceof z.ZodError) return { error: error.issues[0]?.message ?? "Check the form and try again.", status: 400 };
  if (error instanceof RangeError) return { error: "Choose a valid date in the business’s timezone.", status: 400 };
  const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
  const constraint = error && typeof error === "object" && "constraint" in error ? error.constraint : undefined;
  if (code === "42P01" || code === "42883" || code === "22P02") return { error: "Salon bookings are not available yet. Please try again later.", status: 503 };
  if (code === "40001" || code === "40P01" || code === "23505") return { error: "Another change happened at the same time. Reload and try again.", status: 409 };
  if (constraint === "salon_terms") return { error: "The service or booking terms changed. Refresh and review the details before booking again.", status: 409 };
  if (constraint === "salon_idempotency") return { error: "The booking details changed. Reopen the form and review them before booking again.", status: 409 };
  if (code === "23514" || code === "P0001" || code === "42501") {
    if (typeof constraint === "string" && /access|owner|role/.test(constraint)) return { error: "Your access has changed. Reload the calendar or contact the business.", status: 403 };
    return { error: "This time or appointment is no longer available under the booking rules. Reload and choose another time.", status: 409 };
  }
  return { error: "We couldn’t complete that Salon request. Please try again.", status: 500 };
}
