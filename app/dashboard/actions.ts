"use server";

import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth/server";
import { DEFAULT_CALENDAR_TIMEZONE } from "@/lib/calendar/time";
import { getSql } from "@/lib/db";
import { normalizeInviteCode } from "@/lib/security/invites";
import { SELECTED_CALENDAR_COOKIE_NAME } from "@/lib/security/session";
import { hashToken } from "@/lib/security/tokens";

export type DashboardActionState = { error: string | null };

const calendarSchema = z.object({
  calendarName: z.string().trim().min(1, "Add a calendar name.").max(80),
  displayName: z.string().trim().min(1, "Add your name.").max(50),
  children: z.array(z.string().trim().min(1).max(50)).min(1, "Add at least one child.").max(10),
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

async function requireAccount() {
  const { data: session } = await auth.getSession();
  return session?.user ?? null;
}

export async function createCalendar(
  _previous: DashboardActionState,
  formData: FormData,
): Promise<DashboardActionState> {
  const user = await requireAccount();
  if (!user) return { error: "Log in again to continue." };

  const parsed = calendarSchema.safeParse({
    calendarName: formData.get("calendarName"),
    displayName: formData.get("displayName"),
    children: String(formData.get("children") ?? "")
      .split("\n")
      .map((name) => name.trim())
      .filter(Boolean),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the calendar details." };
  }

  const calendarId = randomUUID();
  const participantId = randomUUID();
  const sql = getSql();
  const childStatements = parsed.data.children.map(
    (displayName) => sql`
      INSERT INTO children (id, calendar_id, display_name, active)
      VALUES (${randomUUID()}, ${calendarId}, ${displayName}, true)
    `,
  );

  try {
    await sql.transaction([
      sql`
        INSERT INTO calendars (id, name, timezone, share_enabled)
        VALUES (${calendarId}, ${parsed.data.calendarName}, ${DEFAULT_CALENDAR_TIMEZONE}, false)
      `,
      sql`
        INSERT INTO participants (id, calendar_id, display_name, role, color_key, active)
        VALUES (${participantId}, ${calendarId}, ${parsed.data.displayName}, 'parent', 'emerald', true)
      `,
      ...childStatements,
      sql`
        INSERT INTO calendar_memberships (calendar_id, user_id, participant_id, permission)
        VALUES (${calendarId}, ${user.id}, ${participantId}, 'owner')
      `,
      sql`
        INSERT INTO audit_log (calendar_id, actor_participant_id, action, entity_type, after_state)
        VALUES (
          ${calendarId},
          ${participantId},
          'calendar.created',
          'calendar',
          ${JSON.stringify({ name: parsed.data.calendarName, children: parsed.data.children })}::jsonb
        )
      `,
    ]);
  } catch {
    return { error: "The calendar could not be created. Please try again." };
  }

  const cookieStore = await cookies();
  cookieStore.set(SELECTED_CALENDAR_COOKIE_NAME, calendarId, calendarCookieOptions());
  redirect("/home");
}

export async function joinCalendar(
  _previous: DashboardActionState,
  formData: FormData,
): Promise<DashboardActionState> {
  const user = await requireAccount();
  if (!user) return { error: "Log in again to continue." };

  const parsed = z
    .object({
      code: z.string().transform(normalizeInviteCode).refine((value) => value.length === 12, "Enter the 12-character calendar code."),
      displayName: z.string().trim().min(1, "Add your name.").max(50),
    })
    .safeParse({ code: formData.get("code"), displayName: formData.get("displayName") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the calendar code." };
  }

  const sql = getSql();
  const codeHash = hashToken(parsed.data.code);
  const participantId = randomUUID();
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
      new_participant AS (
        INSERT INTO participants (id, calendar_id, display_name, role, color_key, active)
        SELECT ${participantId}, used.calendar_id, ${parsed.data.displayName}, 'parent', 'violet', true
        FROM used
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
    return { error: "That code could not be used. Ask the calendar owner for a new one." };
  }

  const calendarId = rows[0]?.calendar_id;
  if (!calendarId) {
    return { error: "That code is invalid, expired, already used, or there is no available parent profile." };
  }

  const cookieStore = await cookies();
  cookieStore.set(SELECTED_CALENDAR_COOKIE_NAME, calendarId, calendarCookieOptions());
  redirect("/home");
}

export async function openCalendar(formData: FormData) {
  const user = await requireAccount();
  if (!user) redirect("/auth/sign-in");

  const calendarId = z.string().uuid().safeParse(formData.get("calendarId"));
  if (!calendarId.success) redirect("/dashboard");

  const sql = getSql();
  const rows = await sql`
    SELECT 1 FROM calendar_memberships
    WHERE calendar_id = ${calendarId.data} AND user_id = ${user.id}
    LIMIT 1
  `;
  if (rows.length === 0) redirect("/dashboard");

  const cookieStore = await cookies();
  cookieStore.set(SELECTED_CALENDAR_COOKIE_NAME, calendarId.data, calendarCookieOptions());
  redirect("/home");
}

export async function signOut() {
  await auth.signOut();
  const cookieStore = await cookies();
  cookieStore.delete(SELECTED_CALENDAR_COOKIE_NAME);
  redirect("/");
}
