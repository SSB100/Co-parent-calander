import { randomUUID } from "node:crypto";
import { addDays, format, parseISO } from "date-fns";
import { and, asc, eq, sql as drizzleSql } from "drizzle-orm";
import { getDb, getSql } from "@/lib/db";
import {
  staffRosterAvailability,
  staffRosterLocations,
  staffRosterMembers,
  staffRosterRoles,
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
      accessRole: staffRosterMembers.accessRole,
      membershipId: staffRosterMembers.membershipId,
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

  try {
    await db
      .update(staffRosterMembers)
      .set({
        displayName: input.displayName,
        accessRole: input.accessRole,
        defaultRoleId: input.defaultRoleId,
        defaultLocationId: input.defaultLocationId,
        active: input.active,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(staffRosterMembers.id, input.memberId),
          eq(staffRosterMembers.calendarId, input.session.calendarId),
        ),
      );
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
  try {
    if (input.kind === "role") {
      await getDb().insert(staffRosterRoles).values({
        id,
        calendarId: input.session.calendarId,
        name: input.name,
      });
    } else {
      await getDb().insert(staffRosterLocations).values({
        id,
        calendarId: input.session.calendarId,
        name: input.name,
      });
    }
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
  try {
    await getDb().insert(staffRosterAvailability).values({
      id,
      calendarId: input.session.calendarId,
      memberId: input.memberId,
      availabilityDate: input.date,
      startTime: input.startTime,
      endTime: input.endTime,
      status: input.status,
      note: input.note,
      createdByMembershipId: input.session.membershipId,
    });
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

  await getDb()
    .delete(staffRosterAvailability)
    .where(
      and(
        eq(staffRosterAvailability.id, input.availabilityId),
        eq(staffRosterAvailability.calendarId, input.session.calendarId),
      ),
    );

  return { ok: true as const };
}
