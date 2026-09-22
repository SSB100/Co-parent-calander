import { randomUUID } from "node:crypto";
import { addDays, format, parseISO } from "date-fns";
import { and, asc, eq, sql as drizzleSql } from "drizzle-orm";
import { getDb, getSql } from "@/lib/db";
import {
  staffRosterAvailability,
  staffRosterLocations,
  staffRosterMembers,
  staffRosterRoles,
  staffRosterSettings,
  staffRosterShifts,
} from "@/lib/db/schema";
import { localDateInTimeZone } from "@/lib/calendar/time";
import {
  staffRosterCapabilities,
  type StaffRosterAccessRole,
} from "@/lib/staff-rosters/capabilities";

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

export async function getTeam(session: StaffSession) {
  const current = await ensureStaffRosterMember(session);
  const db = getDb();

  const members = await db
    .select({
      id: staffRosterMembers.id,
      displayName: staffRosterMembers.displayName,
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

  const [roles, locations] = await Promise.all([
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
  ]);

  const capabilities = staffRosterCapabilities({
    accessRole: current.accessRole,
    permission: session.permission,
  });

  return {
    currentMemberId: current.id,
    currentAccessRole: current.accessRole,
    canManageTeam: capabilities.manageTeam,
    canManageManagers: capabilities.manageManagers,
    members: members.map((member) => ({
      ...member,
      hasAccount: Boolean(member.membershipId),
      isCurrentUser: member.id === current.id,
    })),
    roles,
    locations,
  };
}

export async function createTeamMember(input: {
  session: StaffSession;
  displayName: string;
  accessRole: "manager" | "staff";
  defaultRoleId: string | null;
  defaultLocationId: string | null;
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

  await assertReferenceBelongsToCalendar({
    calendarId: input.session.calendarId,
    roleId: input.defaultRoleId,
    locationId: input.defaultLocationId,
  });

  const id = randomUUID();
  const sql = getSql();

  try {
    await sql.transaction([
      sql`
        INSERT INTO staff_roster_members (
          id, calendar_id, display_name, access_role,
          default_role_id, default_location_id, active
        )
        VALUES (
          ${id}, ${input.session.calendarId}, ${input.displayName},
          ${input.accessRole}::staff_roster_access_role,
          ${input.defaultRoleId}, ${input.defaultLocationId}, true
        )
      `,
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
            actorStaffMemberId: actor.id,
          })}::jsonb
        )
      `,
    ]);
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
  defaultRoleId: string | null;
  defaultLocationId: string | null;
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

  await assertReferenceBelongsToCalendar({
    calendarId: input.session.calendarId,
    roleId: input.defaultRoleId,
    locationId: input.defaultLocationId,
  });

  const sql = getSql();
  try {
    await sql.transaction([
      sql`
        UPDATE staff_roster_members
        SET
          display_name = ${input.displayName},
          access_role = ${input.accessRole}::staff_roster_access_role,
          default_role_id = ${input.defaultRoleId},
          default_location_id = ${input.defaultLocationId},
          active = ${input.active},
          updated_at = now()
        WHERE id = ${input.memberId}
          AND calendar_id = ${input.session.calendarId}
      `,
      sql`
        INSERT INTO audit_log (
          calendar_id, actor_participant_id, action,
          entity_type, entity_id, before_state, after_state
        )
        VALUES (
          ${input.session.calendarId}, NULL, 'staff_roster.member.update',
          'staff_roster_member', ${input.memberId},
          ${JSON.stringify({
            displayName: target.displayName,
            accessRole: target.accessRole,
            defaultRoleId: target.defaultRoleId,
            defaultLocationId: target.defaultLocationId,
            active: target.active,
          })}::jsonb,
          ${JSON.stringify({
            displayName: input.displayName,
            accessRole: input.accessRole,
            defaultRoleId: input.defaultRoleId,
            defaultLocationId: input.defaultLocationId,
            active: input.active,
            actorStaffMemberId: actor.id,
          })}::jsonb
        )
      `,
    ]);
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

  const capabilities = staffRosterCapabilities({
    accessRole: current.accessRole,
    permission: session.permission,
  });

  return {
    canManage: capabilities.manageStructure,
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
          UPDATE staff_roster_members
          SET default_role_id = NULL, updated_at = now()
          WHERE calendar_id = ${input.session.calendarId}
            AND default_role_id = ${input.id}
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
    input.to ?? format(addDays(parseISO(today), 30), "yyyy-MM-dd");
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
  try {
    await sql.transaction([
      sql`
        INSERT INTO staff_roster_availability (
          id, calendar_id, member_id, availability_date,
          start_time, end_time, status, note, created_by_membership_id
        )
        VALUES (
          ${id}, ${input.session.calendarId}, ${input.memberId}, ${input.date},
          ${input.startTime}, ${input.endTime},
          ${input.status}::staff_roster_availability_status,
          ${input.note}, ${input.session.membershipId}
        )
      `,
      sql`
        INSERT INTO audit_log (
          calendar_id, actor_participant_id, action,
          entity_type, entity_id, after_state
        )
        VALUES (
          ${input.session.calendarId}, NULL,
          'staff_roster.availability.create',
          'staff_roster_availability', ${id},
          ${JSON.stringify({
            memberId: input.memberId,
            date: input.date,
            startTime: input.startTime,
            endTime: input.endTime,
            status: input.status,
            note: input.note,
            actorStaffMemberId: actor.id,
          })}::jsonb
        )
      `,
    ]);
  } catch {
    throw new StaffRosterServiceError(
      409,
      "Availability could not be added.",
    );
  }

  return { ok: true as const, id };
}

export async function deleteAvailability(input: {
  session: StaffSession;
  availabilityId: string;
}) {
  const actor = await ensureStaffRosterMember(input.session);
  const rows = await getDb()
    .select({
      id: staffRosterAvailability.id,
      memberId: staffRosterAvailability.memberId,
      date: staffRosterAvailability.availabilityDate,
      startTime: staffRosterAvailability.startTime,
      endTime: staffRosterAvailability.endTime,
      status: staffRosterAvailability.status,
      note: staffRosterAvailability.note,
    })
    .from(staffRosterAvailability)
    .where(
      and(
        eq(staffRosterAvailability.id, input.availabilityId),
        eq(staffRosterAvailability.calendarId, input.session.calendarId),
      ),
    )
    .limit(1);

  const entry = rows[0];
  if (!entry) {
    throw new StaffRosterServiceError(404, "Availability entry not found.");
  }

  const capabilities = staffRosterCapabilities({
    accessRole: actor.accessRole,
    permission: input.session.permission,
  });

  if (
    !capabilities.editOwnAvailability ||
    (!capabilities.manageAllAvailability && entry.memberId !== actor.id)
  ) {
    throw new StaffRosterServiceError(
      403,
      "You can only change your own availability.",
    );
  }

  const sql = getSql();
  try {
    await sql.transaction([
      sql`
        DELETE FROM staff_roster_availability
        WHERE id = ${input.availabilityId}
          AND calendar_id = ${input.session.calendarId}
      `,
      sql`
        INSERT INTO audit_log (
          calendar_id, actor_participant_id, action,
          entity_type, entity_id, before_state, after_state
        )
        VALUES (
          ${input.session.calendarId}, NULL,
          'staff_roster.availability.delete',
          'staff_roster_availability', ${input.availabilityId},
          ${JSON.stringify({
            memberId: entry.memberId,
            date: entry.date,
            startTime: entry.startTime,
            endTime: entry.endTime,
            status: entry.status,
            note: entry.note,
          })}::jsonb,
          ${JSON.stringify({ actorStaffMemberId: actor.id, deleted: true })}::jsonb
        )
      `,
    ]);
  } catch {
    throw new StaffRosterServiceError(
      409,
      "Availability could not be removed.",
    );
  }

  return { ok: true as const };
}


export async function getRosterSetup(session: StaffSession) {
  const current = await ensureStaffRosterMember(session);
  const capabilities = staffRosterCapabilities({
    accessRole: current.accessRole,
    permission: session.permission,
  });
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
        .select({ setupCompletedAt: staffRosterSettings.setupCompletedAt })
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

  const [overlaps, unavailable] = await Promise.all([
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
  ]);

  return { overlaps, unavailable };
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

  const [members, roles, locations, shifts, setup] = await Promise.all([
    db
      .select({
        id: staffRosterMembers.id,
        displayName: staffRosterMembers.displayName,
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
    getRosterSetup(input.session),
  ]);

  return {
    weekStart: input.weekStart,
    weekEnd,
    currentMemberId: current.id,
    currentAccessRole: current.accessRole,
    canManageRoster: capabilities.createShifts,
    setup,
    members,
    roles,
    locations,
    shifts: shifts.map((shift) => ({
      ...shift,
      startTime: shift.startTime.slice(0, 5),
      endTime: shift.endTime.slice(0, 5),
    })),
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

  if (
    conflicts.unavailable.length > 0 &&
    !input.overrideAvailabilityConflict
  ) {
    throw new StaffRosterServiceError(
      409,
      member.displayName + " is marked unavailable during this shift.",
      "availability_conflict",
      conflicts.unavailable,
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
          ${conflicts.unavailable.length > 0}, ${input.session.membershipId}
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
            availabilityOverride: conflicts.unavailable.length > 0,
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

  if (
    conflicts.unavailable.length > 0 &&
    !input.overrideAvailabilityConflict
  ) {
    throw new StaffRosterServiceError(
      409,
      member.displayName + " is marked unavailable during this shift.",
      "availability_conflict",
      conflicts.unavailable,
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
          availability_override = ${conflicts.unavailable.length > 0},
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
            availabilityOverride: conflicts.unavailable.length > 0,
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
