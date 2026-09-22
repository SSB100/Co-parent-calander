import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb, getSql } from "@/lib/db";
import {
  staffRosterInvites,
  staffRosterMembers,
} from "@/lib/db/schema";
import { staffRosterCapabilities } from "@/lib/staff-rosters/capabilities";
import {
  ensureStaffRosterMember,
  StaffRosterServiceError,
} from "@/lib/staff-rosters/service";
import {
  generateInviteCode,
  normalizeInviteCode,
} from "@/lib/security/invites";
import { hashToken } from "@/lib/security/tokens";

type StaffSession = {
  calendarId: string;
  calendarType: string;
  calendarTimezone: string;
  membershipId: string;
  permission: "owner" | "editor" | "viewer";
  userName: string | null;
  userEmail: string;
};

export async function createStaffRosterInvitation(input: {
  session: StaffSession;
  memberId: string;
}) {
  const actor = await ensureStaffRosterMember(input.session);
  const capabilities = staffRosterCapabilities({
    accessRole: actor.accessRole,
    permission: input.session.permission,
  });
  if (!capabilities.manageTeam) {
    throw new StaffRosterServiceError(403, "Manager access is required.");
  }

  const rows = await getDb()
    .select({
      id: staffRosterMembers.id,
      displayName: staffRosterMembers.displayName,
      accessRole: staffRosterMembers.accessRole,
      membershipId: staffRosterMembers.membershipId,
      active: staffRosterMembers.active,
    })
    .from(staffRosterMembers)
    .where(
      and(
        eq(staffRosterMembers.id, input.memberId),
        eq(staffRosterMembers.calendarId, input.session.calendarId),
      ),
    )
    .limit(1);

  const target = rows[0];
  if (!target || !target.active) {
    throw new StaffRosterServiceError(404, "Team member not found.");
  }
  if (target.accessRole === "owner") {
    throw new StaffRosterServiceError(
      400,
      "The roster owner already has an account.",
    );
  }
  if (target.membershipId) {
    throw new StaffRosterServiceError(
      409,
      target.displayName + " is already connected to a Covie account.",
    );
  }
  if (target.accessRole === "manager" && !capabilities.manageManagers) {
    throw new StaffRosterServiceError(
      403,
      "Only the calendar owner can invite another manager.",
    );
  }

  const code = generateInviteCode();
  const normalizedCode = normalizeInviteCode(code);
  const codeHash = hashToken(normalizedCode);
  const id = randomUUID();
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  const sql = getSql();

  try {
    await sql.transaction([
      sql`
        UPDATE staff_roster_invites
        SET revoked_at = now()
        WHERE calendar_id = ${input.session.calendarId}
          AND member_id = ${input.memberId}
          AND redeemed_at IS NULL
          AND revoked_at IS NULL
      `,
      sql`
        INSERT INTO staff_roster_invites (
          id, calendar_id, member_id, code_hash, code_hint,
          created_by_membership_id, expires_at
        )
        VALUES (
          ${id}, ${input.session.calendarId}, ${input.memberId},
          ${codeHash}, ${normalizedCode.slice(-4)},
          ${input.session.membershipId}, ${expiresAt}
        )
      `,
      sql`
        INSERT INTO audit_log (
          calendar_id, actor_participant_id, action,
          entity_type, entity_id, after_state
        )
        VALUES (
          ${input.session.calendarId}, NULL,
          'staff_roster.invite.create',
          'staff_roster_invite', ${id},
          ${JSON.stringify({
            memberId: input.memberId,
            accessRole: target.accessRole,
            actorStaffMemberId: actor.id,
          })}::jsonb
        )
      `,
    ]);
  } catch {
    throw new StaffRosterServiceError(409, "The invitation could not be created.");
  }

  return {
    ok: true as const,
    id,
    code,
    codeHint: normalizedCode.slice(-4),
    displayName: target.displayName,
    accessRole: target.accessRole,
    expiresAt: expiresAt.toISOString(),
  };
}

export async function acceptStaffRosterInviteCode(input: {
  userId: string;
  code: string;
}) {
  const normalizedCode = normalizeInviteCode(input.code);
  const codeHash = hashToken(normalizedCode);
  const sql = getSql();

  const rows = (await sql`
    SELECT
      invite.id,
      invite.calendar_id,
      invite.member_id,
      invite.revoked_at,
      invite.redeemed_at,
      invite.expires_at,
      member.display_name,
      member.access_role,
      member.membership_id,
      member.active,
      calendar.calendar_type
    FROM staff_roster_invites invite
    JOIN staff_roster_members member ON member.id = invite.member_id
    JOIN calendars calendar ON calendar.id = invite.calendar_id
    WHERE invite.code_hash = ${codeHash}
    LIMIT 1
  `) as Array<{
    id: string;
    calendar_id: string;
    member_id: string;
    revoked_at: Date | string | null;
    redeemed_at: Date | string | null;
    expires_at: Date | string;
    display_name: string;
    access_role: "owner" | "manager" | "staff";
    membership_id: string | null;
    active: boolean;
    calendar_type: string;
  }>;

  const invite = rows[0];
  if (!invite) return null;

  if (invite.calendar_type !== "staff_rosters") {
    throw new StaffRosterServiceError(400, "This is not a Staff Roster invitation.");
  }
  if (!invite.active) {
    throw new StaffRosterServiceError(410, "This team profile is no longer active.");
  }
  if (invite.revoked_at) {
    throw new StaffRosterServiceError(
      410,
      "This invitation is no longer active. Ask the calendar owner for a new code.",
    );
  }
  if (new Date(invite.expires_at).getTime() <= Date.now()) {
    throw new StaffRosterServiceError(
      410,
      "This invitation has expired. Ask for a new code.",
    );
  }
  if (invite.redeemed_at || invite.membership_id) {
    throw new StaffRosterServiceError(
      409,
      "This team profile is already connected to a Covie account.",
    );
  }

  const existingMembership = (await sql`
    SELECT
      membership.id,
      linked.id AS linked_member_id
    FROM calendar_memberships membership
    LEFT JOIN staff_roster_members linked
      ON linked.membership_id = membership.id
    WHERE membership.calendar_id = ${invite.calendar_id}
      AND membership.user_id = ${input.userId}
    LIMIT 1
  `) as Array<{
    id: string;
    linked_member_id: string | null;
  }>;

  if (
    existingMembership[0]?.linked_member_id &&
    existingMembership[0].linked_member_id !== invite.member_id
  ) {
    throw new StaffRosterServiceError(
      409,
      "Your account is already linked to another team member on this roster.",
    );
  }

  const membershipId = randomUUID();
  const permission = invite.access_role === "manager" ? "editor" : "viewer";
  const lockKey = "staff-roster-invite:" + codeHash;

  try {
    await sql.transaction([
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`,
      sql`
        INSERT INTO calendar_memberships (
          id, calendar_id, user_id, participant_id, permission
        )
        SELECT
          ${membershipId}, invite.calendar_id, ${input.userId}, NULL,
          ${permission}::calendar_permission
        FROM staff_roster_invites invite
        JOIN staff_roster_members member ON member.id = invite.member_id
        WHERE invite.code_hash = ${codeHash}
          AND invite.revoked_at IS NULL
          AND invite.redeemed_at IS NULL
          AND invite.expires_at > now()
          AND member.membership_id IS NULL
          AND member.active = true
        ON CONFLICT (calendar_id, user_id) DO NOTHING
      `,
      sql`
        UPDATE calendar_memberships membership
        SET permission = CASE
          WHEN membership.permission = 'owner' THEN 'owner'::calendar_permission
          WHEN ${permission} = 'editor' THEN 'editor'::calendar_permission
          ELSE membership.permission
        END,
        updated_at = now()
        FROM staff_roster_invites invite
        WHERE invite.code_hash = ${codeHash}
          AND membership.calendar_id = invite.calendar_id
          AND membership.user_id = ${input.userId}
      `,
      sql`
        UPDATE staff_roster_members member
        SET membership_id = membership.id,
            updated_at = now()
        FROM staff_roster_invites invite,
             calendar_memberships membership
        WHERE invite.code_hash = ${codeHash}
          AND member.id = invite.member_id
          AND member.calendar_id = invite.calendar_id
          AND member.membership_id IS NULL
          AND membership.calendar_id = invite.calendar_id
          AND membership.user_id = ${input.userId}
          AND NOT EXISTS (
            SELECT 1
            FROM staff_roster_members other
            WHERE other.membership_id = membership.id
              AND other.id <> member.id
          )
      `,
      sql`
        UPDATE staff_roster_invites invite
        SET redeemed_by_membership_id = member.membership_id,
            redeemed_at = now()
        FROM staff_roster_members member
        WHERE invite.code_hash = ${codeHash}
          AND member.id = invite.member_id
          AND member.membership_id IS NOT NULL
          AND invite.revoked_at IS NULL
          AND invite.redeemed_at IS NULL
          AND invite.expires_at > now()
      `,
      sql`
        INSERT INTO audit_log (
          calendar_id, actor_participant_id, action,
          entity_type, entity_id, after_state
        )
        SELECT
          invite.calendar_id, NULL,
          'staff_roster.invite.redeem',
          'staff_roster_invite', invite.id,
          jsonb_build_object(
            'memberId', invite.member_id,
            'membershipId', invite.redeemed_by_membership_id
          )
        FROM staff_roster_invites invite
        WHERE invite.code_hash = ${codeHash}
          AND invite.redeemed_at IS NOT NULL
      `,
    ]);
  } catch {
    throw new StaffRosterServiceError(
      409,
      "This Staff Roster invitation could not be accepted.",
    );
  }

  const redeemed = (await sql`
    SELECT
      invite.calendar_id,
      invite.redeemed_at,
      member.membership_id
    FROM staff_roster_invites invite
    JOIN staff_roster_members member ON member.id = invite.member_id
    WHERE invite.code_hash = ${codeHash}
      AND member.membership_id IS NOT NULL
      AND invite.redeemed_at IS NOT NULL
    LIMIT 1
  `) as Array<{
    calendar_id: string;
    redeemed_at: Date | string;
    membership_id: string;
  }>;

  if (!redeemed[0]) {
    throw new StaffRosterServiceError(
      409,
      "This team profile could not be linked to your account.",
    );
  }

  return {
    calendarId: redeemed[0].calendar_id,
    memberId: invite.member_id,
    displayName: invite.display_name,
    accessRole: invite.access_role,
  };
}
