import { randomBytes } from "node:crypto";
import { z } from "zod";
import { getSql } from "@/lib/db";
import type { TemplateSession } from "@/lib/calendar-sharing/access";
import { localDateInTimeZone } from "@/lib/calendar/time";
import { hashToken } from "@/lib/security/tokens";
import { reportServerFailure } from "@/lib/server-diagnostics";
import { timesheetsCommandSchema, timesheetsDateSchema, timesheetsViewSchema, type TimesheetsData, type TimesheetsEntry, type TimesheetsMutationResult, type TimesheetsOrganisation, type TimesheetsRole, type TimesheetsView } from "./contracts";
import { normaliseTimesheetsTiming, timesheetsTotals, timesheetsWindow, timesheetsCsv, splitTimesheetsEntryByDay } from "./model";
export class TimesheetsError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export type TimesheetsSession = TemplateSession;
export const timesheetsTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export type TimesheetsSql = ReturnType<typeof getSql>;
type Access = { organisation: TimesheetsOrganisation; role: TimesheetsRole; ownStaffId: string };
async function currentAccess(session: TimesheetsSession, sql: TimesheetsSql = getSql()): Promise<Access> {
  if (session.calendarType !== "timesheets") throw new TimesheetsError("Choose a Timesheets calendar.", 403);
  const rows = await sql`SELECT o.id,o.name,o.timezone,o.increment_minutes,o.version,m.role,p.id AS staff_id
    FROM organisations o CROSS JOIN LATERAL timesheet_actor(o.id,${session.userId}::uuid) m
    JOIN timesheet_staff_profiles p ON p.membership_id=m.id AND p.organisation_id=o.id
    WHERE o.calendar_id=${session.calendarId}::uuid AND m.id IS NOT NULL`;
  const row = rows[0];
  if (!row) throw new TimesheetsError("Your Timesheets access has changed. Ask the organisation owner to review access.", 403);
  return { organisation: { id: row.id, name: row.name, timezone: row.timezone, incrementMinutes: row.increment_minutes, version: row.version }, role: row.role, ownStaffId: row.staff_id };
}
export async function getTimesheetsWorkspaceRole(session: TimesheetsSession): Promise<TimesheetsRole | "unavailable"> {
  try { return (await currentAccess(session)).role; }
  catch (error) { if (error instanceof TimesheetsError && error.status === 403) return "unavailable"; throw error; }
}
const iso = (value: string | Date) => new Date(value).toISOString();
// Explicit allowlist: no user IDs, invitation hashes, deleted rows or raw audit
// snapshots leak into day/week payloads. Both tenant and staff scope are SQL-bound.
function entryProjection(row: Record<string, unknown>): TimesheetsEntry {
  return { id: String(row.id), staffId: String(row.staff_id), clientId: row.client_id ? String(row.client_id) : null, projectId: row.project_id ? String(row.project_id) : null,
    workTypeId: row.work_type_id ? String(row.work_type_id) : null, workTypeName: row.work_type_name ? String(row.work_type_name) : null,
    start: iso(row.start_at as string), end: iso(row.end_at as string), timezone: String(row.timezone), notes: String(row.notes), billable: Boolean(row.billable), durationMinutes: Number(row.duration_minutes), incrementMinutes: Number(row.increment_minutes) as TimesheetsEntry["incrementMinutes"], version: Number(row.version) };
}
export async function loadTimesheets(session: TimesheetsSession, date?: string, view: TimesheetsView = "week", sql: TimesheetsSql = getSql()): Promise<TimesheetsData> {
  const access = await currentAccess(session, sql);
  const selectedDate = timesheetsDateSchema.parse(date ?? localDateInTimeZone(access.organisation.timezone));
  timesheetsViewSchema.parse(view);
  const range = timesheetsWindow(selectedDate, view, access.organisation.timezone);
  // One authoritative snapshot scopes staff, invitations, entries and reporting.
  const rows = await sql`WITH permitted AS (
    SELECT p.*,COALESCE(m.role,p.invite_role) AS role,m.user_id=${session.userId}::uuid AS own
    FROM timesheet_staff_profiles p LEFT JOIN organisation_memberships m ON m.id=p.membership_id AND m.organisation_id=p.organisation_id
    WHERE p.organisation_id=${access.organisation.id}::uuid AND timesheet_can_access(p.organisation_id,${session.userId}::uuid,p.id)
  ), selected_entries AS (
    SELECT e.* FROM timesheet_entries e JOIN permitted p ON p.id=e.staff_id
    WHERE e.organisation_id=${access.organisation.id}::uuid AND e.deleted_at IS NULL AND e.start_at<${range.end}::timestamptz AND e.end_at>${range.start}::timestamptz ORDER BY e.start_at,e.id LIMIT 5001
  ) SELECT o.version,m.role,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('id',p.id,'displayName',p.display_name,'email',p.email,'role',p.role,'active',p.active,'own',COALESCE(p.own,false),'linked',p.membership_id IS NOT NULL,'version',p.version) ORDER BY p.active DESC,p.display_name) FROM permitted p),'[]'::jsonb) AS staff,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'active',c.active,'version',c.version) ORDER BY c.active DESC,c.name) FROM timesheet_clients c WHERE c.organisation_id=o.id),'[]'::jsonb) AS clients,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('id',p.id,'clientId',p.client_id,'name',p.name,'active',p.active,'version',p.version) ORDER BY p.active DESC,p.name) FROM timesheet_projects p WHERE p.organisation_id=o.id),'[]'::jsonb) AS projects,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('id',w.id,'name',w.name,'active',w.active,'version',w.version) ORDER BY w.active DESC,w.name,w.id) FROM timesheet_work_types w WHERE w.organisation_id=o.id),'[]'::jsonb) AS work_types,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('managerStaffId',a.manager_staff_id,'staffId',a.staff_id)) FROM timesheet_manager_assignments a WHERE a.organisation_id=o.id AND (m.role='owner' OR a.manager_staff_id=${access.ownStaffId}::uuid)),'[]'::jsonb) AS assignments,
    COALESCE((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.start_at,e.id) FROM selected_entries e),'[]'::jsonb) AS entries,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('id',i.id,'staffId',i.staff_id,'email',i.email,'expiresAt',i.expires_at,'revoked',i.revoked_at IS NOT NULL,'used',i.redeemed_at IS NOT NULL) ORDER BY i.created_at DESC)
      FROM timesheet_invitations i JOIN permitted p ON p.id=i.staff_id WHERE i.organisation_id=o.id AND (m.role='owner' OR (m.role='manager' AND p.role='member'))),'[]'::jsonb) AS invitations
    FROM organisations o CROSS JOIN LATERAL timesheet_actor(o.id,${session.userId}::uuid) m
    WHERE o.id=${access.organisation.id}::uuid AND o.calendar_id=${session.calendarId}::uuid AND m.id IS NOT NULL`;
  const row = rows[0];
  if (!row || row.role !== access.role || row.version !== access.organisation.version) throw new TimesheetsError("Access or settings changed while loading. Refresh the calendar.", 409);
  if (row.entries.length > 5000) throw new TimesheetsError("This reporting window has too many entries. Choose a single day.", 422);
  const entries = (row.entries.map(entryProjection) as TimesheetsEntry[]).filter(entry => splitTimesheetsEntryByDay(entry, access.organisation.timezone).some(day => day.date >= range.first && day.date < range.next && day.totalMinutes > 0));
  return { calendarId: session.calendarId, ...access, date: selectedDate, view, staff: row.staff, clients: row.clients, projects: row.projects, workTypes: row.work_types, assignments: row.assignments, entries, invitations: row.invitations,
    totals: timesheetsTotals(entries, { date: selectedDate, view, timezone: access.organisation.timezone }) };
}
async function existingEntry(session: TimesheetsSession, id: string, sql: TimesheetsSql) {
  const rows = await sql`SELECT e.* FROM timesheet_entries e JOIN organisations o ON o.id=e.organisation_id WHERE o.calendar_id=${session.calendarId}::uuid AND e.id=${id}::uuid AND e.deleted_at IS NULL AND timesheet_can_access(o.id,${session.userId}::uuid,e.staff_id)`;
  if (!rows[0]) throw new TimesheetsError("This entry is unavailable.", 403);
  return entryProjection(rows[0]);
}
export async function mutateTimesheets(session: TimesheetsSession, input: unknown, sql: TimesheetsSql = getSql()): Promise<TimesheetsMutationResult> {
  const command = timesheetsCommandSchema.parse(input);
  const access = await currentAccess(session, sql);
  let data: Record<string, unknown> = command.data;
  let rawToken: string | undefined;
  if (command.action === "saveEntry") {
    if (command.data.organisationVersion !== access.organisation.version) {
      throw new TimesheetsError("Organisation settings changed while this editor was open. Refresh before saving.", 409);
    }
    const existing = command.data.id ? await existingEntry(session, command.data.id, sql) : undefined;
    const timing = normaliseTimesheetsTiming({ ...command.data, timezone: access.organisation.timezone, incrementMinutes: access.organisation.incrementMinutes, existing });
    data = { ...command.data, ...timing, expectedOrganisationVersion: command.data.organisationVersion };
  } else if (command.action === "createInvite") {
    rawToken = randomBytes(32).toString("base64url");
    data = { ...command.data, tokenHash: hashToken(rawToken) };
  }
  const rows = await sql`SELECT timesheet_mutate(${session.calendarId}::uuid,${session.userId}::uuid,${command.action},${JSON.stringify(data)}::jsonb) AS result`;
  const result = rows[0]?.result;
  if (!result?.ok) throw new TimesheetsError("The change could not be saved.", 409);
  // Raw token leaves the server once, only to the authorised inviter.
  return { ...result, ...(rawToken ? { invitationUrl: `/timesheets/invite/${rawToken}` } : {}) };
}
export async function redeemTimesheetsInvitation(token: string, userId: string, sql: TimesheetsSql = getSql()) {
  timesheetsTokenSchema.parse(token); z.string().uuid().parse(userId);
  const rows = await sql`SELECT timesheet_redeem_invitation(${hashToken(token)},${userId}::uuid) AS calendar_id`;
  if (!rows[0]?.calendar_id) throw new TimesheetsError("This invitation is unavailable.", 403);
  return String(rows[0].calendar_id);
}
export async function loadTimesheetsHistory(session: TimesheetsSession, entryId: string, sql: TimesheetsSql = getSql()) {
  z.string().uuid().parse(entryId);
  await currentAccess(session, sql);
  const rows = await sql`SELECT r.id,r.action,r.reason,r.created_at,r.actor_user_id=${session.userId}::uuid AS own_actor,r.before_state,r.after_state,
    COALESCE((SELECT p.display_name FROM timesheet_staff_profiles p JOIN organisation_memberships m ON m.id=p.membership_id AND m.organisation_id=p.organisation_id WHERE p.organisation_id=r.organisation_id AND m.user_id=r.actor_user_id),'Former team member') AS actor_name
    FROM timesheet_entry_revisions r JOIN timesheet_entries e ON e.id=r.entry_id AND e.organisation_id=r.organisation_id JOIN organisations o ON o.id=e.organisation_id
    WHERE o.calendar_id=${session.calendarId}::uuid AND e.id=${entryId}::uuid AND timesheet_can_access(o.id,${session.userId}::uuid,e.staff_id) ORDER BY r.created_at,r.id`;
  return rows.map(row => ({ id: row.id, action: row.action, reason: row.reason, createdAt: iso(row.created_at), ownActor: row.own_actor, actorName: row.actor_name,
    before: row.before_state ? entryProjection(row.before_state) : null, after: row.after_state ? entryProjection(row.after_state) : null }));
}
export function exportTimesheetsCsv(data: TimesheetsData) {
  const range = timesheetsWindow(data.date, data.view, data.organisation.timezone);
  return timesheetsCsv([
    ["Staff", "Client", "Project", "Work type", "Start (UTC)", "End (UTC)", "Saved timezone", "Full entry minutes", "Minutes in selected window", "Billable minutes in selected window", "Notes"],
    ...data.entries.map(entry => {
      const minutes = splitTimesheetsEntryByDay(entry, data.organisation.timezone).filter(day => day.date >= range.first && day.date < range.next).reduce((sum, day) => sum + day.totalMinutes, 0);
      return [data.staff.find(p => p.id === entry.staffId)?.displayName ?? "", data.clients.find(c => c.id === entry.clientId)?.name ?? "", data.projects.find(p => p.id === entry.projectId)?.name ?? "", entry.workTypeName ?? "", entry.start, entry.end, entry.timezone, entry.durationMinutes, minutes, entry.billable ? minutes : 0, entry.notes];
    }),
  ]);
}
export function timesheetsErrorResponse(error: unknown) {
  if (error instanceof TimesheetsError) return { error: error.message, status: error.status };
  if (error instanceof z.ZodError) return { error: error.issues[0]?.message ?? "Check the Timesheets details.", status: 400 };
  if (error instanceof RangeError) return { error: error.message, status: 400 };
  const database = error as { code?: string; message?: string };
  if (["23514", "40001", "42501"].includes(database?.code ?? "")) return { error: database.message ?? "Refresh and check the details.", status: database.code === "42501" ? 403 : database.code === "40001" ? 409 : 400 };
  if (database?.code === "23505") return { error: "That record already exists. Refresh and check the details.", status: 409 };
  reportServerFailure("timesheets", error);
  return { error: "Timesheets could not be loaded or saved. Please try again.", status: 500 };
}
