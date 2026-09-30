import { randomUUID } from "node:crypto";
import { getSql } from "@/lib/db";
import { generateInviteCode, normalizeInviteCode } from "@/lib/security/invites";
import { hashToken } from "@/lib/security/tokens";
import { getTemplateAccess, type TemplateSession } from "./access";
import { usesMemberInvitations } from "./policy";
export class SharingError extends Error { constructor(message: string, public status=403) { super(message); } }
function requireTemplate(session: TemplateSession) { if (!usesMemberInvitations(session.calendarType)) throw new SharingError("Use this calendar’s own invitation tools."); }
export async function loadTemplateMembers(session: TemplateSession) {
  requireTemplate(session); const access=await getTemplateAccess(session); const sql=getSql();
  const canInvite=access.role === "owner" || access.role === "admin";
  const members = canInvite ? await sql`SELECT m.id, COALESCE(u.name, 'Calendar member') AS name,
    CASE WHEN m.permission='owner' THEN 'owner' WHEN m.permission='viewer' THEN 'viewer' ELSE COALESCE(r.role,'member') END AS role,
    m.user_id=${session.userId} AS "isCurrentUser", COALESCE(r.resource_ids,'{}'::uuid[]) AS "resourceIds"
    FROM calendar_memberships m LEFT JOIN neon_auth."user" u ON u.id=m.user_id::text
    LEFT JOIN template_member_roles r ON r.calendar_id=m.calendar_id AND r.user_id=m.user_id
    WHERE m.calendar_id=${session.calendarId} ORDER BY m.created_at` : [];
  const invites = canInvite ? await sql`SELECT i.id, i.code_hint AS "codeHint", i.expires_at AS "expiresAt", COALESCE(r.role,CASE WHEN i.permission='viewer' THEN 'viewer' ELSE 'member' END) AS role
    FROM calendar_invites i LEFT JOIN template_invite_roles r ON r.invite_id=i.id
    WHERE i.calendar_id=${session.calendarId} AND i.revoked_at IS NULL AND i.expires_at>now() AND i.use_count<i.max_uses
    AND (${access.role === "owner"} OR i.created_by_user_id=${session.userId}) ORDER BY i.created_at DESC` : [];
  const resources=session.calendarType === "shared_facilities" && access.role === "owner" ? await sql`SELECT id,name FROM facility_resources WHERE calendar_id=${session.calendarId} AND active ORDER BY name` : [];
  return { calendarId:session.calendarId, access, canInvite, members, invites, resources, calendarType:session.calendarType };
}
export async function createTemplateInvite(session: TemplateSession, role: "manager"|"admin"|"member"|"viewer", resourceIds: string[]) {
  requireTemplate(session); const access=await getTemplateAccess(session); const sql=getSql();
  if (!["owner","admin"].includes(access.role)) throw new SharingError("Ask the organiser to invite someone.");
  if ((role === "manager" || role === "admin") && access.role !== "owner") throw new SharingError("Only the owner can invite another organiser.");
  if (role === "manager" && session.calendarType !== "shared_facilities") throw new SharingError("Choose a Social Groups role.",400);
  if (role === "admin" && session.calendarType !== "social_groups") throw new SharingError("Choose a Shared Facilities role.",400);
  const scope=[...new Set(resourceIds)];
  if (role === "manager") {
    const rows=await sql`SELECT id FROM facility_resources WHERE calendar_id=${session.calendarId} AND active AND id=ANY(${scope}::uuid[])`;
    if (!scope.length || rows.length !== scope.length) throw new SharingError("Choose the resources this manager can organise.",400);
  }
  const id=randomUUID();const code=generateInviteCode();const normalized=normalizeInviteCode(code);
  const expiresAt=new Date(Date.now()+7*86400000).toISOString();
  await sql.transaction([
    sql`INSERT INTO calendar_invites(id,calendar_id,code_hash,code_hint,permission,created_by_user_id,expires_at)
      VALUES(${id},${session.calendarId},${hashToken(normalized)},${normalized.slice(-4)},${role === "viewer" ? "viewer" : "editor"}::calendar_permission,${session.userId},${expiresAt})`,
    sql`INSERT INTO template_invite_roles(invite_id,role,resource_ids) VALUES(${id},${role},${role === "manager" ? scope : []}::uuid[])`,
  ]);
  return { code, expiresAt, role };
}
export async function revokeTemplateInvite(session: TemplateSession, id:string) {
  requireTemplate(session);const access=await getTemplateAccess(session);const sql=getSql();
  if (!["owner","admin"].includes(access.role)) throw new SharingError("Organiser access is required.");
  await sql`UPDATE calendar_invites SET revoked_at=now() WHERE id=${id} AND calendar_id=${session.calendarId} AND (${access.role === "owner"} OR created_by_user_id=${session.userId})`;
  return {ok:true};
}
export async function changeTemplateMember(session:TemplateSession, id:string, role:"manager"|"admin"|"member"|"viewer", resourceIds:string[]=[]) {
  requireTemplate(session);if(session.permission !== "owner") throw new SharingError("Only the owner can change member access.");
  const sql=getSql();
  if (role === "manager" && session.calendarType !== "shared_facilities") throw new SharingError("Choose a Social Groups role.",400);
  if (role === "admin" && session.calendarType !== "social_groups") throw new SharingError("Choose a Facilities role.",400);
  const scope=role === "manager" ? [...new Set(resourceIds)] : [];
  if(role === "manager") { const resources=await sql`SELECT id FROM facility_resources WHERE calendar_id=${session.calendarId} AND active AND id=ANY(${scope}::uuid[])`; if(!scope.length||resources.length!==scope.length)throw new SharingError("Choose this manager’s resources.",400); }
  const rows=await sql`WITH changed AS (
    UPDATE calendar_memberships SET permission=${role === "viewer" ? "viewer" : "editor"}::calendar_permission,updated_at=now()
    WHERE id=${id} AND calendar_id=${session.calendarId} AND permission<>'owner' RETURNING calendar_id,user_id
  ), assigned AS (
    INSERT INTO template_member_roles(calendar_id,user_id,role,resource_ids)
    SELECT calendar_id,user_id,${role},${scope}::uuid[] FROM changed ON CONFLICT(calendar_id,user_id) DO UPDATE SET role=EXCLUDED.role,resource_ids=EXCLUDED.resource_ids RETURNING user_id
  ), revoked AS (
    UPDATE calendar_invites i SET revoked_at=now() FROM changed c
    WHERE i.calendar_id=c.calendar_id AND i.created_by_user_id=c.user_id AND i.revoked_at IS NULL AND i.use_count<i.max_uses
    RETURNING i.id
  ) SELECT user_id FROM assigned`;
  if(!rows.length)throw new SharingError("This member could not be changed. Reload and try again.",409);
  return {ok:true};
}
