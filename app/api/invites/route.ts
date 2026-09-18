import { randomUUID } from "node:crypto";
import { and, desc, eq, gt, isNull, lt } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, getSql } from "@/lib/db";
import { calendarInvites, calendarMemberships, participants } from "@/lib/db/schema";
import { defaultParentColorKey, type ParentProfileSlot } from "@/lib/parents/identity";
import { generateInviteCode, normalizeInviteCode } from "@/lib/security/invites";
import { isSameOriginMutation } from "@/lib/security/request";
import { getOwnerSession } from "@/lib/security/session";
import { hashToken } from "@/lib/security/tokens";

export async function GET() {
  const session = await getOwnerSession();
  if (!session) return NextResponse.json({ error: "Calendar owner access is required." }, { status: 403 });

  const db = getDb();
  const [inviteRows, membershipRows] = await Promise.all([
    db
      .select({
        id: calendarInvites.id,
        codeHint: calendarInvites.codeHint,
        permission: calendarInvites.permission,
        expiresAt: calendarInvites.expiresAt,
        createdAt: calendarInvites.createdAt,
      })
      .from(calendarInvites)
      .where(
        and(
          eq(calendarInvites.calendarId, session.calendarId),
          isNull(calendarInvites.revokedAt),
          gt(calendarInvites.expiresAt, new Date()),
          lt(calendarInvites.useCount, calendarInvites.maxUses),
        ),
      )
      .orderBy(desc(calendarInvites.createdAt))
      .limit(1),
    db
      .select({
        id: calendarMemberships.id,
        userId: calendarMemberships.userId,
        permission: calendarMemberships.permission,
        displayName: participants.displayName,
      })
      .from(calendarMemberships)
      .leftJoin(participants, eq(calendarMemberships.participantId, participants.id))
      .where(eq(calendarMemberships.calendarId, session.calendarId)),
  ]);

  const sql = getSql();
  const userRows = (
    await Promise.all(
      membershipRows.map(async (membership) => {
        const rows = (await sql`
          SELECT id, name, email
          FROM neon_auth."user"
          WHERE id = ${membership.userId}
          LIMIT 1
        `) as Array<{ id: string; name: string; email: string }>;
        return rows[0] ?? null;
      }),
    )
  ).filter((user): user is { id: string; name: string; email: string } => Boolean(user));
  const users = new Map(userRows.map((user) => [user.id, user]));

  return NextResponse.json({
    activeInvite: inviteRows[0] ?? null,
    members: membershipRows.map((membership) => ({
      ...membership,
      name: membership.displayName ?? users.get(membership.userId)?.name ?? "Calendar member",
      email: users.get(membership.userId)?.email ?? null,
      isCurrentUser: membership.userId === session.userId,
    })),
  });
}

export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ error: "This request was blocked for safety." }, { status: 403 });
  }
  const session = await getOwnerSession();
  if (!session) return NextResponse.json({ error: "Calendar owner access is required." }, { status: 403 });

  const parsed = z
    .object({ permission: z.enum(["editor", "viewer"]) })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose edit or view-only access." }, { status: 400 });

  const code = generateInviteCode();
  const normalizedCode = normalizeInviteCode(code);
  const codeHash = hashToken(normalizedCode);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const sql = getSql();

  await sql.transaction([
    sql`UPDATE calendar_invites SET revoked_at = now() WHERE calendar_id = ${session.calendarId} AND revoked_at IS NULL AND use_count < max_uses`,
    sql`
      INSERT INTO calendar_invites (calendar_id, code_hash, code_hint, permission, created_by_user_id, expires_at)
      VALUES (${session.calendarId}, ${codeHash}, ${normalizedCode.slice(-4)}, ${parsed.data.permission}, ${session.userId}, ${expiresAt})
    `,
  ]);

  return NextResponse.json({ code, permission: parsed.data.permission, expiresAt });
}

export async function DELETE(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ error: "This request was blocked for safety." }, { status: 403 });
  }
  const session = await getOwnerSession();
  if (!session) return NextResponse.json({ error: "Calendar owner access is required." }, { status: 403 });

  const db = getDb();
  await db
    .update(calendarInvites)
    .set({ revokedAt: new Date() })
    .where(and(eq(calendarInvites.calendarId, session.calendarId), isNull(calendarInvites.revokedAt)));
  return NextResponse.json({ ok: true });
}

export async function PATCH(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ error: "This request was blocked for safety." }, { status: 403 });
  }
  const session = await getOwnerSession();
  if (!session) return NextResponse.json({ error: "Calendar owner access is required." }, { status: 403 });

  const parsed = z
    .object({ membershipId: z.string().uuid(), permission: z.enum(["editor", "viewer"]) })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose a valid member permission." }, { status: 400 });

  const db = getDb();
  const targetRows = await db
    .select({
      id: calendarMemberships.id,
      userId: calendarMemberships.userId,
      permission: calendarMemberships.permission,
      participantId: calendarMemberships.participantId,
    })
    .from(calendarMemberships)
    .where(
      and(
        eq(calendarMemberships.id, parsed.data.membershipId),
        eq(calendarMemberships.calendarId, session.calendarId),
      ),
    )
    .limit(1);
  const target = targetRows[0];
  if (!target || target.permission === "owner") {
    return NextResponse.json({ error: "The owner permission cannot be changed here." }, { status: 409 });
  }

  if (parsed.data.permission === "editor" && !target.participantId) {
    const sql = getSql();
    const rows = (await sql`
      SELECT
        (
          SELECT participant.id
          FROM participants participant
          WHERE participant.calendar_id = ${session.calendarId}
            AND participant.active = true
            AND NOT EXISTS (
              SELECT 1 FROM calendar_memberships membership
              WHERE membership.participant_id = participant.id
            )
          ORDER BY participant.created_at
          LIMIT 1
        ) AS available_participant_id,
        (
          SELECT count(*)::int FROM participants
          WHERE calendar_id = ${session.calendarId} AND active = true
        ) AS participant_count,
        (
          SELECT name FROM neon_auth."user"
          WHERE id = ${target.userId}
          LIMIT 1
        ) AS user_name,
        CASE
          WHEN NOT EXISTS (
            SELECT 1
            FROM participants participant
            WHERE participant.calendar_id = ${session.calendarId}
              AND participant.profile_slot = 'parent_one'
          )
          THEN 'parent_one'
          ELSE 'parent_two'
        END AS available_profile_slot
    `) as Array<{
      available_participant_id: string | null;
      participant_count: number;
      user_name: string | null;
      available_profile_slot: ParentProfileSlot;
    }>;

    const availableParticipantId = rows[0]?.available_participant_id ?? null;
    if (availableParticipantId) {
      await db
        .update(calendarMemberships)
        .set({
          participantId: availableParticipantId,
          permission: "editor",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(calendarMemberships.id, target.id),
            eq(calendarMemberships.calendarId, session.calendarId),
          ),
        );
    } else {
      if ((rows[0]?.participant_count ?? 2) >= 2) {
        return NextResponse.json(
          { error: "This calendar already has two linked parent profiles." },
          { status: 409 },
        );
      }

      const participantId = randomUUID();
      const profileSlot = rows[0]?.available_profile_slot ?? "parent_two";
      const colorKey = defaultParentColorKey(profileSlot);
      await sql.transaction([
        sql`
          INSERT INTO participants (
            id, calendar_id, display_name, role, color_key, profile_slot, active
          )
          VALUES (
            ${participantId}, ${session.calendarId}, ${rows[0]?.user_name ?? "Parent"},
            'parent', ${colorKey}, ${profileSlot}::parent_profile_slot, true
          )
        `,
        sql`
          UPDATE calendar_memberships
          SET participant_id = ${participantId}, permission = 'editor', updated_at = now()
          WHERE id = ${target.id} AND calendar_id = ${session.calendarId} AND permission <> 'owner'
        `,
      ]);
    }
  } else {
    await db
      .update(calendarMemberships)
      .set({ permission: parsed.data.permission, updatedAt: new Date() })
      .where(
        and(
          eq(calendarMemberships.id, target.id),
          eq(calendarMemberships.calendarId, session.calendarId),
        ),
      );
  }

  return NextResponse.json({ ok: true });
}
