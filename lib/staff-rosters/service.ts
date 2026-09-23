import { randomUUID } from "node:crypto";
import { addDays, format, parseISO, startOfWeek, subDays } from "date-fns";
import { and, asc, desc, eq, inArray, sql as drizzleSql } from "drizzle-orm";
import { getDb, getSql } from "@/lib/db";
import {
  staffRosterAvailability,
  staffRosterInvites,
  staffRosterLeaveRequests,
  staffRosterLocations,
  staffRosterMemberRoles,
  staffRosterMembers,
  staffRosterPublishedShifts,
  staffRosterRoles,
  staffRosterSettings,
  staffRosterShifts,
  staffRosterUpdates,
  staffRosterWeekPublications,
} from "@/lib/db/schema";
import { localDateInTimeZone } from "@/lib/calendar/time";
import {
  staffRosterCapabilities,
} from "@/lib/staff-rosters/capabilities";
import { sendStaffRosterEmails } from "@/lib/email/staff-roster-notifications";
import { staffRosterAccountState } from "@/lib/staff-rosters/invitation-status";
import { rosterPublicationDiff } from "@/lib/staff-rosters/publication-diff";

export class StaffRosterServiceError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

type StaffSession = {
  calendarId: string;
  calendarType: string;
  calendarTimezone: string;
  membershipId: string;
  permission: "owner" | "editor" | "viewer";
  userName: string | null;
  userEmail: string;
};


function assertStaffCalendar(session: StaffSession) {
  if (session.calendarType !== "staff_rosters") {
    throw new StaffRosterServiceError(404, "Staff roster not found.");
  }
}

export async function ensureStaffRosterMember(session: StaffSession) {
  assertStaffCalendar(session);
  const db = getDb();

  const existing = await db
    .select({
      id: staffRosterMembers.id,
      displayName: staffRosterMembers.displayName,
      accessRole: staffRosterMembers.accessRole,
      active: staffRosterMembers.active,
    })
    .from(staffRosterMembers)
    .where(
      and(
        eq(staffRosterMembers.calendarId, session.calendarId),
        eq(staffRosterMembers.membershipId, session.membershipId),
      ),
    )
    .limit(1);

  if (existing[0]) {
    if (!existing[0].active) {
      throw new StaffRosterServiceError(
        403,
        "Your staff profile is inactive for this roster.",
      );
    }
    return existing[0];
  }

  if (session.permission !== "owner") {
    throw new StaffRosterServiceError(
      403,
      "Your account is not linked to a staff profile for this roster.",
    );
  }

  const displayName =
    session.userName?.trim() ||
    session.userEmail.split("@")[0]?.trim() ||
    "Calendar owner";
  const id = randomUUID();

  try {
    await db.insert(staffRosterMembers).values({
      id,
      calendarId: session.calendarId,
      membershipId: session.membershipId,
      displayName,
      accessRole: "owner",
      active: true,
    });
  } catch {
    const concurrent = await db
      .select({
        id: staffRosterMembers.id,
        displayName: staffRosterMembers.displayName,
        accessRole: staffRosterMembers.accessRole,
        active: staffRosterMembers.active,
      })
      .from(staffRosterMembers)
      .where(eq(staffRosterMembers.membershipId, session.membershipId))
      .limit(1);

    if (concurrent[0]) {
      if (!concurrent[0].active) {
        throw new StaffRosterServiceError(
          403,
          "Your staff profile is inactive for this roster.",
        );
      }
      return concurrent[0];
    }
    throw new StaffRosterServiceError(
      409,
      "Your roster profile could not be prepared. Refresh and try again.",
    );
  }

  return {
    id,
    displayName,
    accessRole: "owner" as const,
    active: true,
  };
}

async function assertReferenceBelongsToCalendar(input: {
  calendarId: string;
  roleId?: string | null;
  locationId?: string | null;
}) {
  const db = getDb();

  if (input.roleId) {
    const rows = await db
      .select({ id: staffRosterRoles.id })
      .from(staffRosterRoles)
      .where(
        and(
          eq(staffRosterRoles.id, input.roleId),
          eq(staffRosterRoles.calendarId, input.calendarId),
          eq(staffRosterRoles.active, true),
        ),
      )
      .limit(1);
    if (!rows[0]) {
      throw new StaffRosterServiceError(400, "Choose an active roster role.");
    }
  }

  if (input.locationId) {
    const rows = await db
      .select({ id: staffRosterLocations.id })
      .from(staffRosterLocations)
      .where(
        and(
          eq(staffRosterLocations.id, input.locationId),
          eq(staffRosterLocations.calendarId, input.calendarId),
          eq(staffRosterLocations.active, true),
        ),
      )
      .limit(1);
    if (!rows[0]) {
      throw new StaffRosterServiceError(400, "Choose an active roster location.");
    }
  }
}

function normalizedMemberRoleIds(
  roleIds: string[],
  defaultRoleId: string | null,
) {
  const unique = [...new Set(roleIds)];
  if (defaultRoleId && !unique.includes(defaultRoleId)) {
    unique.unshift(defaultRoleId);
  }
  return unique;
}

async function assertStaffRolesBelongToCalendar(
  calendarId: string,
  roleIds: string[],
) {
  if (roleIds.length === 0) return;

  const rows = await getDb()
    .select({ id: staffRosterRoles.id })
    .from(staffRosterRoles)
    .where(
      and(
        eq(staffRosterRoles.calendarId, calendarId),
        eq(staffRosterRoles.active, true),
        inArray(staffRosterRoles.id, roleIds),
      ),
    );

  if (rows.length !== roleIds.length) {
    throw new StaffRosterServiceError(
      400,
      "Choose active roster roles from this calendar.",
    );
  }
}

export async function getTeam(session: StaffSession) {
  const current = await ensureStaffRosterMember(session);
  const capabilities = staffRosterCapabilities({
    accessRole: current.accessRole,
    permission: session.permission,
  });
  if (!capabilities.manageTeam) {
    throw new StaffRosterServiceError(403, "Manager access is required.");
  }

  const db = getDb();

  const currentWeekStart = format(startOfWeek(parseISO(localDateInTimeZone(session.calendarTimezone)), { weekStartsOn: 1 }), "yyyy-MM-dd");
  const currentWeekEnd = format(addDays(parseISO(currentWeekStart), 6), "yyyy-MM-dd");
  const assignedRows = await getSql()`
    SELECT member_id AS "memberId",
      COALESCE(SUM(EXTRACT(EPOCH FROM (end_time - start_time)) / 60), 0)::integer AS "assignedMinutes"
    FROM staff_roster_shifts
    WHERE calendar_id = ${session.calendarId}
      AND shift_date BETWEEN ${currentWeekStart} AND ${currentWeekEnd}
    GROUP BY member_id
  ` as Array<{ memberId: string; assignedMinutes: number }>;
  const assignedByMember = new Map(assignedRows.map((row) => [row.memberId, Number(row.assignedMinutes)]));

  const members = await db
    .select({
      id: staffRosterMembers.id,
      displayName: staffRosterMembers.displayName,
      contactEmail: staffRosterMembers.contactEmail,
      contactPhone: staffRosterMembers.contactPhone,
      expectedWeeklyMinutes: staffRosterMembers.expectedWeeklyMinutes,
      accessRole: staffRosterMembers.accessRole,
      active: staffRosterMembers.active,
      membershipId: staffRosterMembers.membershipId,
      defaultRoleId: staffRosterMembers.defaultRoleId,
      defaultRoleName: staffRosterRoles.name,
      defaultLocationId: staffRosterMembers.defaultLocationId,
      defaultLocationName: staffRosterLocations.name,
    })
    .from(staffRosterMembers)
    .leftJoin(
      staffRosterRoles,
      eq(staffRosterMembers.defaultRoleId, staffRosterRoles.id),
    )
    .leftJoin(
      staffRosterLocations,
      eq(staffRosterMembers.defaultLocationId, staffRosterLocations.id),
    )
    .where(
      and(
        eq(staffRosterMembers.calendarId, session.calendarId),
        eq(staffRosterMembers.active, true),
      ),
    )
    .orderBy(asc(staffRosterMembers.createdAt));

  const [roles, locations, memberRoleRows, inviteRows] = await Promise.all([
    db
      .select({ id: staffRosterRoles.id, name: staffRosterRoles.name })
      .from(staffRosterRoles)
      .where(
        and(
          eq(staffRosterRoles.calendarId, session.calendarId),
          eq(staffRosterRoles.active, true),
        ),
      )
      .orderBy(asc(staffRosterRoles.name)),
    db
      .select({ id: staffRosterLocations.id, name: staffRosterLocations.name })
      .from(staffRosterLocations)
      .where(
        and(
          eq(staffRosterLocations.calendarId, session.calendarId),
          eq(staffRosterLocations.active, true),
        ),
      )
      .orderBy(asc(staffRosterLocations.name)),
    db
      .select({
        memberId: staffRosterMemberRoles.memberId,
        roleId: staffRosterMemberRoles.roleId,
        roleName: staffRosterRoles.name,
      })
      .from(staffRosterMemberRoles)
      .innerJoin(
        staffRosterRoles,
        eq(staffRosterMemberRoles.roleId, staffRosterRoles.id),
      )
      .where(
        and(
          eq(staffRosterMemberRoles.calendarId, session.calendarId),
          eq(staffRosterRoles.active, true),
        ),
      )
      .orderBy(asc(staffRosterRoles.name)),
    db
      .select({
        id: staffRosterInvites.id,
        memberId: staffRosterInvites.memberId,
        expiresAt: staffRosterInvites.expiresAt,
        revokedAt: staffRosterInvites.revokedAt,
        redeemedAt: staffRosterInvites.redeemedAt,
        createdAt: staffRosterInvites.createdAt,
      })
      .from(staffRosterInvites)
      .where(eq(staffRosterInvites.calendarId, session.calendarId))
      .orderBy(desc(staffRosterInvites.createdAt)),
  ]);

  const latestInviteByMember = new Map<
    string,
    (typeof inviteRows)[number]
  >();
  for (const invite of inviteRows) {
    if (!latestInviteByMember.has(invite.memberId)) {
      latestInviteByMember.set(invite.memberId, invite);
    }
  }

  const rolesByMember = new Map<
    string,
    Array<{ id: string; name: string }>
  >();
  for (const row of memberRoleRows) {
    const assigned = rolesByMember.get(row.memberId) ?? [];
    assigned.push({ id: row.roleId, name: row.roleName });
    rolesByMember.set(row.memberId, assigned);
  }

  return {
    currentMemberId: current.id,
    currentAccessRole: current.accessRole,
    canManageTeam: capabilities.manageTeam,
    canManageManagers: capabilities.manageManagers,
    members: members.map((member) => {
      const assignedRoles = rolesByMember.get(member.id) ?? [];
      const latestInvite = latestInviteByMember.get(member.id) ?? null;
      const hasAccount = Boolean(member.membershipId);
      const accountState = staffRosterAccountState({
        hasAccount,
        latestInvite,
      });
      return {
        ...member,
        roleIds: assignedRoles.map((role) => role.id),
        roleNames: assignedRoles.map((role) => role.name),
        hasAccount,
        accountState,
        hadInvite: Boolean(latestInvite),
        inviteExpiresAt:
          accountState === "invite_active" && latestInvite
            ? latestInvite.expiresAt
            : null,
        isCurrentUser: member.id === current.id,
        assignedThisWeekMinutes: assignedByMember.get(member.id) ?? 0,
      };
    }),
    roles,
    locations,
  };
}

export async function createTeamMember(input: {
  session: StaffSession;
  displayName: string;
  accessRole: "manager" | "staff";
  roleIds: string[];
  defaultRoleId: string | null;
  defaultLocationId: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  expectedWeeklyMinutes: number | null;
}) {
  const actor = await ensureStaffRosterMember(input.session);
  const capabilities = staffRosterCapabilities({
    accessRole: actor.accessRole,
    permission: input.session.permission,
  });
  if (!capabilities.manageTeam) {
    throw new StaffRosterServiceError(403, "Manager access is required.");
  }
  if (input.accessRole === "manager" && !capabilities.manageManagers) {
    throw new StaffRosterServiceError(
      403,
      "Only the calendar owner can add another manager.",
    );
  }

  const roleIds = normalizedMemberRoleIds(
    input.roleIds,
    input.defaultRoleId,
  );
  const defaultRoleId =
    input.defaultRoleId && roleIds.includes(input.defaultRoleId)
      ? input.defaultRoleId
      : (roleIds[0] ?? null);

  await Promise.all([
    assertStaffRolesBelongToCalendar(input.session.calendarId, roleIds),
    assertReferenceBelongsToCalendar({
      calendarId: input.session.calendarId,
      locationId: input.defaultLocationId,
    }),
  ]);

  const id = randomUUID();
  const sql = getSql();

  try {
    const statements = [
      sql`
        INSERT INTO staff_roster_members (
          id, calendar_id, display_name, access_role,
          default_role_id, default_location_id, active,
          contact_email, contact_phone, expected_weekly_minutes
        )
        VALUES (
          ${id}, ${input.session.calendarId}, ${input.displayName},
          ${input.accessRole}::staff_roster_access_role,
          ${defaultRoleId}, ${input.defaultLocationId}, true,
          ${input.contactEmail}, ${input.contactPhone}, ${input.expectedWeeklyMinutes}
        )
      `,
      ...roleIds.map(
        (roleId) => sql`
          INSERT INTO staff_roster_member_roles (
            calendar_id, member_id, role_id
          )
          VALUES (
            ${input.session.calendarId}, ${id}, ${roleId}
          )
        `,
      ),
      sql`
        INSERT INTO audit_log (
          calendar_id, actor_participant_id, action,
          entity_type, entity_id, after_state
        )
        VALUES (
          ${input.session.calendarId}, NULL, 'staff_roster.member.create',
          'staff_roster_member', ${id},
          ${JSON.stringify({
            displayName: input.displayName,
            accessRole: input.accessRole,
            roleIds,
            defaultRoleId,
            contactEmail: input.contactEmail,
            contactPhone: input.contactPhone,
            expectedWeeklyMinutes: input.expectedWeeklyMinutes,
            actorStaffMemberId: actor.id,
          })}::jsonb
        )
      `,
    ];

    await sql.transaction(statements);
  } catch {
    throw new StaffRosterServiceError(
      409,
      "The team member could not be added.",
    );
  }

  return { ok: true as const, id };
}

export async function updateTeamMember(input: {
  session: StaffSession;
  memberId: string;
  displayName: string;
  accessRole: "manager" | "staff";
  roleIds: string[];
  defaultRoleId: string | null;
  defaultLocationId: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  expectedWeeklyMinutes: number | null;
  active: boolean;
}) {
  const actor = await ensureStaffRosterMember(input.session);
  const capabilities = staffRosterCapabilities({
    accessRole: actor.accessRole,
    permission: input.session.permission,
  });
  if (!capabilities.manageTeam) {
    throw new StaffRosterServiceError(403, "Manager access is required.");
  }

  const db = getDb();
  const targetRows = await db
    .select({
      id: staffRosterMembers.id,
      displayName: staffRosterMembers.displayName,
      contactEmail: staffRosterMembers.contactEmail,
      contactPhone: staffRosterMembers.contactPhone,
      expectedWeeklyMinutes: staffRosterMembers.expectedWeeklyMinutes,
      accessRole: staffRosterMembers.accessRole,
      membershipId: staffRosterMembers.membershipId,
      defaultRoleId: staffRosterMembers.defaultRoleId,
      defaultLocationId: staffRosterMembers.defaultLocationId,
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
  const target = targetRows[0];
  const targetRoleRows = target
    ? await db
        .select({ roleId: staffRosterMemberRoles.roleId })
        .from(staffRosterMemberRoles)
        .where(
          and(
            eq(staffRosterMemberRoles.calendarId, input.session.calendarId),
            eq(staffRosterMemberRoles.memberId, input.memberId),
          ),
        )
    : [];

  if (!target) {
    throw new StaffRosterServiceError(404, "Team member not found.");
  }
  if (target.accessRole === "owner") {
    throw new StaffRosterServiceError(
      400,
      "The roster owner is managed through the calendar account.",
    );
  }
  if (
    !capabilities.manageManagers &&
    (target.accessRole === "manager" || input.accessRole === "manager")
  ) {
    throw new StaffRosterServiceError(
      403,
      "Only the calendar owner can manage manager access.",
    );
  }

  const roleIds = normalizedMemberRoleIds(
    input.roleIds,
    input.defaultRoleId,
  );
  const defaultRoleId =
    input.defaultRoleId && roleIds.includes(input.defaultRoleId)
      ? input.defaultRoleId
      : (roleIds[0] ?? null);

  await Promise.all([
    assertStaffRolesBelongToCalendar(input.session.calendarId, roleIds),
    assertReferenceBelongsToCalendar({
      calendarId: input.session.calendarId,
      locationId: input.defaultLocationId,
    }),
  ]);

  if (!input.active) {
    const today = localDateInTimeZone(input.session.calendarTimezone);
    const [liveUpcoming, publishedUpcoming] = await Promise.all([
      db
        .select({ id: staffRosterShifts.id })
        .from(staffRosterShifts)
        .where(
          and(
            eq(staffRosterShifts.calendarId, input.session.calendarId),
            eq(staffRosterShifts.memberId, input.memberId),
            drizzleSql`${staffRosterShifts.shiftDate} >= ${today}`,
          ),
        )
        .limit(1),
      db
        .select({ id: staffRosterPublishedShifts.id })
        .from(staffRosterPublishedShifts)
        .innerJoin(
          staffRosterWeekPublications,
          eq(
            staffRosterPublishedShifts.publicationId,
            staffRosterWeekPublications.id,
          ),
        )
        .where(
          and(
            eq(
              staffRosterWeekPublications.calendarId,
              input.session.calendarId,
            ),
            eq(staffRosterPublishedShifts.memberId, input.memberId),
            drizzleSql`${staffRosterPublishedShifts.shiftDate} >= ${today}`,
          ),
        )
        .limit(1),
    ]);

    if (liveUpcoming[0] || publishedUpcoming[0]) {
      throw new StaffRosterServiceError(
        409,
        "Remove or reassign this person’s upcoming shifts and send any pending roster updates before archiving them.",
        "upcoming_shifts",
      );
    }
  }

  const sql = getSql();
  try {
    const statements = [
      sql`
        UPDATE staff_roster_members
        SET
          display_name = ${input.displayName},
          access_role = ${input.accessRole}::staff_roster_access_role,
          default_role_id = ${defaultRoleId},
          default_location_id = ${input.defaultLocationId},
          contact_email = ${input.contactEmail},
          contact_phone = ${input.contactPhone},
          expected_weekly_minutes = ${input.expectedWeeklyMinutes},
          active = ${input.active},
          updated_at = now()
        WHERE id = ${input.memberId}
          AND calendar_id = ${input.session.calendarId}
      `,
      sql`
        DELETE FROM staff_roster_member_roles
        WHERE calendar_id = ${input.session.calendarId}
          AND member_id = ${input.memberId}
      `,
      ...roleIds.map(
        (roleId) => sql`
          INSERT INTO staff_roster_member_roles (
            calendar_id, member_id, role_id
          )
          VALUES (
            ${input.session.calendarId}, ${input.memberId}, ${roleId}
          )
        `,
      ),
    ];

    if (!input.active) {
      statements.push(sql`
        UPDATE staff_roster_invites
        SET revoked_at = now()
        WHERE calendar_id = ${input.session.calendarId}
          AND member_id = ${input.memberId}
          AND redeemed_at IS NULL
          AND revoked_at IS NULL
      `);

      if (target.membershipId) {
        statements.push(sql`
          DELETE FROM calendar_memberships
          WHERE id = ${target.membershipId}
            AND calendar_id = ${input.session.calendarId}
            AND permission <> 'owner'
        `);
      }
    }

    statements.push(sql`
      INSERT INTO audit_log (
        calendar_id, actor_participant_id, action,
        entity_type, entity_id, before_state, after_state
      )
      VALUES (
        ${input.session.calendarId}, NULL, 'staff_roster.member.update',
        'staff_roster_member', ${input.memberId},
        ${JSON.stringify({
          displayName: target.displayName,
          contactEmail: target.contactEmail,
          contactPhone: target.contactPhone,
          expectedWeeklyMinutes: target.expectedWeeklyMinutes,
          accessRole: target.accessRole,
          roleIds: targetRoleRows.map((row) => row.roleId),
          defaultRoleId: target.defaultRoleId,
          defaultLocationId: target.defaultLocationId,
          active: target.active,
        })}::jsonb,
        ${JSON.stringify({
          displayName: input.displayName,
          contactEmail: input.contactEmail,
          contactPhone: input.contactPhone,
          expectedWeeklyMinutes: input.expectedWeeklyMinutes,
          accessRole: input.accessRole,
          roleIds,
          defaultRoleId,
          defaultLocationId: input.defaultLocationId,
          active: input.active,
          accountAccessRevoked: !input.active && Boolean(target.membershipId),
          actorStaffMemberId: actor.id,
        })}::jsonb
      )
    `);

    await sql.transaction(statements);
  } catch {
    throw new StaffRosterServiceError(
      409,
      "The team member could not be updated.",
    );
  }

  return { ok: true as const };
}

export async function getRolesAndLocations(session: StaffSession) {
  const current = await ensureStaffRosterMember(session);
  const capabilities = staffRosterCapabilities({
    accessRole: current.accessRole,
    permission: session.permission,
  });
  if (!capabilities.manageStructure) {
    throw new StaffRosterServiceError(403, "Manager access is required.");
  }

  const db = getDb();

  const [roles, locations] = await Promise.all([
    db
      .select({
        id: staffRosterRoles.id,
        name: staffRosterRoles.name,
        active: staffRosterRoles.active,
      })
      .from(staffRosterRoles)
      .where(eq(staffRosterRoles.calendarId, session.calendarId))
      .orderBy(asc(staffRosterRoles.name)),
    db
      .select({
        id: staffRosterLocations.id,
        name: staffRosterLocations.name,
        active: staffRosterLocations.active,
      })
      .from(staffRosterLocations)
      .where(eq(staffRosterLocations.calendarId, session.calendarId))
      .orderBy(asc(staffRosterLocations.name)),
  ]);

  return {
    canManage: true,
    roles,
    locations,
  };
}

export async function createRoleOrLocation(input: {
  session: StaffSession;
  kind: "role" | "location";
  name: string;
}) {
  const actor = await ensureStaffRosterMember(input.session);
  const capabilities = staffRosterCapabilities({
    accessRole: actor.accessRole,
    permission: input.session.permission,
  });
  if (!capabilities.manageStructure) {
    throw new StaffRosterServiceError(403, "Manager access is required.");
  }

  const db = getDb();
  const duplicateRows =
    input.kind === "role"
      ? await db
          .select({ id: staffRosterRoles.id })
          .from(staffRosterRoles)
          .where(
            and(
              eq(staffRosterRoles.calendarId, input.session.calendarId),
              eq(staffRosterRoles.active, true),
              drizzleSql`lower(${staffRosterRoles.name}) = lower(${input.name})`,
            ),
          )
          .limit(1)
      : await db
          .select({ id: staffRosterLocations.id })
          .from(staffRosterLocations)
          .where(
            and(
              eq(staffRosterLocations.calendarId, input.session.calendarId),
              eq(staffRosterLocations.active, true),
              drizzleSql`lower(${staffRosterLocations.name}) = lower(${input.name})`,
            ),
          )
          .limit(1);

  if (duplicateRows.length > 0) {
    throw new StaffRosterServiceError(
      409,
      `That ${input.kind} already exists.`,
    );
  }

  const id = randomUUID();
  const sql = getSql();
  try {
    const insert =
      input.kind === "role"
        ? sql`
            INSERT INTO staff_roster_roles (id, calendar_id, name, active)
            VALUES (${id}, ${input.session.calendarId}, ${input.name}, true)
          `
        : sql`
            INSERT INTO staff_roster_locations (id, calendar_id, name, active)
            VALUES (${id}, ${input.session.calendarId}, ${input.name}, true)
          `;

    await sql.transaction([
      insert,
      sql`
        INSERT INTO audit_log (
          calendar_id, actor_participant_id, action,
          entity_type, entity_id, after_state
        )
        VALUES (
          ${input.session.calendarId}, NULL,
          ${"staff_roster." + input.kind + ".create"},
          ${"staff_roster_" + input.kind}, ${id},
          ${JSON.stringify({
            name: input.name,
            actorStaffMemberId: actor.id,
          })}::jsonb
        )
      `,
    ]);
  } catch {
    throw new StaffRosterServiceError(
      409,
      `The ${input.kind} could not be added.`,
    );
  }

  return { ok: true as const, id };
}

export async function archiveRoleOrLocation(input: {
  session: StaffSession;
  kind: "role" | "location";
  id: string;
}) {
  const actor = await ensureStaffRosterMember(input.session);
  const capabilities = staffRosterCapabilities({
    accessRole: actor.accessRole,
    permission: input.session.permission,
  });
  if (!capabilities.manageStructure) {
    throw new StaffRosterServiceError(403, "Manager access is required.");
  }

  const db = getDb();
  const existing =
    input.kind === "role"
      ? (
          await db
            .select({ id: staffRosterRoles.id, name: staffRosterRoles.name })
            .from(staffRosterRoles)
            .where(
              and(
                eq(staffRosterRoles.id, input.id),
                eq(staffRosterRoles.calendarId, input.session.calendarId),
                eq(staffRosterRoles.active, true),
              ),
            )
            .limit(1)
        )[0]
      : (
          await db
            .select({
              id: staffRosterLocations.id,
              name: staffRosterLocations.name,
            })
            .from(staffRosterLocations)
            .where(
              and(
                eq(staffRosterLocations.id, input.id),
                eq(staffRosterLocations.calendarId, input.session.calendarId),
                eq(staffRosterLocations.active, true),
              ),
            )
            .limit(1)
        )[0];

  if (!existing) {
    throw new StaffRosterServiceError(
      404,
      input.kind === "role" ? "Role not found." : "Location not found.",
    );
  }

  const sql = getSql();

  try {
    if (input.kind === "role") {
      await sql.transaction([
        sql`
          UPDATE staff_roster_members member
          SET default_role_id = (
                SELECT member_role.role_id
                FROM staff_roster_member_roles member_role
                JOIN staff_roster_roles role
                  ON role.id = member_role.role_id
                WHERE member_role.member_id = member.id
                  AND member_role.calendar_id = ${input.session.calendarId}
                  AND member_role.role_id <> ${input.id}
                  AND role.active = true
                ORDER BY role.name
                LIMIT 1
              ),
              updated_at = now()
          WHERE member.calendar_id = ${input.session.calendarId}
            AND member.default_role_id = ${input.id}
        `,
        sql`
          DELETE FROM staff_roster_member_roles
          WHERE calendar_id = ${input.session.calendarId}
            AND role_id = ${input.id}
        `,
        sql`
          UPDATE staff_roster_roles
          SET active = false, updated_at = now()
          WHERE id = ${input.id}
            AND calendar_id = ${input.session.calendarId}
        `,
        sql`
          INSERT INTO audit_log (
            calendar_id, actor_participant_id, action,
            entity_type, entity_id, before_state, after_state
          )
          VALUES (
            ${input.session.calendarId}, NULL, 'staff_roster.role.archive',
            'staff_roster_role', ${input.id},
            ${JSON.stringify({ name: existing.name, active: true })}::jsonb,
            ${JSON.stringify({
              name: existing.name,
              active: false,
              actorStaffMemberId: actor.id,
            })}::jsonb
          )
        `,
      ]);
    } else {
      await sql.transaction([
        sql`
          UPDATE staff_roster_members
          SET default_location_id = NULL, updated_at = now()
          WHERE calendar_id = ${input.session.calendarId}
            AND default_location_id = ${input.id}
        `,
        sql`
          UPDATE staff_roster_locations
          SET active = false, updated_at = now()
          WHERE id = ${input.id}
            AND calendar_id = ${input.session.calendarId}
        `,
        sql`
          INSERT INTO audit_log (
            calendar_id, actor_participant_id, action,
            entity_type, entity_id, before_state, after_state
          )
          VALUES (
            ${input.session.calendarId}, NULL, 'staff_roster.location.archive',
            'staff_roster_location', ${input.id},
            ${JSON.stringify({ name: existing.name, active: true })}::jsonb,
            ${JSON.stringify({
              name: existing.name,
              active: false,
              actorStaffMemberId: actor.id,
            })}::jsonb
          )
        `,
      ]);
    }
  } catch {
    throw new StaffRosterServiceError(
      409,
      `The ${input.kind} could not be archived.`,
    );
  }

  return { ok: true as const };
}

export async function getAvailability(input: {
  session: StaffSession;
  from?: string;
  to?: string;
}) {
  const current = await ensureStaffRosterMember(input.session);
  const today = localDateInTimeZone(input.session.calendarTimezone);
  const from = input.from ?? today;
  const to =
    input.to ?? format(addDays(parseISO(from), 30), "yyyy-MM-dd");
  if (to < from) {
    throw new StaffRosterServiceError(400, "Choose a valid availability range.");
  }
  const db = getDb();
  const capabilities = staffRosterCapabilities({
    accessRole: current.accessRole,
    permission: input.session.permission,
  });

  const rows = await db
    .select({
      id: staffRosterAvailability.id,
      memberId: staffRosterAvailability.memberId,
      memberName: staffRosterMembers.displayName,
      date: staffRosterAvailability.availabilityDate,
      startTime: staffRosterAvailability.startTime,
      endTime: staffRosterAvailability.endTime,
      status: staffRosterAvailability.status,
      note: staffRosterAvailability.note,
    })
    .from(staffRosterAvailability)
    .innerJoin(
      staffRosterMembers,
      eq(staffRosterAvailability.memberId, staffRosterMembers.id),
    )
    .where(
      and(
        eq(staffRosterAvailability.calendarId, input.session.calendarId),
        drizzleSql`${staffRosterAvailability.availabilityDate} >= ${from}`,
        drizzleSql`${staffRosterAvailability.availabilityDate} <= ${to}`,
        capabilities.manageAllAvailability
          ? drizzleSql`true`
          : eq(staffRosterAvailability.memberId, current.id),
      ),
    )
    .orderBy(
      asc(staffRosterAvailability.availabilityDate),
      asc(staffRosterAvailability.startTime),
    );

  const team = capabilities.manageAllAvailability
    ? await db
        .select({
          id: staffRosterMembers.id,
          displayName: staffRosterMembers.displayName,
        })
        .from(staffRosterMembers)
        .where(
          and(
            eq(staffRosterMembers.calendarId, input.session.calendarId),
            eq(staffRosterMembers.active, true),
          ),
        )
        .orderBy(asc(staffRosterMembers.displayName))
    : [{ id: current.id, displayName: current.displayName }];

  return {
    currentMemberId: current.id,
    currentAccessRole: current.accessRole,
    canManageAll: capabilities.manageAllAvailability,
    calendarTimezone: input.session.calendarTimezone,
    from,
    to,
    members: team,
    availability: rows.map((row) => ({
      ...row,
      startTime: row.startTime?.slice(0, 5) ?? null,
      endTime: row.endTime?.slice(0, 5) ?? null,
      canDelete:
        capabilities.manageAllAvailability || row.memberId === current.id,
    })),
  };
}

export async function createAvailability(input: {
  session: StaffSession;
  memberId: string;
  date: string;
  status: "available" | "unavailable";
  startTime: string | null;
  endTime: string | null;
  note: string | null;
}) {
  const actor = await ensureStaffRosterMember(input.session);
  const capabilities = staffRosterCapabilities({
    accessRole: actor.accessRole,
    permission: input.session.permission,
  });

  if (
    !capabilities.editOwnAvailability ||
    (!capabilities.manageAllAvailability && input.memberId !== actor.id)
  ) {
    throw new StaffRosterServiceError(
      403,
      "You can only change your own availability.",
    );
  }

  const target = await getDb()
    .select({ id: staffRosterMembers.id })
    .from(staffRosterMembers)
    .where(
      and(
        eq(staffRosterMembers.id, input.memberId),
        eq(staffRosterMembers.calendarId, input.session.calendarId),
        eq(staffRosterMembers.active, true),
      ),
    )
    .limit(1);

  if (!target[0]) {
    throw new StaffRosterServiceError(404, "Team member not found.");
  }

  const id = randomUUID();
  const sql = getSql();
  // A separate READ COMMITTED statement after the lock sees the previous
  // submitter's committed row; a lock inside the insert CTE would keep a stale snapshot.
  const result = await sql.transaction([
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${input.session.calendarId + ":availability:" + input.memberId}, 0))`,
    sql`
      WITH created AS (
        INSERT INTO staff_roster_availability (
          id, calendar_id, member_id, availability_date, start_time, end_time,
          status, note, created_by_membership_id
        )
        SELECT ${id}, ${input.session.calendarId}, target.id, ${input.date},
          ${input.startTime}, ${input.endTime},
          ${input.status}::staff_roster_availability_status, ${input.note}, ${input.session.membershipId}
        FROM staff_roster_members target
        WHERE target.id = ${input.memberId} AND target.calendar_id = ${input.session.calendarId}
          AND target.active = true
          AND NOT EXISTS (
            SELECT 1 FROM staff_roster_availability existing
            WHERE existing.calendar_id = ${input.session.calendarId}
              AND existing.member_id = target.id AND existing.availability_date = ${input.date}
              AND (existing.start_time IS NULL OR ${input.startTime}::time IS NULL
                OR (existing.start_time < ${input.endTime}::time AND existing.end_time > ${input.startTime}::time))
          )
        RETURNING *
      ), audited AS (
        INSERT INTO audit_log (calendar_id, actor_participant_id, action, entity_type, entity_id, after_state)
        SELECT calendar_id, NULL, 'staff_roster.availability.create', 'staff_roster_availability', id,
          to_jsonb(created) || jsonb_build_object('actorStaffMemberId', ${actor.id}::text)
        FROM created
      ) SELECT id FROM created
    `,
  ]);
  if (!result[1][0]) {
    throw new StaffRosterServiceError(409, "Availability overlaps an existing entry, or this team member is no longer active. Refresh and check before adding it again.");
  }
  return { ok: true as const, id };
}

export async function deleteAvailability(input: {
  session: StaffSession;
  availabilityId: string;
}) {
  const actor = await ensureStaffRosterMember(input.session);
  const capabilities = staffRosterCapabilities({ accessRole: actor.accessRole, permission: input.session.permission });
  if (!capabilities.editOwnAvailability) {
    throw new StaffRosterServiceError(403, "You can only change your own availability.");
  }
  const sql = getSql();
  const removed = await sql`
    WITH removed AS (
      DELETE FROM staff_roster_availability
      WHERE id = ${input.availabilityId} AND calendar_id = ${input.session.calendarId}
        AND (${capabilities.manageAllAvailability}::boolean OR member_id = ${actor.id})
      RETURNING *
    ), audited AS (
      INSERT INTO audit_log (calendar_id, actor_participant_id, action, entity_type, entity_id, before_state, after_state)
      SELECT calendar_id, NULL, 'staff_roster.availability.delete', 'staff_roster_availability', id,
        to_jsonb(removed), jsonb_build_object('actorStaffMemberId', ${actor.id}::text, 'deleted', true)
      FROM removed
    ) SELECT id FROM removed
  `;
  if (!removed[0]) {
    throw new StaffRosterServiceError(409, "This availability entry is no longer available to remove. Refresh and check its status.");
  }
  return { ok: true as const };
}


export async function getRosterSetup(session: StaffSession) {
  const current = await ensureStaffRosterMember(session);
  const capabilities = staffRosterCapabilities({
    accessRole: current.accessRole,
    permission: session.permission,
  });

  if (!capabilities.manageTeam) {
    return {
      canManageSetup: false,
      currentAccessRole: current.accessRole,
      roleCount: 0,
      locationCount: 0,
      memberCount: 0,
      setupCompletedAt: null,
      operationalStartMinute: 0,
      operationalEndMinute: 24 * 60,
    };
  }

  const db = getDb();

  const [roleCountRows, locationCountRows, memberCountRows, settingsRows] =
    await Promise.all([
      db
        .select({ count: drizzleSql<number>`count(*)::int` })
        .from(staffRosterRoles)
        .where(
          and(
            eq(staffRosterRoles.calendarId, session.calendarId),
            eq(staffRosterRoles.active, true),
          ),
        ),
      db
        .select({ count: drizzleSql<number>`count(*)::int` })
        .from(staffRosterLocations)
        .where(
          and(
            eq(staffRosterLocations.calendarId, session.calendarId),
            eq(staffRosterLocations.active, true),
          ),
        ),
      db
        .select({ count: drizzleSql<number>`count(*)::int` })
        .from(staffRosterMembers)
        .where(
          and(
            eq(staffRosterMembers.calendarId, session.calendarId),
            eq(staffRosterMembers.active, true),
          ),
        ),
      db
        .select({
          setupCompletedAt: staffRosterSettings.setupCompletedAt,
          operationalStartMinute: staffRosterSettings.operationalStartMinute,
          operationalEndMinute: staffRosterSettings.operationalEndMinute,
        })
        .from(staffRosterSettings)
        .where(eq(staffRosterSettings.calendarId, session.calendarId))
        .limit(1),
    ]);

  return {
    canManageSetup: capabilities.manageTeam,
    currentAccessRole: current.accessRole,
    roleCount: Number(roleCountRows[0]?.count ?? 0),
    locationCount: Number(locationCountRows[0]?.count ?? 0),
    memberCount: Number(memberCountRows[0]?.count ?? 0),
    setupCompletedAt: settingsRows[0]?.setupCompletedAt ?? null,
    operationalStartMinute: settingsRows[0]?.operationalStartMinute ?? 0,
    operationalEndMinute: settingsRows[0]?.operationalEndMinute ?? 24 * 60,
  };
}

export async function completeRosterSetup(session: StaffSession) {
  const current = await ensureStaffRosterMember(session);
  const capabilities = staffRosterCapabilities({
    accessRole: current.accessRole,
    permission: session.permission,
  });

  if (!capabilities.manageTeam) {
    throw new StaffRosterServiceError(403, "Manager access is required.");
  }

  const sql = getSql();
  try {
    await sql.transaction([
      sql`
        INSERT INTO staff_roster_settings (
          calendar_id, setup_completed_at, created_at, updated_at
        )
        VALUES (${session.calendarId}, now(), now(), now())
        ON CONFLICT (calendar_id)
        DO UPDATE SET setup_completed_at = now(), updated_at = now()
      `,
      sql`
        INSERT INTO audit_log (
          calendar_id, actor_participant_id, action,
          entity_type, entity_id, after_state
        )
        VALUES (
          ${session.calendarId}, NULL,
          'staff_roster.setup.complete',
          'staff_roster_setup',
          ${session.calendarId},
          ${JSON.stringify({ actorStaffMemberId: current.id })}::jsonb
        )
      `,
    ]);
  } catch {
    throw new StaffRosterServiceError(
      409,
      "Roster setup could not be completed.",
    );
  }

  return { ok: true as const };
}

export async function updateRosterOperationalHours(input: {
  session: StaffSession;
  startMinute: number;
  endMinute: number;
}) {
  const current = await ensureStaffRosterMember(input.session);
  const capabilities = staffRosterCapabilities({
    accessRole: current.accessRole,
    permission: input.session.permission,
  });

  if (!capabilities.createShifts) {
    throw new StaffRosterServiceError(403, "Manager access is required.");
  }

  const beforeRows = await getDb()
    .select({
      operationalStartMinute: staffRosterSettings.operationalStartMinute,
      operationalEndMinute: staffRosterSettings.operationalEndMinute,
    })
    .from(staffRosterSettings)
    .where(eq(staffRosterSettings.calendarId, input.session.calendarId))
    .limit(1);

  const before = {
    startMinute: beforeRows[0]?.operationalStartMinute ?? 0,
    endMinute: beforeRows[0]?.operationalEndMinute ?? 24 * 60,
  };

  const sql = getSql();
  try {
    await sql.transaction([
      sql`
        INSERT INTO staff_roster_settings (
          calendar_id,
          operational_start_minute,
          operational_end_minute,
          created_at,
          updated_at
        )
        VALUES (
          ${input.session.calendarId},
          ${input.startMinute},
          ${input.endMinute},
          now(),
          now()
        )
        ON CONFLICT (calendar_id)
        DO UPDATE SET
          operational_start_minute = EXCLUDED.operational_start_minute,
          operational_end_minute = EXCLUDED.operational_end_minute,
          updated_at = now()
      `,
      sql`
        INSERT INTO audit_log (
          calendar_id,
          actor_participant_id,
          action,
          entity_type,
          entity_id,
          before_state,
          after_state
        )
        VALUES (
          ${input.session.calendarId},
          NULL,
          'staff_roster.operational_hours.update',
          'staff_roster_settings',
          ${input.session.calendarId},
          ${JSON.stringify(before)}::jsonb,
          ${JSON.stringify({
            startMinute: input.startMinute,
            endMinute: input.endMinute,
            actorStaffMemberId: current.id,
          })}::jsonb
        )
      `,
    ]);
  } catch {
    throw new StaffRosterServiceError(
      409,
      "Operational hours could not be saved.",
    );
  }

  return {
    ok: true as const,
    operationalStartMinute: input.startMinute,
    operationalEndMinute: input.endMinute,
  };
}

async function assertActiveRosterMember(calendarId: string, memberId: string) {
  const rows = await getDb()
    .select({
      id: staffRosterMembers.id,
      displayName: staffRosterMembers.displayName,
      defaultRoleId: staffRosterMembers.defaultRoleId,
      defaultLocationId: staffRosterMembers.defaultLocationId,
    })
    .from(staffRosterMembers)
    .where(
      and(
        eq(staffRosterMembers.id, memberId),
        eq(staffRosterMembers.calendarId, calendarId),
        eq(staffRosterMembers.active, true),
      ),
    )
    .limit(1);

  if (!rows[0]) {
    throw new StaffRosterServiceError(404, "Team member not found.");
  }

  return rows[0];
}

async function shiftConflictState(input: {
  calendarId: string;
  memberId: string;
  date: string;
  startTime: string;
  endTime: string;
  excludeShiftId?: string;
}) {
  const db = getDb();

  const overlapConditions = [
    eq(staffRosterShifts.calendarId, input.calendarId),
    eq(staffRosterShifts.memberId, input.memberId),
    eq(staffRosterShifts.shiftDate, input.date),
    drizzleSql`${staffRosterShifts.startTime} < ${input.endTime}`,
    drizzleSql`${staffRosterShifts.endTime} > ${input.startTime}`,
  ];

  if (input.excludeShiftId) {
    overlapConditions.push(
      drizzleSql`${staffRosterShifts.id} <> ${input.excludeShiftId}::uuid`,
    );
  }

  const [overlaps, unavailable, leave] = await Promise.all([
    db
      .select({
        id: staffRosterShifts.id,
        startTime: staffRosterShifts.startTime,
        endTime: staffRosterShifts.endTime,
      })
      .from(staffRosterShifts)
      .where(and(...overlapConditions))
      .limit(5),
    db
      .select({
        id: staffRosterAvailability.id,
        startTime: staffRosterAvailability.startTime,
        endTime: staffRosterAvailability.endTime,
        note: staffRosterAvailability.note,
      })
      .from(staffRosterAvailability)
      .where(
        and(
          eq(staffRosterAvailability.calendarId, input.calendarId),
          eq(staffRosterAvailability.memberId, input.memberId),
          eq(staffRosterAvailability.availabilityDate, input.date),
          eq(staffRosterAvailability.status, "unavailable"),
          drizzleSql`(
            (${staffRosterAvailability.startTime} IS NULL AND ${staffRosterAvailability.endTime} IS NULL)
            OR
            (
              ${staffRosterAvailability.startTime} < ${input.endTime}
              AND ${staffRosterAvailability.endTime} > ${input.startTime}
            )
          )`,
        ),
      )
      .limit(10),
    db
      .select({
        id: staffRosterLeaveRequests.id,
        status: staffRosterLeaveRequests.status,
        allDay: staffRosterLeaveRequests.allDay,
        startTime: staffRosterLeaveRequests.startTime,
        endTime: staffRosterLeaveRequests.endTime,
      })
      .from(staffRosterLeaveRequests)
      .where(
        and(
          eq(staffRosterLeaveRequests.calendarId, input.calendarId),
          eq(staffRosterLeaveRequests.memberId, input.memberId),
          drizzleSql`${staffRosterLeaveRequests.startDate} <= ${input.date}`,
          drizzleSql`${staffRosterLeaveRequests.endDate} >= ${input.date}`,
          drizzleSql`${staffRosterLeaveRequests.status} IN ('pending', 'approved')`,
          drizzleSql`(
            ${staffRosterLeaveRequests.allDay} = true
            OR
            (
              ${staffRosterLeaveRequests.startTime} < ${input.endTime}
              AND ${staffRosterLeaveRequests.endTime} > ${input.startTime}
            )
          )`,
        ),
      ),
  ]);

  return {
    overlaps,
    unavailable,
    approvedLeave: leave.filter((item) => item.status === "approved"),
    pendingLeave: leave.filter((item) => item.status === "pending"),
  };
}

export async function getRosterWeek(input: {
  session: StaffSession;
  weekStart: string;
}) {
  const current = await ensureStaffRosterMember(input.session);
  const capabilities = staffRosterCapabilities({
    accessRole: current.accessRole,
    permission: input.session.permission,
  });
  const weekEnd = format(addDays(parseISO(input.weekStart), 6), "yyyy-MM-dd");
  const db = getDb();

  const memberFilter = capabilities.createShifts
    ? drizzleSql`true`
    : eq(staffRosterMembers.id, current.id);

  const recentShiftPatternsPromise = capabilities.createShifts
    ? (getSql()`
        SELECT DISTINCT ON (shift.member_id)
          shift.member_id AS "memberId",
          shift.start_time AS "startTime",
          shift.end_time AS "endTime"
        FROM staff_roster_shifts shift
        JOIN staff_roster_members member
          ON member.id = shift.member_id
        WHERE shift.calendar_id = ${input.session.calendarId}
          AND shift.shift_date <= ${weekEnd}
          AND member.active = true
        ORDER BY
          shift.member_id,
          shift.shift_date DESC,
          shift.start_time DESC
      ` as unknown as Promise<
        Array<{
          memberId: string;
          startTime: string;
          endTime: string;
        }>
      >)
    : Promise.resolve([]);

  const [
    members,
    roles,
    locations,
    memberRoleRows,
    liveShifts,
    publicationRows,
    publishedShifts,
    availabilityRows,
    leaveRows,
    recentShiftRows,
    setup,
  ] = await Promise.all([
    db
      .select({
        id: staffRosterMembers.id,
        displayName: staffRosterMembers.displayName,
        expectedWeeklyMinutes: staffRosterMembers.expectedWeeklyMinutes,
        accessRole: staffRosterMembers.accessRole,
        defaultRoleId: staffRosterMembers.defaultRoleId,
        defaultLocationId: staffRosterMembers.defaultLocationId,
      })
      .from(staffRosterMembers)
      .where(
        and(
          eq(staffRosterMembers.calendarId, input.session.calendarId),
          eq(staffRosterMembers.active, true),
          memberFilter,
        ),
      )
      .orderBy(asc(staffRosterMembers.displayName)),
    db
      .select({ id: staffRosterRoles.id, name: staffRosterRoles.name })
      .from(staffRosterRoles)
      .where(
        and(
          eq(staffRosterRoles.calendarId, input.session.calendarId),
          eq(staffRosterRoles.active, true),
        ),
      )
      .orderBy(asc(staffRosterRoles.name)),
    db
      .select({ id: staffRosterLocations.id, name: staffRosterLocations.name })
      .from(staffRosterLocations)
      .where(
        and(
          eq(staffRosterLocations.calendarId, input.session.calendarId),
          eq(staffRosterLocations.active, true),
        ),
      )
      .orderBy(asc(staffRosterLocations.name)),
    db
      .select({
        memberId: staffRosterMemberRoles.memberId,
        roleId: staffRosterMemberRoles.roleId,
        roleName: staffRosterRoles.name,
      })
      .from(staffRosterMemberRoles)
      .innerJoin(
        staffRosterMembers,
        eq(staffRosterMemberRoles.memberId, staffRosterMembers.id),
      )
      .innerJoin(
        staffRosterRoles,
        eq(staffRosterMemberRoles.roleId, staffRosterRoles.id),
      )
      .where(
        and(
          eq(staffRosterMemberRoles.calendarId, input.session.calendarId),
          eq(staffRosterMembers.active, true),
          eq(staffRosterRoles.active, true),
          memberFilter,
        ),
      )
      .orderBy(asc(staffRosterRoles.name)),
    db
      .select({
        id: staffRosterShifts.id,
        memberId: staffRosterShifts.memberId,
        memberName: staffRosterMembers.displayName,
        roleId: staffRosterShifts.roleId,
        roleName: staffRosterRoles.name,
        locationId: staffRosterShifts.locationId,
        locationName: staffRosterLocations.name,
        date: staffRosterShifts.shiftDate,
        startTime: staffRosterShifts.startTime,
        endTime: staffRosterShifts.endTime,
        note: staffRosterShifts.note,
        availabilityOverride: staffRosterShifts.availabilityOverride,
      })
      .from(staffRosterShifts)
      .innerJoin(
        staffRosterMembers,
        eq(staffRosterShifts.memberId, staffRosterMembers.id),
      )
      .leftJoin(staffRosterRoles, eq(staffRosterShifts.roleId, staffRosterRoles.id))
      .leftJoin(
        staffRosterLocations,
        eq(staffRosterShifts.locationId, staffRosterLocations.id),
      )
      .where(
        and(
          eq(staffRosterShifts.calendarId, input.session.calendarId),
          drizzleSql`${staffRosterShifts.shiftDate} >= ${input.weekStart}`,
          drizzleSql`${staffRosterShifts.shiftDate} <= ${weekEnd}`,
          capabilities.createShifts
            ? drizzleSql`true`
            : eq(staffRosterShifts.memberId, current.id),
        ),
      )
      .orderBy(
        asc(staffRosterShifts.shiftDate),
        asc(staffRosterShifts.startTime),
      ),
    db
      .select({
        id: staffRosterWeekPublications.id,
        revision: staffRosterWeekPublications.revision,
        publishedAt: staffRosterWeekPublications.publishedAt,
        lastSentAt: staffRosterWeekPublications.lastSentAt,
      })
      .from(staffRosterWeekPublications)
      .where(
        and(
          eq(staffRosterWeekPublications.calendarId, input.session.calendarId),
          eq(staffRosterWeekPublications.weekStart, input.weekStart),
        ),
      )
      .limit(1),
    db
      .select({
        id: staffRosterPublishedShifts.id,
        sourceShiftId: staffRosterPublishedShifts.sourceShiftId,
        memberId: staffRosterPublishedShifts.memberId,
        memberName: staffRosterMembers.displayName,
        roleId: staffRosterPublishedShifts.roleId,
        roleName: staffRosterRoles.name,
        locationId: staffRosterPublishedShifts.locationId,
        locationName: staffRosterLocations.name,
        date: staffRosterPublishedShifts.shiftDate,
        startTime: staffRosterPublishedShifts.startTime,
        endTime: staffRosterPublishedShifts.endTime,
        note: staffRosterPublishedShifts.note,
        availabilityOverride: staffRosterPublishedShifts.availabilityOverride,
      })
      .from(staffRosterPublishedShifts)
      .innerJoin(
        staffRosterWeekPublications,
        eq(
          staffRosterPublishedShifts.publicationId,
          staffRosterWeekPublications.id,
        ),
      )
      .innerJoin(
        staffRosterMembers,
        eq(staffRosterPublishedShifts.memberId, staffRosterMembers.id),
      )
      .leftJoin(
        staffRosterRoles,
        eq(staffRosterPublishedShifts.roleId, staffRosterRoles.id),
      )
      .leftJoin(
        staffRosterLocations,
        eq(staffRosterPublishedShifts.locationId, staffRosterLocations.id),
      )
      .where(
        and(
          eq(staffRosterWeekPublications.calendarId, input.session.calendarId),
          eq(staffRosterWeekPublications.weekStart, input.weekStart),
          capabilities.createShifts
            ? drizzleSql`true`
            : eq(staffRosterPublishedShifts.memberId, current.id),
        ),
      )
      .orderBy(
        asc(staffRosterPublishedShifts.shiftDate),
        asc(staffRosterPublishedShifts.startTime),
      ),
    db
      .select({
        id: staffRosterAvailability.id,
        memberId: staffRosterAvailability.memberId,
        memberName: staffRosterMembers.displayName,
        date: staffRosterAvailability.availabilityDate,
        startTime: staffRosterAvailability.startTime,
        endTime: staffRosterAvailability.endTime,
        note: staffRosterAvailability.note,
      })
      .from(staffRosterAvailability)
      .innerJoin(
        staffRosterMembers,
        eq(staffRosterAvailability.memberId, staffRosterMembers.id),
      )
      .where(
        and(
          eq(staffRosterAvailability.calendarId, input.session.calendarId),
          eq(staffRosterAvailability.status, "unavailable"),
          drizzleSql`${staffRosterAvailability.availabilityDate} >= ${input.weekStart}`,
          drizzleSql`${staffRosterAvailability.availabilityDate} <= ${weekEnd}`,
          capabilities.createShifts
            ? drizzleSql`true`
            : eq(staffRosterAvailability.memberId, current.id),
        ),
      )
      .orderBy(
        asc(staffRosterAvailability.availabilityDate),
        asc(staffRosterAvailability.startTime),
        asc(staffRosterMembers.displayName),
      ),
    db
      .select({
        id: staffRosterLeaveRequests.id,
        memberId: staffRosterLeaveRequests.memberId,
        memberName: staffRosterMembers.displayName,
        startDate: staffRosterLeaveRequests.startDate,
        endDate: staffRosterLeaveRequests.endDate,
        allDay: staffRosterLeaveRequests.allDay,
        startTime: staffRosterLeaveRequests.startTime,
        endTime: staffRosterLeaveRequests.endTime,
        status: staffRosterLeaveRequests.status,
      })
      .from(staffRosterLeaveRequests)
      .innerJoin(
        staffRosterMembers,
        eq(staffRosterLeaveRequests.memberId, staffRosterMembers.id),
      )
      .where(
        and(
          eq(staffRosterLeaveRequests.calendarId, input.session.calendarId),
          drizzleSql`${staffRosterLeaveRequests.startDate} <= ${weekEnd}`,
          drizzleSql`${staffRosterLeaveRequests.endDate} >= ${input.weekStart}`,
          drizzleSql`${staffRosterLeaveRequests.status} IN ('pending', 'approved')`,
          capabilities.createShifts
            ? drizzleSql`true`
            : eq(staffRosterLeaveRequests.memberId, current.id),
        ),
      )
      .orderBy(
        asc(staffRosterLeaveRequests.startDate),
        asc(staffRosterMembers.displayName),
      ),
    recentShiftPatternsPromise,
    getRosterSetup(input.session),
  ]);

  const memberRolesByMember = new Map<
    string,
    Array<{ id: string; name: string }>
  >();
  for (const row of memberRoleRows) {
    const assigned = memberRolesByMember.get(row.memberId) ?? [];
    assigned.push({ id: row.roleId, name: row.roleName });
    memberRolesByMember.set(row.memberId, assigned);
  }

  const recentShiftDurationByMember = new Map<string, number>();
  for (const row of recentShiftRows) {
    const [startHours, startMinutes] = row.startTime.slice(0, 5).split(":").map(Number);
    const [endHours, endMinutes] = row.endTime.slice(0, 5).split(":").map(Number);
    const duration =
      endHours * 60 + endMinutes - (startHours * 60 + startMinutes);
    if (duration > 0) {
      recentShiftDurationByMember.set(row.memberId, duration);
    }
  }

  const publication = publicationRows[0] ?? null;
  const changedMemberIds = new Set<string>();
  let changedShiftCount = 0;

  if (capabilities.createShifts) {
    if (!publication) {
      for (const shift of liveShifts) changedMemberIds.add(shift.memberId);
      changedShiftCount = liveShifts.length;
    } else {
      const diff = rosterPublicationDiff(liveShifts, publishedShifts);
      for (const memberId of diff.memberIds) changedMemberIds.add(memberId);
      changedShiftCount = diff.changedShiftCount;
    }
  }

  const publicationStatus = !publication
    ? "draft"
    : capabilities.createShifts && changedMemberIds.size > 0
      ? "changes_pending"
      : "published";

  const visibleShifts = capabilities.createShifts ? liveShifts : publishedShifts;
  const attendancePoints = capabilities.createShifts
    ? await getSql()`
        SELECT clock.member_id AS "memberId",
          member.display_name AS "memberName",
          clock.clock_in_at AS "clockInAt",
          clock.clock_out_at AS "clockOutAt"
        FROM staff_roster_clock_sessions clock
        JOIN staff_roster_members member ON member.id = clock.member_id
          AND member.calendar_id = clock.calendar_id
        WHERE clock.calendar_id = ${input.session.calendarId}
          AND (clock.clock_in_at AT TIME ZONE ${input.session.calendarTimezone})::date <= ${weekEnd}::date
          AND COALESCE((clock.clock_out_at AT TIME ZONE ${input.session.calendarTimezone})::date,
            (clock.clock_in_at AT TIME ZONE ${input.session.calendarTimezone})::date) >= ${input.weekStart}::date
        ORDER BY clock.clock_in_at
      ` as Array<{ memberId: string; memberName: string; clockInAt: Date | string; clockOutAt: Date | string | null }>
    : [];

  return {
    weekStart: input.weekStart,
    weekEnd,
    calendarTimezone: input.session.calendarTimezone,
    currentMemberId: current.id,
    currentAccessRole: current.accessRole,
    canManageRoster: capabilities.createShifts,
    setup: capabilities.createShifts ? setup : null,
    publication: {
      status: publicationStatus as "draft" | "published" | "changes_pending",
      revision: publication?.revision ?? 0,
      publishedAt: publication?.publishedAt ?? null,
      lastSentAt: publication?.lastSentAt ?? null,
      affectedMemberCount: capabilities.createShifts
        ? changedMemberIds.size
        : 0,
      changedShiftCount: capabilities.createShifts ? changedShiftCount : 0,
    },
    members: members.map((member) => {
      const assignedRoles = memberRolesByMember.get(member.id) ?? [];
      return {
        ...member,
        roleIds: assignedRoles.map((role) => role.id),
        roleNames: assignedRoles.map((role) => role.name),
        recentShiftDurationMinutes:
          recentShiftDurationByMember.get(member.id) ?? null,
      };
    }),
    attendancePoints,
    roles: capabilities.createShifts ? roles : [],
    locations: capabilities.createShifts ? locations : [],
    availability: availabilityRows.map((availability) => ({
      ...availability,
      startTime: availability.startTime?.slice(0, 5) ?? null,
      endTime: availability.endTime?.slice(0, 5) ?? null,
    })),
    leave: leaveRows.map((leave) => ({
      ...leave,
      startTime: leave.startTime?.slice(0, 5) ?? null,
      endTime: leave.endTime?.slice(0, 5) ?? null,
    })),
    shifts: visibleShifts.map((shift) => ({
      id: shift.id,
      memberId: shift.memberId,
      memberName: shift.memberName,
      roleId: shift.roleId,
      roleName: shift.roleName,
      locationId: shift.locationId,
      locationName: shift.locationName,
      date: shift.date,
      startTime: shift.startTime.slice(0, 5),
      endTime: shift.endTime.slice(0, 5),
      note: shift.note,
      availabilityOverride: shift.availabilityOverride,
    })),
  };
}

export async function publishRosterWeek(input: {
  session: StaffSession;
  weekStart: string;
}) {
  const actor = await ensureStaffRosterMember(input.session);
  const capabilities = staffRosterCapabilities({
    accessRole: actor.accessRole,
    permission: input.session.permission,
  });
  if (!capabilities.createShifts) {
    throw new StaffRosterServiceError(403, "Manager access is required.");
  }

  const weekEnd = format(addDays(parseISO(input.weekStart), 6), "yyyy-MM-dd");
  const existing = await getDb()
    .select({
      id: staffRosterWeekPublications.id,
      revision: staffRosterWeekPublications.revision,
    })
    .from(staffRosterWeekPublications)
    .where(
      and(
        eq(staffRosterWeekPublications.calendarId, input.session.calendarId),
        eq(staffRosterWeekPublications.weekStart, input.weekStart),
      ),
    )
    .limit(1);

  const publicationId = existing[0]?.id ?? randomUUID();
  const action = existing[0] ? "send_updates" : "publish";

  const [notificationLiveShifts, notificationPublishedShifts] = await Promise.all([
    getDb()
      .select({
        id: staffRosterShifts.id,
        memberId: staffRosterShifts.memberId,
        roleId: staffRosterShifts.roleId,
        locationId: staffRosterShifts.locationId,
        date: staffRosterShifts.shiftDate,
        startTime: staffRosterShifts.startTime,
        endTime: staffRosterShifts.endTime,
        note: staffRosterShifts.note,
        availabilityOverride: staffRosterShifts.availabilityOverride,
      })
      .from(staffRosterShifts)
      .where(
        and(
          eq(staffRosterShifts.calendarId, input.session.calendarId),
          drizzleSql`${staffRosterShifts.shiftDate} >= ${input.weekStart}`,
          drizzleSql`${staffRosterShifts.shiftDate} <= ${weekEnd}`,
        ),
      ),
    existing[0]
      ? getDb()
          .select({
            id: staffRosterPublishedShifts.id,
            sourceShiftId: staffRosterPublishedShifts.sourceShiftId,
            memberId: staffRosterPublishedShifts.memberId,
            roleId: staffRosterPublishedShifts.roleId,
            locationId: staffRosterPublishedShifts.locationId,
            date: staffRosterPublishedShifts.shiftDate,
            startTime: staffRosterPublishedShifts.startTime,
            endTime: staffRosterPublishedShifts.endTime,
            note: staffRosterPublishedShifts.note,
            availabilityOverride: staffRosterPublishedShifts.availabilityOverride,
          })
          .from(staffRosterPublishedShifts)
          .where(eq(staffRosterPublishedShifts.publicationId, existing[0].id))
      : Promise.resolve([]),
  ]);

  const notificationMemberIds =
    action === "publish"
      ? [...new Set(notificationLiveShifts.map((shift) => shift.memberId))]
      : rosterPublicationDiff(
          notificationLiveShifts,
          notificationPublishedShifts,
        ).memberIds;

  const lockKey =
    input.session.calendarId + ":publication:" + input.weekStart;
  const sql = getSql();

  try {
    await sql.transaction([
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`,
      sql`
        INSERT INTO staff_roster_week_publications (
          id, calendar_id, week_start, revision,
          published_at, published_by_membership_id,
          last_sent_at, last_sent_by_membership_id,
          created_at, updated_at
        )
        VALUES (
          ${publicationId}, ${input.session.calendarId}, ${input.weekStart}, 1,
          now(), ${input.session.membershipId},
          now(), ${input.session.membershipId},
          now(), now()
        )
        ON CONFLICT (calendar_id, week_start)
        DO UPDATE SET
          revision = staff_roster_week_publications.revision + 1,
          last_sent_at = now(),
          last_sent_by_membership_id = EXCLUDED.last_sent_by_membership_id,
          updated_at = now()
      `,
      sql`
        WITH publication AS (
          SELECT id, calendar_id
          FROM staff_roster_week_publications
          WHERE calendar_id = ${input.session.calendarId}
            AND week_start = ${input.weekStart}
          LIMIT 1
        ),
        live AS (
          SELECT
            shift.id,
            shift.member_id,
            shift.shift_date,
            shift.start_time,
            shift.end_time,
            shift.role_id,
            shift.location_id,
            shift.note,
            shift.availability_override
          FROM staff_roster_shifts shift
          WHERE shift.calendar_id = ${input.session.calendarId}
            AND shift.shift_date >= ${input.weekStart}
            AND shift.shift_date <= ${weekEnd}
        ),
        previous AS (
          SELECT
            published.source_shift_id,
            published.member_id,
            published.shift_date,
            published.start_time,
            published.end_time,
            published.role_id,
            published.location_id,
            published.note,
            published.availability_override
          FROM staff_roster_published_shifts published
          JOIN publication ON publication.id = published.publication_id
        ),
        changed AS (
          SELECT
            live.member_id,
            live.shift_date,
            CASE
              WHEN previous.source_shift_id IS NULL
                OR live.member_id IS DISTINCT FROM previous.member_id
              THEN 'shift_added'
              ELSE 'shift_changed'
            END AS kind,
            CASE
              WHEN previous.source_shift_id IS NULL
                OR live.member_id IS DISTINCT FROM previous.member_id
              THEN NULL
              ELSE CONCAT(
                previous.shift_date::text, ' ',
                LEFT(previous.start_time::text, 5), '–',
                LEFT(previous.end_time::text, 5)
              )
            END AS before_summary,
            CONCAT(
              live.shift_date::text, ' ',
              LEFT(live.start_time::text, 5), '–',
              LEFT(live.end_time::text, 5)
            ) AS after_summary
          FROM live
          LEFT JOIN previous
            ON previous.source_shift_id = live.id
          WHERE ${action} = 'send_updates'
            AND (
              previous.source_shift_id IS NULL
              OR live.member_id IS DISTINCT FROM previous.member_id
              OR live.shift_date IS DISTINCT FROM previous.shift_date
              OR live.start_time IS DISTINCT FROM previous.start_time
              OR live.end_time IS DISTINCT FROM previous.end_time
              OR live.role_id IS DISTINCT FROM previous.role_id
              OR live.location_id IS DISTINCT FROM previous.location_id
              OR live.note IS DISTINCT FROM previous.note
              OR live.availability_override IS DISTINCT FROM previous.availability_override
            )

          UNION ALL

          SELECT
            previous.member_id,
            previous.shift_date,
            'shift_removed' AS kind,
            CONCAT(
              previous.shift_date::text, ' ',
              LEFT(previous.start_time::text, 5), '–',
              LEFT(previous.end_time::text, 5)
            ) AS before_summary,
            NULL AS after_summary
          FROM previous
          LEFT JOIN live
            ON live.id = previous.source_shift_id
          WHERE ${action} = 'send_updates'
            AND (
              live.id IS NULL
              OR live.member_id IS DISTINCT FROM previous.member_id
            )
        )
        INSERT INTO staff_roster_updates (
          id, calendar_id, member_id, publication_id,
          kind, title, before_summary, after_summary
        )
        SELECT
          gen_random_uuid(), publication.calendar_id, live.member_id,
          publication.id, 'published',
          'Your roster was published',
          NULL,
          COUNT(*)::text || CASE WHEN COUNT(*) = 1 THEN ' shift' ELSE ' shifts' END
        FROM publication
        JOIN live ON true
        WHERE ${action} = 'publish'
        GROUP BY publication.id, publication.calendar_id, live.member_id
        UNION ALL
        SELECT
          gen_random_uuid(), publication.calendar_id, changed.member_id,
          publication.id, changed.kind,
          TRIM(TO_CHAR(changed.shift_date, 'FMDay')) ||
            CASE changed.kind
              WHEN 'shift_added' THEN ' shift added'
              WHEN 'shift_removed' THEN ' shift removed'
              ELSE ' shift changed'
            END,
          changed.before_summary,
          changed.after_summary
        FROM publication
        JOIN changed ON true
      `,
      sql`
        DELETE FROM staff_roster_published_shifts
        WHERE publication_id = (
          SELECT id
          FROM staff_roster_week_publications
          WHERE calendar_id = ${input.session.calendarId}
            AND week_start = ${input.weekStart}
          LIMIT 1
        )
      `,
      sql`
        INSERT INTO staff_roster_published_shifts (
          publication_id, source_shift_id, member_id, role_id, location_id,
          shift_date, start_time, end_time, note, availability_override
        )
        SELECT
          publication.id, shift.id, shift.member_id, shift.role_id, shift.location_id,
          shift.shift_date, shift.start_time, shift.end_time,
          shift.note, shift.availability_override
        FROM staff_roster_week_publications publication
        JOIN staff_roster_shifts shift
          ON shift.calendar_id = publication.calendar_id
         AND shift.shift_date >= ${input.weekStart}
         AND shift.shift_date <= ${weekEnd}
        WHERE publication.calendar_id = ${input.session.calendarId}
          AND publication.week_start = ${input.weekStart}
      `,
      sql`
        INSERT INTO audit_log (
          calendar_id, actor_participant_id, action,
          entity_type, entity_id, after_state
        )
        SELECT
          ${input.session.calendarId}, NULL,
          ${action === "publish"
            ? "staff_roster.week.publish"
            : "staff_roster.week.send_updates"},
          'staff_roster_week_publication',
          publication.id,
          jsonb_build_object(
            'weekStart', ${input.weekStart},
            'revision', publication.revision,
            'actorStaffMemberId', ${actor.id}
          )
        FROM staff_roster_week_publications publication
        WHERE publication.calendar_id = ${input.session.calendarId}
          AND publication.week_start = ${input.weekStart}
      `,
    ]);
  } catch {
    throw new StaffRosterServiceError(
      409,
      action === "publish"
        ? "The roster could not be published."
        : "The roster updates could not be sent.",
    );
  }

  const emailDelivery = await sendStaffRosterEmails({
    calendarId: input.session.calendarId,
    memberIds: notificationMemberIds,
    kind: action === "publish" ? "roster_published" : "roster_updated",
    weekStart: input.weekStart,
  }).catch(() => ({
    configured: false,
    attempted: 0,
    sent: 0,
    failed: 0,
    skippedUnlinked: 0,
    lookupFailed: true,
  }));

  const rows = await getDb()
    .select({
      revision: staffRosterWeekPublications.revision,
    })
    .from(staffRosterWeekPublications)
    .where(
      and(
        eq(staffRosterWeekPublications.calendarId, input.session.calendarId),
        eq(staffRosterWeekPublications.weekStart, input.weekStart),
      ),
    )
    .limit(1);

  return {
    ok: true as const,
    action,
    revision: rows[0]?.revision ?? 1,
    affectedMemberCount: notificationMemberIds.length,
    emailDelivery,
  };
}

export async function getRosterUpdates(session: StaffSession) {
  const current = await ensureStaffRosterMember(session);
  const capabilities = staffRosterCapabilities({
    accessRole: current.accessRole,
    permission: session.permission,
  });

  const rows = await getDb()
    .select({
      id: staffRosterUpdates.id,
      memberId: staffRosterUpdates.memberId,
      memberName: staffRosterMembers.displayName,
      kind: staffRosterUpdates.kind,
      title: staffRosterUpdates.title,
      beforeSummary: staffRosterUpdates.beforeSummary,
      afterSummary: staffRosterUpdates.afterSummary,
      createdAt: staffRosterUpdates.createdAt,
      weekStart: staffRosterWeekPublications.weekStart,
    })
    .from(staffRosterUpdates)
    .innerJoin(
      staffRosterMembers,
      eq(staffRosterUpdates.memberId, staffRosterMembers.id),
    )
    .innerJoin(
      staffRosterWeekPublications,
      eq(staffRosterUpdates.publicationId, staffRosterWeekPublications.id),
    )
    .where(
      and(
        eq(staffRosterUpdates.calendarId, session.calendarId),
        capabilities.createShifts
          ? drizzleSql`true`
          : eq(staffRosterUpdates.memberId, current.id),
      ),
    )
    .orderBy(desc(staffRosterUpdates.createdAt))
    .limit(50);

  return {
    currentMemberId: current.id,
    currentAccessRole: current.accessRole,
    canManageRoster: capabilities.createShifts,
    updates: rows,
  };
}

export async function copyPreviousRosterWeek(input: {
  session: StaffSession;
  targetWeekStart: string;
}) {
  const actor = await ensureStaffRosterMember(input.session);
  const capabilities = staffRosterCapabilities({
    accessRole: actor.accessRole,
    permission: input.session.permission,
  });
  if (!capabilities.createShifts) {
    throw new StaffRosterServiceError(403, "Manager access is required.");
  }

  const sourceWeekStart = format(
    subDays(parseISO(input.targetWeekStart), 7),
    "yyyy-MM-dd",
  );
  const sourceWeekEnd = format(
    addDays(parseISO(sourceWeekStart), 6),
    "yyyy-MM-dd",
  );

  const db = getDb();
  const [sourceShifts, activeMembers, activeRoles, activeLocations] =
    await Promise.all([
      db
        .select({
          memberId: staffRosterShifts.memberId,
          roleId: staffRosterShifts.roleId,
          locationId: staffRosterShifts.locationId,
          date: staffRosterShifts.shiftDate,
          startTime: staffRosterShifts.startTime,
          endTime: staffRosterShifts.endTime,
          note: staffRosterShifts.note,
        })
        .from(staffRosterShifts)
        .where(
          and(
            eq(staffRosterShifts.calendarId, input.session.calendarId),
            drizzleSql`${staffRosterShifts.shiftDate} >= ${sourceWeekStart}`,
            drizzleSql`${staffRosterShifts.shiftDate} <= ${sourceWeekEnd}`,
          ),
        )
        .orderBy(
          asc(staffRosterShifts.shiftDate),
          asc(staffRosterShifts.startTime),
        ),
      db
        .select({ id: staffRosterMembers.id })
        .from(staffRosterMembers)
        .where(
          and(
            eq(staffRosterMembers.calendarId, input.session.calendarId),
            eq(staffRosterMembers.active, true),
          ),
        ),
      db
        .select({ id: staffRosterRoles.id })
        .from(staffRosterRoles)
        .where(
          and(
            eq(staffRosterRoles.calendarId, input.session.calendarId),
            eq(staffRosterRoles.active, true),
          ),
        ),
      db
        .select({ id: staffRosterLocations.id })
        .from(staffRosterLocations)
        .where(
          and(
            eq(staffRosterLocations.calendarId, input.session.calendarId),
            eq(staffRosterLocations.active, true),
          ),
        ),
    ]);

  const activeMemberIds = new Set(activeMembers.map((member) => member.id));
  const activeRoleIds = new Set(activeRoles.map((role) => role.id));
  const activeLocationIds = new Set(
    activeLocations.map((location) => location.id),
  );

  let copied = 0;
  let overlapSkipped = 0;
  let availabilitySkipped = 0;
  let leaveSkipped = 0;
  let inactiveStaffSkipped = 0;
  let staleReferenceAdjusted = 0;

  for (const shift of sourceShifts) {
    if (!activeMemberIds.has(shift.memberId)) {
      inactiveStaffSkipped += 1;
      continue;
    }

    const roleId =
      shift.roleId && activeRoleIds.has(shift.roleId) ? shift.roleId : null;
    const locationId =
      shift.locationId && activeLocationIds.has(shift.locationId)
        ? shift.locationId
        : null;

    if (roleId !== shift.roleId || locationId !== shift.locationId) {
      staleReferenceAdjusted += 1;
    }

    const targetDate = format(
      addDays(parseISO(shift.date), 7),
      "yyyy-MM-dd",
    );

    try {
      await createShift({
        session: input.session,
        memberId: shift.memberId,
        date: targetDate,
        startTime: shift.startTime.slice(0, 5),
        endTime: shift.endTime.slice(0, 5),
        roleId,
        locationId,
        note: shift.note,
        overrideAvailabilityConflict: false,
      });
      copied += 1;
    } catch (error) {
      if (
        error instanceof StaffRosterServiceError &&
        error.code === "availability_conflict"
      ) {
        availabilitySkipped += 1;
        continue;
      }
      if (
        error instanceof StaffRosterServiceError &&
        (error.code === "pending_leave_conflict" ||
          error.code === "approved_leave_conflict")
      ) {
        leaveSkipped += 1;
        continue;
      }
      if (
        error instanceof StaffRosterServiceError &&
        error.code === "shift_overlap"
      ) {
        overlapSkipped += 1;
        continue;
      }
      throw error;
    }
  }

  const skipped =
    overlapSkipped +
    availabilitySkipped +
    leaveSkipped +
    inactiveStaffSkipped;
  return {
    ok: true as const,
    copied,
    skipped,
    overlapSkipped,
    availabilitySkipped,
    leaveSkipped,
    inactiveStaffSkipped,
    staleReferenceAdjusted,
    sourceWeekStart,
    targetWeekStart: input.targetWeekStart,
  };
}

export async function createShift(input: {
  session: StaffSession;
  memberId: string;
  date: string;
  startTime: string;
  endTime: string;
  roleId: string | null;
  locationId: string | null;
  note: string | null;
  overrideAvailabilityConflict: boolean;
}) {
  const actor = await ensureStaffRosterMember(input.session);
  const capabilities = staffRosterCapabilities({
    accessRole: actor.accessRole,
    permission: input.session.permission,
  });

  if (!capabilities.createShifts) {
    throw new StaffRosterServiceError(403, "Manager access is required.");
  }

  const member = await assertActiveRosterMember(
    input.session.calendarId,
    input.memberId,
  );
  await assertReferenceBelongsToCalendar({
    calendarId: input.session.calendarId,
    roleId: input.roleId,
    locationId: input.locationId,
  });

  const conflicts = await shiftConflictState({
    calendarId: input.session.calendarId,
    memberId: input.memberId,
    date: input.date,
    startTime: input.startTime,
    endTime: input.endTime,
  });

  if (conflicts.overlaps.length > 0) {
    throw new StaffRosterServiceError(
      409,
      "This person already has an overlapping shift.",
      "shift_overlap",
      conflicts.overlaps,
    );
  }

  if (conflicts.approvedLeave.length > 0) {
    throw new StaffRosterServiceError(
      409,
      member.displayName + " is on approved leave during this shift.",
      "approved_leave_conflict",
      conflicts.approvedLeave,
    );
  }

  if (
    (conflicts.unavailable.length > 0 || conflicts.pendingLeave.length > 0) &&
    !input.overrideAvailabilityConflict
  ) {
    const pendingLeave = conflicts.pendingLeave.length > 0;
    throw new StaffRosterServiceError(
      409,
      pendingLeave
        ? member.displayName + " has a pending leave request during this shift."
        : member.displayName + " is marked unavailable during this shift.",
      pendingLeave ? "pending_leave_conflict" : "availability_conflict",
      pendingLeave ? conflicts.pendingLeave : conflicts.unavailable,
    );
  }

  const id = randomUUID();
  const sql = getSql();
  const lockKey =
    input.session.calendarId + ":" + input.memberId + ":" + input.date;
  let inserted: Array<{ id: string }>;

  try {
    inserted = (await sql`
      WITH locked AS MATERIALIZED (
        SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))
      ),
      created AS (
        INSERT INTO staff_roster_shifts (
          id, calendar_id, member_id, role_id, location_id,
          shift_date, start_time, end_time, note,
          availability_override, created_by_membership_id
        )
        SELECT
          ${id}, ${input.session.calendarId}, ${input.memberId},
          ${input.roleId}, ${input.locationId},
          ${input.date}, ${input.startTime}, ${input.endTime}, ${input.note},
          ${conflicts.unavailable.length > 0 || conflicts.pendingLeave.length > 0}, ${input.session.membershipId}
        FROM locked
        WHERE NOT EXISTS (
          SELECT 1
          FROM staff_roster_shifts existing
          WHERE existing.calendar_id = ${input.session.calendarId}
            AND existing.member_id = ${input.memberId}
            AND existing.shift_date = ${input.date}
            AND existing.start_time < ${input.endTime}
              AND existing.end_time > ${input.startTime}
        )
        AND NOT EXISTS (
          SELECT 1 FROM staff_roster_leave_requests leave_request
          WHERE leave_request.calendar_id = ${input.session.calendarId}
            AND leave_request.member_id = ${input.memberId} AND leave_request.status = 'approved'
            AND ${input.date}::date BETWEEN leave_request.start_date AND leave_request.end_date
            AND (leave_request.all_day OR (leave_request.start_time < ${input.endTime}::time
              AND leave_request.end_time > ${input.startTime}::time))
        )
        RETURNING id
      ),
      audited AS (
        INSERT INTO audit_log (
          calendar_id, actor_participant_id, action,
          entity_type, entity_id, after_state
        )
        SELECT
          ${input.session.calendarId}, NULL,
          'staff_roster.shift.create',
          'staff_roster_shift',
          created.id,
          ${JSON.stringify({
            memberId: input.memberId,
            date: input.date,
            startTime: input.startTime,
            endTime: input.endTime,
            roleId: input.roleId,
            locationId: input.locationId,
            note: input.note,
            availabilityOverride:
              conflicts.unavailable.length > 0 ||
              conflicts.pendingLeave.length > 0,
            actorStaffMemberId: actor.id,
          })}::jsonb
        FROM created
      )
      SELECT id FROM created
    `) as Array<{ id: string }>;
  } catch {
    throw new StaffRosterServiceError(409, "The shift could not be created.");
  }

  if (!inserted[0]) {
    const latest = await shiftConflictState({ calendarId: input.session.calendarId, memberId: input.memberId, date: input.date, startTime: input.startTime, endTime: input.endTime });
    if (latest.approvedLeave.length > 0) {
      throw new StaffRosterServiceError(409, "Approved leave now overlaps this shift. Refresh the roster before trying again.", "approved_leave_conflict", latest.approvedLeave);
    }
    throw new StaffRosterServiceError(
      409,
      "This person already has an overlapping shift.",
      "shift_overlap",
    );
  }

  return { ok: true as const, id };
}

export async function updateShift(input: {
  session: StaffSession;
  shiftId: string;
  memberId: string;
  date: string;
  startTime: string;
  endTime: string;
  roleId: string | null;
  locationId: string | null;
  note: string | null;
  overrideAvailabilityConflict: boolean;
}) {
  const actor = await ensureStaffRosterMember(input.session);
  const capabilities = staffRosterCapabilities({
    accessRole: actor.accessRole,
    permission: input.session.permission,
  });
  if (!capabilities.createShifts) {
    throw new StaffRosterServiceError(403, "Manager access is required.");
  }

  const existingRows = await getDb()
    .select({
      id: staffRosterShifts.id,
      memberId: staffRosterShifts.memberId,
      date: staffRosterShifts.shiftDate,
      startTime: staffRosterShifts.startTime,
      endTime: staffRosterShifts.endTime,
      roleId: staffRosterShifts.roleId,
      locationId: staffRosterShifts.locationId,
      note: staffRosterShifts.note,
      availabilityOverride: staffRosterShifts.availabilityOverride,
    })
    .from(staffRosterShifts)
    .where(
      and(
        eq(staffRosterShifts.id, input.shiftId),
        eq(staffRosterShifts.calendarId, input.session.calendarId),
      ),
    )
    .limit(1);

  const existing = existingRows[0];
  if (!existing) {
    throw new StaffRosterServiceError(404, "Shift not found.");
  }

  const member = await assertActiveRosterMember(
    input.session.calendarId,
    input.memberId,
  );
  await assertReferenceBelongsToCalendar({
    calendarId: input.session.calendarId,
    roleId: input.roleId,
    locationId: input.locationId,
  });

  const conflicts = await shiftConflictState({
    calendarId: input.session.calendarId,
    memberId: input.memberId,
    date: input.date,
    startTime: input.startTime,
    endTime: input.endTime,
    excludeShiftId: input.shiftId,
  });

  if (conflicts.overlaps.length > 0) {
    throw new StaffRosterServiceError(
      409,
      "This person already has an overlapping shift.",
      "shift_overlap",
      conflicts.overlaps,
    );
  }

  if (conflicts.approvedLeave.length > 0) {
    throw new StaffRosterServiceError(
      409,
      member.displayName + " is on approved leave during this shift.",
      "approved_leave_conflict",
      conflicts.approvedLeave,
    );
  }

  if (
    (conflicts.unavailable.length > 0 || conflicts.pendingLeave.length > 0) &&
    !input.overrideAvailabilityConflict
  ) {
    const pendingLeave = conflicts.pendingLeave.length > 0;
    throw new StaffRosterServiceError(
      409,
      pendingLeave
        ? member.displayName + " has a pending leave request during this shift."
        : member.displayName + " is marked unavailable during this shift.",
      pendingLeave ? "pending_leave_conflict" : "availability_conflict",
      pendingLeave ? conflicts.pendingLeave : conflicts.unavailable,
    );
  }

  const sql = getSql();
  const lockKey =
    input.session.calendarId + ":" + input.memberId + ":" + input.date;
  let updated: Array<{ id: string }>;

  try {
    updated = (await sql`
      WITH locked AS MATERIALIZED (
        SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))
      ),
      changed AS (
        UPDATE staff_roster_shifts shift
        SET
          member_id = ${input.memberId},
          role_id = ${input.roleId},
          location_id = ${input.locationId},
          shift_date = ${input.date},
          start_time = ${input.startTime},
          end_time = ${input.endTime},
          note = ${input.note},
          availability_override = ${conflicts.unavailable.length > 0 || conflicts.pendingLeave.length > 0},
          updated_at = now()
        FROM locked
        WHERE shift.id = ${input.shiftId}
          AND shift.calendar_id = ${input.session.calendarId}
          AND NOT EXISTS (
            SELECT 1
            FROM staff_roster_shifts other
            WHERE other.calendar_id = ${input.session.calendarId}
              AND other.member_id = ${input.memberId}
              AND other.shift_date = ${input.date}
              AND other.id <> ${input.shiftId}
              AND other.start_time < ${input.endTime}
              AND other.end_time > ${input.startTime}
          )
          AND NOT EXISTS (
            SELECT 1 FROM staff_roster_leave_requests leave_request
            WHERE leave_request.calendar_id = ${input.session.calendarId}
              AND leave_request.member_id = ${input.memberId} AND leave_request.status = 'approved'
              AND ${input.date}::date BETWEEN leave_request.start_date AND leave_request.end_date
              AND (leave_request.all_day OR (leave_request.start_time < ${input.endTime}::time
                AND leave_request.end_time > ${input.startTime}::time))
          )
        RETURNING shift.id
      ),
      audited AS (
        INSERT INTO audit_log (
          calendar_id, actor_participant_id, action,
          entity_type, entity_id, before_state, after_state
        )
        SELECT
          ${input.session.calendarId}, NULL,
          'staff_roster.shift.update',
          'staff_roster_shift',
          changed.id,
          ${JSON.stringify(existing)}::jsonb,
          ${JSON.stringify({
            memberId: input.memberId,
            date: input.date,
            startTime: input.startTime,
            endTime: input.endTime,
            roleId: input.roleId,
            locationId: input.locationId,
            note: input.note,
            availabilityOverride:
              conflicts.unavailable.length > 0 ||
              conflicts.pendingLeave.length > 0,
            actorStaffMemberId: actor.id,
          })}::jsonb
        FROM changed
      )
      SELECT id FROM changed
    `) as Array<{ id: string }>;
  } catch {
    throw new StaffRosterServiceError(409, "The shift could not be updated.");
  }

  if (!updated[0]) {
    const latest = await shiftConflictState({ calendarId: input.session.calendarId, memberId: input.memberId, date: input.date, startTime: input.startTime, endTime: input.endTime, excludeShiftId: input.shiftId });
    if (latest.approvedLeave.length > 0) {
      throw new StaffRosterServiceError(409, "Approved leave now overlaps this shift. Refresh the roster before trying again.", "approved_leave_conflict", latest.approvedLeave);
    }
    throw new StaffRosterServiceError(
      409,
      "This person already has an overlapping shift.",
      "shift_overlap",
    );
  }

  return { ok: true as const };
}

export async function deleteShift(input: {
  session: StaffSession;
  shiftId: string;
}) {
  const actor = await ensureStaffRosterMember(input.session);
  const capabilities = staffRosterCapabilities({
    accessRole: actor.accessRole,
    permission: input.session.permission,
  });
  if (!capabilities.createShifts) {
    throw new StaffRosterServiceError(403, "Manager access is required.");
  }

  const rows = await getDb()
    .select({
      id: staffRosterShifts.id,
      memberId: staffRosterShifts.memberId,
      date: staffRosterShifts.shiftDate,
      startTime: staffRosterShifts.startTime,
      endTime: staffRosterShifts.endTime,
      roleId: staffRosterShifts.roleId,
      locationId: staffRosterShifts.locationId,
      note: staffRosterShifts.note,
    })
    .from(staffRosterShifts)
    .where(
      and(
        eq(staffRosterShifts.id, input.shiftId),
        eq(staffRosterShifts.calendarId, input.session.calendarId),
      ),
    )
    .limit(1);

  const existing = rows[0];
  if (!existing) {
    throw new StaffRosterServiceError(404, "Shift not found.");
  }

  const sql = getSql();
  try {
    await sql.transaction([
      sql`
        DELETE FROM staff_roster_shifts
        WHERE id = ${input.shiftId}
          AND calendar_id = ${input.session.calendarId}
      `,
      sql`
        INSERT INTO audit_log (
          calendar_id, actor_participant_id, action,
          entity_type, entity_id, before_state, after_state
        )
        VALUES (
          ${input.session.calendarId}, NULL,
          'staff_roster.shift.delete',
          'staff_roster_shift',
          ${input.shiftId},
          ${JSON.stringify(existing)}::jsonb,
          ${JSON.stringify({ deleted: true, actorStaffMemberId: actor.id })}::jsonb
        )
      `,
    ]);
  } catch {
    throw new StaffRosterServiceError(409, "The shift could not be deleted.");
  }

  return { ok: true as const };
}
