import { getSql } from "@/lib/db";
// This path intentionally has no participant or parent-profile writes.
export async function redeemMemberInvitation(codeHash: string, userId: string) {
  const sql = getSql();
  const rows = await sql`WITH eligible AS (
    SELECT invite.id FROM calendar_invites invite JOIN calendars c ON c.id=invite.calendar_id
    WHERE invite.code_hash=${codeHash} AND invite.revoked_at IS NULL AND invite.expires_at > now()
      AND invite.use_count < invite.max_uses AND invite.permission IN ('editor','viewer')
      AND c.calendar_type IN ('shared_facilities','social_groups') AND c.archived_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM calendar_memberships m WHERE m.calendar_id=invite.calendar_id AND m.user_id=${userId})
    FOR UPDATE OF invite
  ), used AS (
    UPDATE calendar_invites i SET use_count=i.use_count+1, redeemed_by_user_id=${userId}, redeemed_at=now()
    FROM eligible WHERE i.id=eligible.id RETURNING i.id, i.calendar_id, i.permission
  ), joined AS (
    INSERT INTO calendar_memberships(calendar_id,user_id,permission)
    SELECT calendar_id,${userId},permission FROM used RETURNING calendar_id, user_id
  ), assigned AS (
    INSERT INTO template_member_roles(calendar_id,user_id,role,resource_ids)
    SELECT j.calendar_id, j.user_id, COALESCE(r.role, CASE WHEN u.permission='viewer' THEN 'viewer' ELSE 'member' END), COALESCE(r.resource_ids, '{}'::uuid[])
    FROM joined j JOIN used u ON u.calendar_id=j.calendar_id LEFT JOIN template_invite_roles r ON r.invite_id=u.id
    RETURNING calendar_id
  ) SELECT calendar_id FROM assigned`;
  return rows[0]?.calendar_id as string | undefined;
}
