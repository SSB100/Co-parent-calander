import { getSql } from "@/lib/db";
import { canManageResource, getTemplateAccess } from "@/lib/calendar-sharing/access";
import { instantFromLocalDateTimeInTimeZone, localDateInTimeZone } from "@/lib/calendar/time";
import { facilityDefaults, type FacilityData, type FacilityRules } from "./contracts";
import type { getCalendarSession } from "@/lib/security/session";
import type { z } from "zod";
import type { facilityBookingSchema, facilityDecisionSchema, facilityResourceSchema } from "./contracts";

export type FacilitySession = NonNullable<Awaited<ReturnType<typeof getCalendarSession>>>;
export class FacilityError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export function requireFacility(session: FacilitySession, access: "read" | "member" | "owner" = "read") {
  if (session.calendarType !== "shared_facilities") throw new FacilityError("Choose a Shared Facilities calendar.", 403);
  if (access === "owner" && session.permission !== "owner") throw new FacilityError("Only the calendar owner can change these settings.", 403);
  if (access === "member" && session.permission === "viewer") throw new FacilityError("Ask the organiser for member access to make a booking.", 403);
}
function dayEnd(date: string) {
  const next = new Date(`${date}T12:00:00Z`); next.setUTCDate(next.getUTCDate() + 1); return next.toISOString().slice(0, 10);
}
export async function loadFacilities(session: FacilitySession, date?: string): Promise<FacilityData> {
  requireFacility(session);
  const selectedDate = date ?? localDateInTimeZone(session.calendarTimezone);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(selectedDate) || Number.isNaN(Date.parse(`${selectedDate}T12:00:00Z`))) throw new FacilityError("Choose a valid date.");
  const start = instantFromLocalDateTimeInTimeZone(session.calendarTimezone, `${selectedDate}T00:00`).toISOString();
  const end = instantFromLocalDateTimeInTimeZone(session.calendarTimezone, `${dayEnd(selectedDate)}T00:00`).toISOString();
  const owner = session.permission === "owner";
  const access = await getTemplateAccess(session);
  const managedResourceIds = access.role === "manager" ? access.resourceIds : [];
  const sql = getSql();
  const [resources, settings, bookings, updates] = await Promise.all([
    sql`SELECT id, name, description, location, capacity, active FROM facility_resources WHERE calendar_id = ${session.calendarId} AND (active OR ${owner} OR id=ANY(${managedResourceIds}::uuid[]) OR EXISTS (SELECT 1 FROM facility_bookings b WHERE b.resource_id=facility_resources.id AND b.calendar_id=${session.calendarId} AND b.user_id=${session.userId} AND b.end_at>=now()-interval '7 days')) ORDER BY active DESC, name`,
    sql`SELECT open_minute AS "openMinute", close_minute AS "closeMinute", open_days AS "openDays", min_duration AS "minDuration", max_duration AS "maxDuration", min_notice_hours AS "minNoticeHours", advance_days AS "advanceDays", cancellation_hours AS "cancellationHours", max_active_bookings AS "maxActiveBookings", require_approval AS "requireApproval", share_titles AS "shareTitles" FROM facility_settings WHERE calendar_id = ${session.calendarId}`,
    sql`SELECT b.id, b.resource_id AS "resourceId",
      CASE WHEN b.user_id = ${session.userId} OR ${owner} OR b.resource_id=ANY(${managedResourceIds}::uuid[]) OR COALESCE(s.share_titles, false) THEN b.title ELSE '' END AS title,
      CASE WHEN b.user_id = ${session.userId} OR ${owner} OR b.resource_id=ANY(${managedResourceIds}::uuid[]) THEN b.notes ELSE '' END AS notes,
      b.start_at AS start, b.end_at AS "end", b.status,
      (b.user_id = ${session.userId}) AS own, b.version,
      (b.user_id = ${session.userId} OR ${owner} OR b.resource_id=ANY(${managedResourceIds}::uuid[])) AND ${session.permission !== "viewer"} AS "canManage"
      FROM facility_bookings b LEFT JOIN facility_settings s ON s.calendar_id = b.calendar_id
      WHERE b.calendar_id = ${session.calendarId} AND (
        (b.start_at < ${end}::timestamptz AND b.end_at > ${start}::timestamptz AND b.status = 'confirmed')
        OR ((b.user_id = ${session.userId} OR ${owner} OR b.resource_id=ANY(${managedResourceIds}::uuid[])) AND b.end_at >= now() - interval '7 days')
      ) ORDER BY b.start_at LIMIT 500`,
    sql`SELECT u.id, u.action, r.name AS "resourceName", u.created_at AS "createdAt"
      FROM facility_updates u JOIN facility_bookings b ON b.id = u.booking_id AND b.calendar_id = u.calendar_id
      JOIN facility_resources r ON r.id = b.resource_id AND r.calendar_id = u.calendar_id
      WHERE u.calendar_id = ${session.calendarId} AND (u.user_id = ${session.userId} OR ${owner} OR b.resource_id=ANY(${managedResourceIds}::uuid[]))
      ORDER BY u.created_at DESC LIMIT 100`,
  ]);
  return { resources, bookings, rules: settings[0] ?? facilityDefaults, updates, owner, role: access.role, managedResourceIds, canBook: session.permission !== "viewer", timezone: session.calendarTimezone, date: selectedDate } as FacilityData;
}
export async function saveFacilityRules(session: FacilitySession, rules: FacilityRules) {
  requireFacility(session, "owner"); const sql = getSql();
  await sql`INSERT INTO facility_settings (calendar_id, open_minute, close_minute, open_days, min_duration, max_duration, min_notice_hours, advance_days, cancellation_hours, max_active_bookings, require_approval, share_titles)
    VALUES (${session.calendarId}, ${rules.openMinute}, ${rules.closeMinute}, ${rules.openDays}, ${rules.minDuration}, ${rules.maxDuration}, ${rules.minNoticeHours}, ${rules.advanceDays}, ${rules.cancellationHours}, ${rules.maxActiveBookings}, ${rules.requireApproval}, ${rules.shareTitles})
    ON CONFLICT (calendar_id) DO UPDATE SET open_minute = EXCLUDED.open_minute, close_minute = EXCLUDED.close_minute, open_days = EXCLUDED.open_days, min_duration = EXCLUDED.min_duration, max_duration = EXCLUDED.max_duration, min_notice_hours = EXCLUDED.min_notice_hours, advance_days = EXCLUDED.advance_days, cancellation_hours = EXCLUDED.cancellation_hours, max_active_bookings = EXCLUDED.max_active_bookings, require_approval = EXCLUDED.require_approval, share_titles = EXCLUDED.share_titles`;
  return { ok: true };
}
export async function saveFacilityResource(session: FacilitySession, resource: z.infer<typeof facilityResourceSchema>) {
  requireFacility(session, "member"); const access = await getTemplateAccess(session);
  if (resource.id ? !canManageResource(access, resource.id) : access.role !== "owner") throw new FacilityError("Only the owner or this resource’s manager can change it.", 403);
  const sql = getSql();
  const rows = resource.id
    ? await sql`UPDATE facility_resources SET name=${resource.name}, description=${resource.description}, location=${resource.location}, capacity=${resource.capacity}, active=${resource.active} WHERE id=${resource.id} AND calendar_id=${session.calendarId} RETURNING id`
    : await sql`INSERT INTO facility_resources(calendar_id, name, description, location, capacity) VALUES (${session.calendarId}, ${resource.name}, ${resource.description}, ${resource.location}, ${resource.capacity}) RETURNING id`;
  if (!rows.length) throw new FacilityError("This resource could not be found. Reload and try again.", 404);
  return { ok: true, id: rows[0].id };
}
export async function saveFacilityBooking(session: FacilitySession, booking: z.infer<typeof facilityBookingSchema>) {
  requireFacility(session, "member"); const sql = getSql();
  let start: string; let end: string;
  try {
    start = instantFromLocalDateTimeInTimeZone(session.calendarTimezone, booking.start).toISOString();
    end = instantFromLocalDateTimeInTimeZone(session.calendarTimezone, booking.end).toISOString();
  } catch { throw new FacilityError("That time is not available in this calendar’s timezone. Choose another time."); }
  if (end <= start) throw new FacilityError("End time must be after start time.");
  const access = await getTemplateAccess(session);
  const owner = canManageResource(access, booking.resourceId);
  const managedResourceIds = access.role === "manager" ? access.resourceIds : [];
  const rows = booking.id
    ? await sql`UPDATE facility_bookings SET resource_id=${booking.resourceId}, title=${booking.title}, notes=${booking.notes}, start_at=${start}, end_at=${end}, updated_by_user_id=${session.userId},
      status=CASE WHEN COALESCE((SELECT require_approval FROM facility_settings WHERE calendar_id=${session.calendarId}), false) AND NOT ${owner} THEN 'pending' ELSE 'confirmed' END
      WHERE id=${booking.id} AND calendar_id=${session.calendarId} AND version=${booking.version!} AND (user_id=${session.userId} OR ${session.permission === "owner"} OR resource_id=ANY(${managedResourceIds}::uuid[])) AND status IN ('pending','confirmed') RETURNING id, status`
    : await sql`INSERT INTO facility_bookings(calendar_id, resource_id, user_id, updated_by_user_id, request_key, title, notes, start_at, end_at, status)
      VALUES (${session.calendarId}, ${booking.resourceId}, ${session.userId}, ${session.userId}, ${booking.requestId!}, ${booking.title}, ${booking.notes}, ${start}, ${end}, CASE WHEN COALESCE((SELECT require_approval FROM facility_settings WHERE calendar_id=${session.calendarId}), false) AND NOT ${owner} THEN 'pending' ELSE 'confirmed' END) RETURNING id, status`;
  if (!rows.length) throw new FacilityError("This booking changed or is no longer available. Reload before trying again.", 409);
  return { ok: true, id: rows[0].id as string, status: rows[0].status as string };
}
export async function decideFacilityBooking(session: FacilitySession, decision: z.infer<typeof facilityDecisionSchema>) {
  requireFacility(session, "member"); const access=await getTemplateAccess(session);
  if (decision.action !== "cancel" && access.role !== "owner" && access.role !== "manager") throw new FacilityError("The organiser must review this booking.",403);
  const managedResourceIds = access.role === "manager" ? access.resourceIds : [];
  const sql = getSql();
  const status = { confirm: "confirmed", decline: "declined", cancel: "cancelled" }[decision.action];
  const owner = session.permission === "owner";
  const rows = await sql`UPDATE facility_bookings SET status=${status}, updated_by_user_id=${session.userId}
    WHERE id=${decision.id} AND calendar_id=${session.calendarId} AND version=${decision.version}
      AND (user_id=${session.userId} OR ${owner} OR resource_id=ANY(${managedResourceIds}::uuid[])) AND status IN ('pending','confirmed')
      AND (${decision.action === "cancel"} OR ((${owner} OR resource_id=ANY(${managedResourceIds}::uuid[])) AND status='pending' AND start_at > now())) RETURNING id`;
  if (!rows.length) throw new FacilityError("This booking changed or can no longer be reviewed. Reload before trying again.", 409);
  return { ok: true };
}
