import { getSql } from "@/lib/db";
import type { getCalendarSession } from "@/lib/security/session";
import { usesMemberInvitations } from "./policy";
export type TemplateSession = NonNullable<Awaited<ReturnType<typeof getCalendarSession>>>;
export type TemplateRole = "owner" | "manager" | "admin" | "member" | "viewer";
export type TemplateAccess = { role: TemplateRole; resourceIds: string[] };
export async function getTemplateAccess(session: TemplateSession): Promise<TemplateAccess> {
  if (!usesMemberInvitations(session.calendarType)) throw new Error("Choose a Facilities or Social Groups calendar.");
  if (session.permission === "owner") return { role: "owner", resourceIds: [] };
  if (session.permission === "viewer") return { role: "viewer", resourceIds: [] };
  const sql = getSql();
  const rows = await sql`SELECT role, resource_ids AS "resourceIds" FROM template_member_roles WHERE calendar_id=${session.calendarId} AND user_id=${session.userId}`;
  const row = rows[0];
  if (session.calendarType === "shared_facilities" && row?.role === "manager") return { role: "manager", resourceIds: row.resourceIds };
  if (session.calendarType === "social_groups" && row?.role === "admin") return { role: "admin", resourceIds: [] };
  return { role: "member", resourceIds: [] };
}
export function canManageResource(access: TemplateAccess, resourceId: string) { return access.role === "owner" || (access.role === "manager" && access.resourceIds.includes(resourceId)); }
