"use server";

import { randomUUID } from "node:crypto";
import { redeemSalonInvitation } from "@/lib/salon/service";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth/server";
import { DEFAULT_CALENDAR_TIMEZONE } from "@/lib/calendar/time";
import { getSql } from "@/lib/db";
import { redeemMemberInvitation } from "@/lib/calendar-sharing/invitations";
import { usesMemberInvitations } from "@/lib/calendar-sharing/policy";
import { defaultParentColorKey } from "@/lib/parents/identity";
import {
  generateInviteCode,
  NEW_CALENDAR_INVITE_COOKIE_NAME,
  normalizeInviteCode,
} from "@/lib/security/invites";
import { SELECTED_CALENDAR_COOKIE_NAME } from "@/lib/security/session";
import { hashToken } from "@/lib/security/tokens";
import { acceptStaffRosterInviteCode } from "@/lib/staff-rosters/invitations-service";
import { StaffRosterServiceError } from "@/lib/staff-rosters/service";
import {
  calendarPathForType,
  calendarTemplateIds,
  isCalendarTemplateId,
  type CalendarTemplateId,
} from "@/lib/templates/calendar-templates";

export type CalendarActionState = { error: string | null };

const calendarSchema = z
  .object({
    calendarName: z.string().trim().min(1, "Add a calendar name.").max(80),
    calendarType: z.enum(calendarTemplateIds),
    displayName: z.string().trim().min(1, "Add your name.").max(50),
    children: z.array(z.string().trim().min(1).max(50)).max(10),
    staffNames: z.array(z.string().trim().min(1).max(80)).max(50),
  })
  .superRefine((value, context) => {
    if (value.calendarType === "co_parenting" && value.children.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["children"],
        message: "Add at least one child.",
      });
    }
    if (value.calendarType === "staff_rosters" && value.staffNames.length === 0) {
      context.addIssue({ code: "custom", path: ["staffNames"], message: "Add at least one staff member." });
    }
  });

function calendarCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  };
}

function onboardingInviteCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 10,
  };
}

async function requireAccount() {
  const { data: session } = await auth.getSession();
  return session?.user ?? null;
}

export async function createCalendar(
  _previous: CalendarActionState,
  formData: FormData,
): Promise<CalendarActionState> {
  const user = await requireAccount();
  if (!user) return { error: "Log in again to continue." };

  const parsed = calendarSchema.safeParse({
    calendarName: formData.get("calendarName"),
    calendarType: formData.get("calendarType") || "co_parenting",
    displayName: formData.get("displayName") || user.name,
    children: String(formData.get("children") ?? "")
      .split("\n")
      .map((name) => name.trim())
      .filter(Boolean),
    staffNames: String(formData.get("staffNames") ?? "")
      .split("\n")
      .map((name) => name.trim())
      .filter(Boolean),
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Check the calendar details.",
    };
  }

  const isCoParenting = parsed.data.calendarType === "co_parenting";
  const inviteHandoff =
    isCoParenting &&
    ["onboarding", "calendar-management"].includes(
      String(formData.get("flow") ?? ""),
    );
  const calendarId = randomUUID();
  const participantId = isCoParenting ? randomUUID() : null;
  const inviteCode = inviteHandoff ? generateInviteCode() : null;
  const normalizedInviteCode = inviteCode
    ? normalizeInviteCode(inviteCode)
    : null;
  const inviteExpiresAt = inviteCode
    ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    : null;
  const sql = getSql();

  const statements = [
    sql`
      INSERT INTO calendars (id, name, calendar_type, timezone, share_enabled)
      VALUES (
        ${calendarId},
        ${parsed.data.calendarName},
        ${parsed.data.calendarType}::calendar_type,
        ${DEFAULT_CALENDAR_TIMEZONE},
        false
      )
    `,
    ...(isCoParenting && participantId
      ? [
          sql`
            INSERT INTO participants (
              id, calendar_id, display_name, role, color_key, profile_slot, active
            )
            VALUES (
              ${participantId}, ${calendarId}, ${parsed.data.displayName}, 'parent',
              ${defaultParentColorKey("parent_one")}, 'parent_one', true
            )
          `,
          ...parsed.data.children.map(
            (displayName) => sql`
              INSERT INTO children (id, calendar_id, display_name, active)
              VALUES (${randomUUID()}, ${calendarId}, ${displayName}, true)
            `,
          ),
        ]
      : []),
    ...(parsed.data.calendarType === "staff_rosters"
      ? parsed.data.staffNames.map((displayName) => sql`
          INSERT INTO staff_roster_members (id, calendar_id, display_name, access_role, active)
          VALUES (${randomUUID()}, ${calendarId}, ${displayName}, 'staff', true)
        `)
      : []),
    sql`
      INSERT INTO calendar_memberships (
        calendar_id, user_id, participant_id, permission
      )
      VALUES (
        ${calendarId},
        ${user.id},
        ${participantId},
        'owner'
      )
    `,
    sql`
      INSERT INTO audit_log (
        calendar_id, actor_participant_id, action, entity_type, after_state
      )
      VALUES (
        ${calendarId},
        ${participantId},
        'calendar.created',
        'calendar',
        ${JSON.stringify({
          name: parsed.data.calendarName,
          calendarType: parsed.data.calendarType,
          children: parsed.data.children,
          initialStaffCount: parsed.data.calendarType === "staff_rosters" ? parsed.data.staffNames.length : 0,
        })}::jsonb
      )
    `,
  ];

  if (parsed.data.calendarType === "timesheets") {
    // Calendar, organisation, owner membership and profile share one transaction.
    statements.push(sql`SELECT timesheet_create_organisation(${calendarId}::uuid,${user.id}::uuid,
      ${parsed.data.calendarName},${parsed.data.displayName},${user.email},${DEFAULT_CALENDAR_TIMEZONE})`);
  }

  if (normalizedInviteCode && inviteExpiresAt) {
    statements.push(sql`
      INSERT INTO calendar_invites (
        calendar_id,
        code_hash,
        code_hint,
        permission,
        created_by_user_id,
        expires_at
      )
      VALUES (
        ${calendarId},
        ${hashToken(normalizedInviteCode)},
        ${normalizedInviteCode.slice(-4)},
        'editor',
        ${user.id},
        ${inviteExpiresAt}
      )
    `);
  }

  try {
    await sql.transaction(statements);
  } catch {
    return { error: "The calendar could not be created. Please try again." };
  }

  const cookieStore = await cookies();
  cookieStore.set(
    SELECTED_CALENDAR_COOKIE_NAME,
    calendarId,
    calendarCookieOptions(),
  );

  if (inviteCode) {
    cookieStore.set(
      NEW_CALENDAR_INVITE_COOKIE_NAME,
      inviteCode,
      onboardingInviteCookieOptions(),
    );
  }

  if (inviteCode) {
    redirect("/calendar?welcome=created");
  }

  redirect(`${calendarPathForType(parsed.data.calendarType)}?welcome=created`);
}

export async function joinCalendar(
  _previous: CalendarActionState,
  formData: FormData,
): Promise<CalendarActionState> {
  const user = await requireAccount();
  if (!user) return { error: "Log in again to continue." };

  const parsed = z
    .object({
      code: z
        .string()
        .transform(normalizeInviteCode)
        .refine((value) => value.length === 12, "Enter the 12-character calendar code."),
      displayName: z.string().trim().min(1, "Add your name.").max(50),
    })
    .safeParse({
      code: formData.get("code"),
      displayName: formData.get("displayName") || user.name,
    });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the calendar code." };
  }

  let staffInvite: Awaited<ReturnType<typeof acceptStaffRosterInviteCode>> = null;
  try {
    staffInvite = await acceptStaffRosterInviteCode({
      userId: user.id,
      code: parsed.data.code,
    });
  } catch (error) {
    if (error instanceof StaffRosterServiceError) {
      return { error: error.message };
    }
    return { error: "This Staff Roster invitation could not be accepted." };
  }

  if (staffInvite) {
    const cookieStore = await cookies();
    cookieStore.set(
      SELECTED_CALENDAR_COOKIE_NAME,
      staffInvite.calendarId,
      calendarCookieOptions(),
    );
    redirect(calendarPathForType("staff_rosters"));
  }

  const sql = getSql();
  const codeHash = hashToken(parsed.data.code);
  const participantId = randomUUID();

  const inviteRows = (await sql`
    SELECT
      calendar_id,
      permission,
      revoked_at,
      expires_at,
      use_count,
      max_uses,
      calendar.calendar_type
    FROM calendar_invites invite
    JOIN calendars calendar ON calendar.id = invite.calendar_id
    WHERE invite.code_hash = ${codeHash}
    LIMIT 1
  `) as Array<{
    calendar_id: string;
    permission: "owner" | "editor" | "viewer";
    revoked_at: Date | string | null;
    expires_at: Date | string;
    use_count: number;
    max_uses: number;
    calendar_type: CalendarTemplateId;
  }>;

  const invite = inviteRows[0];
  if (!invite) {
    return { error: "We couldn’t find that invitation. Check the code and try again." };
  }

  const existingMembership = await sql`
    SELECT 1
    FROM calendar_memberships
    WHERE calendar_id = ${invite.calendar_id}
      AND user_id = ${user.id}
    LIMIT 1
  `;

  if (existingMembership.length > 0) {
    const cookieStore = await cookies();
    cookieStore.set(
      SELECTED_CALENDAR_COOKIE_NAME,
      invite.calendar_id,
      calendarCookieOptions(),
    );
    redirect(calendarPathForType(invite.calendar_type));
  }

  if (invite.revoked_at) {
    return { error: "This invitation is no longer active. Ask the calendar owner for a new code." };
  }

  if (new Date(invite.expires_at).getTime() <= Date.now()) {
    return { error: "This invitation has expired. Ask the calendar owner for a new code." };
  }

  if (invite.use_count >= invite.max_uses) {
    return { error: "This invitation has already been used. Ask the calendar owner for a new code." };
  }

  if (invite.permission !== "editor" && invite.permission !== "viewer") {
    return { error: "This invitation can’t be used to join the calendar." };
  }

  if (invite.calendar_type === "salon_bookings") {
    let joinedCalendarId: string | undefined;
    try { joinedCalendarId = await redeemSalonInvitation(codeHash, user.id); }
    catch { return { error: "This salon invitation could not be used. Ask the owner or manager for a new code." }; }
    if (!joinedCalendarId) return { error: "This salon invitation is no longer available." };
    const cookieStore = await cookies();
    cookieStore.set(SELECTED_CALENDAR_COOKIE_NAME, joinedCalendarId, calendarCookieOptions());
    redirect(calendarPathForType("salon_bookings"));
  }
  if (usesMemberInvitations(invite.calendar_type)) {
    let joinedCalendarId: string | undefined;
    try { joinedCalendarId = await redeemMemberInvitation(codeHash, user.id); }
    catch { return { error: "This invitation could not be used. Ask the organiser for a new code." }; }
    if (!joinedCalendarId) return { error: "This invitation is no longer available. Ask the organiser for a new code." };
    const cookieStore = await cookies();
    cookieStore.set(SELECTED_CALENDAR_COOKIE_NAME, joinedCalendarId, calendarCookieOptions());
    redirect(calendarPathForType(invite.calendar_type));
  }
  if (invite.calendar_type !== "co_parenting") {
    return { error: "Ask the roster owner for a Staff Roster invitation." };
  }

  let rows: Array<{ calendar_id: string }>;

  try {
    rows = (await sql`
      WITH eligible AS (
        SELECT invite.*
        FROM calendar_invites invite
        WHERE invite.code_hash = ${codeHash}
          AND invite.revoked_at IS NULL
          AND invite.expires_at > now()
          AND invite.use_count < invite.max_uses
          AND invite.permission IN ('editor', 'viewer')
          AND NOT EXISTS (
            SELECT 1 FROM calendar_memberships membership
            WHERE membership.calendar_id = invite.calendar_id
              AND membership.user_id = ${user.id}
          )
          AND (
            invite.permission = 'viewer'
            OR EXISTS (
              SELECT 1
              FROM participants participant
              WHERE participant.calendar_id = invite.calendar_id
                AND participant.active = true
                AND NOT EXISTS (
                  SELECT 1 FROM calendar_memberships membership
                  WHERE membership.participant_id = participant.id
                )
            )
            OR (
              SELECT count(*) FROM participants participant
              WHERE participant.calendar_id = invite.calendar_id AND participant.active = true
            ) < 2
          )
        FOR UPDATE
      ),
      used AS (
        UPDATE calendar_invites invite
        SET use_count = invite.use_count + 1,
            redeemed_by_user_id = ${user.id},
            redeemed_at = now()
        FROM eligible
        WHERE invite.id = eligible.id
        RETURNING invite.*
      ),
      available_participant AS (
        SELECT participant.id, participant.calendar_id
        FROM participants participant
        JOIN used ON used.calendar_id = participant.calendar_id
        WHERE used.permission = 'editor'
          AND participant.active = true
          AND NOT EXISTS (
            SELECT 1 FROM calendar_memberships membership
            WHERE membership.participant_id = participant.id
          )
        ORDER BY participant.created_at
        LIMIT 1
      ),
      available_profile_slot AS (
        SELECT
          used.calendar_id,
          CASE
            WHEN NOT EXISTS (
              SELECT 1
              FROM participants participant
              WHERE participant.calendar_id = used.calendar_id
                AND participant.profile_slot = 'parent_one'
            )
            THEN 'parent_one'::parent_profile_slot
            ELSE 'parent_two'::parent_profile_slot
          END AS profile_slot
        FROM used
      ),
      new_participant AS (
        INSERT INTO participants (
          id, calendar_id, display_name, role, color_key, profile_slot, active
        )
        SELECT
          ${participantId},
          used.calendar_id,
          ${parsed.data.displayName},
          'parent',
          CASE
            WHEN slot.profile_slot = 'parent_one' THEN 'emerald'
            ELSE 'violet'
          END,
          slot.profile_slot,
          true
        FROM used
        JOIN available_profile_slot slot
          ON slot.calendar_id = used.calendar_id
        WHERE used.permission = 'editor'
          AND NOT EXISTS (SELECT 1 FROM available_participant)
        RETURNING id, calendar_id
      ),
      new_membership AS (
        INSERT INTO calendar_memberships (calendar_id, user_id, participant_id, permission)
        SELECT
          used.calendar_id,
          ${user.id},
          CASE
            WHEN used.permission = 'editor' THEN COALESCE(
              (SELECT id FROM available_participant LIMIT 1),
              (SELECT id FROM new_participant LIMIT 1)
            )
            ELSE NULL
          END,
          used.permission
        FROM used
        RETURNING calendar_id
      )
      SELECT calendar_id FROM new_membership
    `) as Array<{ calendar_id: string }>;
  } catch {
    return { error: "That invitation couldn’t be used. Ask the calendar owner for a new code." };
  }

  const calendarId = rows[0]?.calendar_id;
  if (!calendarId) {
    return {
      error:
        "This invitation can’t be used right now. The calendar may already have two linked parents.",
    };
  }

  const cookieStore = await cookies();
  cookieStore.set(SELECTED_CALENDAR_COOKIE_NAME, calendarId, calendarCookieOptions());
  redirect(calendarPathForType(invite.calendar_type));
}

export async function openCalendar(formData: FormData) {
  const user = await requireAccount();
  if (!user) redirect("/auth/sign-in");

  const calendarId = z.string().uuid().safeParse(formData.get("calendarId"));
  if (!calendarId.success) redirect("/calendar");

  const sql = getSql();
  const rows = (await sql`
    SELECT calendar.calendar_type
    FROM calendar_memberships membership
    JOIN calendars calendar ON calendar.id = membership.calendar_id
    WHERE membership.calendar_id = ${calendarId.data}
      AND membership.user_id = ${user.id}
      AND calendar.archived_at IS NULL
    LIMIT 1
  `) as Array<{ calendar_type: string }>;

  const calendarType = rows[0]?.calendar_type;
  if (!calendarType || !isCalendarTemplateId(calendarType)) {
    redirect("/calendar");
  }

  const cookieStore = await cookies();
  cookieStore.set(
    SELECTED_CALENDAR_COOKIE_NAME,
    calendarId.data,
    calendarCookieOptions(),
  );
  redirect(calendarPathForType(calendarType));
}


export type CalendarLifecycleState = { error: string | null };

async function nextActiveCalendar(userId: string, excludedCalendarId?: string) {
  const sql = getSql();
  const rows = (await sql`
    SELECT calendar.id, calendar.calendar_type
    FROM calendar_memberships membership
    JOIN calendars calendar ON calendar.id = membership.calendar_id
    WHERE membership.user_id = ${userId}
      AND calendar.archived_at IS NULL
      AND (${excludedCalendarId ?? null}::uuid IS NULL OR calendar.id <> ${excludedCalendarId ?? null})
    ORDER BY membership.created_at ASC
    LIMIT 1
  `) as Array<{ id: string; calendar_type: CalendarTemplateId }>;

  return rows[0] ?? null;
}

async function selectFallbackCalendar(
  userId: string,
  excludedCalendarId?: string,
): Promise<never> {
  const fallback = await nextActiveCalendar(userId, excludedCalendarId);
  const cookieStore = await cookies();

  if (!fallback) {
    cookieStore.delete(SELECTED_CALENDAR_COOKIE_NAME);
    redirect("/onboarding");
  }

  cookieStore.set(
    SELECTED_CALENDAR_COOKIE_NAME,
    fallback.id,
    calendarCookieOptions(),
  );
  redirect(calendarPathForType(fallback.calendar_type));
}

export async function archiveCalendar(
  _previous: CalendarLifecycleState,
  formData: FormData,
): Promise<CalendarLifecycleState> {
  const user = await requireAccount();
  if (!user) return { error: "Log in again to continue." };

  const calendarId = z.string().uuid().safeParse(formData.get("calendarId"));
  if (!calendarId.success) return { error: "Choose a valid calendar." };

  const sql = getSql();
  const owned = (await sql`
    SELECT calendar.id, membership.participant_id
    FROM calendars calendar
    JOIN calendar_memberships membership ON membership.calendar_id = calendar.id
    WHERE calendar.id = ${calendarId.data}
      AND membership.user_id = ${user.id}
      AND membership.permission = 'owner'
      AND calendar.archived_at IS NULL
    LIMIT 1
  `) as Array<{ id: string; participant_id: string | null }>;

  if (!owned[0]) {
    return { error: "Only the calendar owner can archive this calendar." };
  }

  try {
    await sql.transaction([
      sql`
        UPDATE calendars
        SET archived_at = now(), updated_at = now()
        WHERE id = ${calendarId.data}
      `,
      sql`
        INSERT INTO audit_log (
          calendar_id, actor_participant_id, action, entity_type, entity_id, after_state
        )
        VALUES (
          ${calendarId.data},
          ${owned[0].participant_id},
          'calendar.archive',
          'calendar',
          ${calendarId.data},
          ${JSON.stringify({ archived: true, actorUserId: user.id })}::jsonb
        )
      `,
    ]);
  } catch {
    return { error: "The calendar could not be archived." };
  }

  return selectFallbackCalendar(user.id, calendarId.data);
}

export async function restoreCalendar(formData: FormData) {
  const user = await requireAccount();
  if (!user) redirect("/auth/sign-in");

  const calendarId = z.string().uuid().safeParse(formData.get("calendarId"));
  if (!calendarId.success) redirect("/onboarding");

  const sql = getSql();
  const rows = (await sql`
    UPDATE calendars calendar
    SET archived_at = NULL, updated_at = now()
    FROM calendar_memberships membership
    WHERE calendar.id = ${calendarId.data}
      AND membership.calendar_id = calendar.id
      AND membership.user_id = ${user.id}
      AND membership.permission = 'owner'
      AND calendar.archived_at IS NOT NULL
    RETURNING calendar.id, calendar.calendar_type
  `) as Array<{ id: string; calendar_type: CalendarTemplateId }>;

  const restored = rows[0];
  if (!restored) redirect("/onboarding");

  const cookieStore = await cookies();
  cookieStore.set(
    SELECTED_CALENDAR_COOKIE_NAME,
    restored.id,
    calendarCookieOptions(),
  );
  redirect(calendarPathForType(restored.calendar_type));
}

export async function deleteCalendar(
  _previous: CalendarLifecycleState,
  formData: FormData,
): Promise<CalendarLifecycleState> {
  const user = await requireAccount();
  if (!user) return { error: "Log in again to continue." };

  const parsed = z
    .object({
      calendarId: z.string().uuid(),
      calendarName: z.string().trim().min(1),
    })
    .safeParse({
      calendarId: formData.get("calendarId"),
      calendarName: formData.get("calendarName"),
    });

  if (!parsed.success) {
    return { error: "Type the calendar name to confirm deletion." };
  }

  const sql = getSql();
  const owned = (await sql`
    SELECT calendar.id, calendar.name, calendar.calendar_type
    FROM calendars calendar
    JOIN calendar_memberships membership ON membership.calendar_id = calendar.id
    WHERE calendar.id = ${parsed.data.calendarId}
      AND membership.user_id = ${user.id}
      AND membership.permission = 'owner'
    LIMIT 1
  `) as Array<{ id: string; name: string; calendar_type: CalendarTemplateId }>;

  const calendar = owned[0];
  if (!calendar) {
    return { error: "Only the calendar owner can delete this calendar." };
  }
  if (calendar.calendar_type === "timesheets") {
    return { error: "Timesheets retain audited work history. Archive this calendar instead." };
  }
  if (parsed.data.calendarName !== calendar.name) {
    return { error: "The calendar name does not match." };
  }

  const fallback = await nextActiveCalendar(user.id, calendar.id);

  try {
    await sql.transaction([
      sql`
        DELETE FROM parenting_schedules
        WHERE calendar_id = ${calendar.id}
      `,
      sql`
        DELETE FROM parenting_assignments
        WHERE calendar_id = ${calendar.id}
      `,
      sql`
        DELETE FROM responsibilities
        WHERE calendar_id = ${calendar.id}
      `,
      sql`
        DELETE FROM expenses
        WHERE calendar_id = ${calendar.id}
      `,
      sql`
        DELETE FROM expense_recurring_series
        WHERE calendar_id = ${calendar.id}
      `,
      sql`
        DELETE FROM staff_roster_timesheet_corrections
        WHERE calendar_id = ${calendar.id}
      `,
      sql`
        DELETE FROM staff_roster_clock_sessions
        WHERE calendar_id = ${calendar.id}
      `,
      sql`
        DELETE FROM staff_roster_updates
        WHERE calendar_id = ${calendar.id}
      `,
      sql`
        DELETE FROM staff_roster_published_shifts
        WHERE publication_id IN (
          SELECT id
          FROM staff_roster_week_publications
          WHERE calendar_id = ${calendar.id}
        )
      `,
      sql`
        DELETE FROM staff_roster_week_publications
        WHERE calendar_id = ${calendar.id}
      `,
      sql`
        DELETE FROM staff_roster_leave_requests
        WHERE calendar_id = ${calendar.id}
      `,
      sql`
        DELETE FROM staff_roster_invites
        WHERE calendar_id = ${calendar.id}
      `,
      sql`
        DELETE FROM staff_roster_shifts
        WHERE calendar_id = ${calendar.id}
      `,
      sql`
        DELETE FROM calendars
        WHERE id = ${calendar.id}
      `,
    ]);
  } catch {
    return {
      error:
        "The calendar could not be deleted. Archive it instead and try again later.",
    };
  }

  const cookieStore = await cookies();
  if (!fallback) {
    cookieStore.delete(SELECTED_CALENDAR_COOKIE_NAME);
    redirect("/onboarding");
  }

  cookieStore.set(
    SELECTED_CALENDAR_COOKIE_NAME,
    fallback.id,
    calendarCookieOptions(),
  );
  redirect(calendarPathForType(fallback.calendar_type));
}
