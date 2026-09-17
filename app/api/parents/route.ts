import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { after, NextResponse } from "next/server";
import { z } from "zod";
import { getDb, getSql } from "@/lib/db";
import { calendarMemberships, participants } from "@/lib/db/schema";
import { buildCalendarSyncJobStatement } from "@/lib/google-calendar/outbox";
import { processDueGoogleSyncJobs } from "@/lib/google-calendar/queue";
import { isSameOriginMutation } from "@/lib/security/request";
import { getOwnerSession } from "@/lib/security/session";

const parentSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, "Add the parent's name.")
    .max(50, "Keep the parent's name under 50 characters."),
});

export async function GET() {
  const session = await getOwnerSession();
  if (!session) {
    return NextResponse.json({ error: "Calendar owner access is required." }, { status: 403 });
  }

  const db = getDb();
  const rows = await db
    .select({
      id: participants.id,
      displayName: participants.displayName,
      colorKey: participants.colorKey,
      membershipId: calendarMemberships.id,
    })
    .from(participants)
    .leftJoin(calendarMemberships, eq(calendarMemberships.participantId, participants.id))
    .where(and(eq(participants.calendarId, session.calendarId), eq(participants.active, true)))
    .orderBy(asc(participants.createdAt));

  return NextResponse.json({
    parents: rows.map((row) => ({
      id: row.id,
      displayName: row.displayName,
      colorKey: row.colorKey,
      hasAccount: Boolean(row.membershipId),
    })),
  });
}

export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ error: "This request was blocked for safety." }, { status: 403 });
  }

  const session = await getOwnerSession();
  if (!session) {
    return NextResponse.json({ error: "Calendar owner access is required." }, { status: 403 });
  }

  const parsed = parentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Choose a valid parent name." },
      { status: 400 },
    );
  }

  const db = getDb();
  const existing = await db
    .select({
      id: participants.id,
      displayName: participants.displayName,
      colorKey: participants.colorKey,
    })
    .from(participants)
    .where(and(eq(participants.calendarId, session.calendarId), eq(participants.active, true)))
    .orderBy(asc(participants.createdAt));

  if (existing.length >= 2) {
    return NextResponse.json(
      { error: "This calendar already has two parent profiles." },
      { status: 409 },
    );
  }

  const normalizedName = parsed.data.displayName.toLocaleLowerCase("en-NZ");
  if (existing.some((parent) => parent.displayName.toLocaleLowerCase("en-NZ") === normalizedName)) {
    return NextResponse.json(
      { error: "Use a different display name for each parent." },
      { status: 400 },
    );
  }

  const id = randomUUID();
  const colorKey = existing.some((parent) => parent.colorKey === "violet") ? "emerald" : "violet";
  const sql = getSql();
  const afterState = JSON.stringify({
    id,
    displayName: parsed.data.displayName,
    colorKey,
    accountLinked: false,
  });

  try {
    await sql.transaction([
      sql`
        INSERT INTO participants (id, calendar_id, display_name, role, color_key, active)
        VALUES (${id}, ${session.calendarId}, ${parsed.data.displayName}, 'parent', ${colorKey}, true)
      `,
      sql`
        INSERT INTO audit_log (
          calendar_id,
          actor_participant_id,
          action,
          entity_type,
          entity_id,
          after_state
        )
        VALUES (
          ${session.calendarId},
          ${session.participantId ?? null},
          'parent_profile.create',
          'parent_profile',
          ${id},
          ${afterState}::jsonb
        )
      `,
      buildCalendarSyncJobStatement(sql, {
        calendarId: session.calendarId,
        jobType: "full",
      }),
    ]);
  } catch {
    return NextResponse.json(
      { error: "The parent profile could not be added. Refresh and try again." },
      { status: 409 },
    );
  }

  after(async () => {
    try {
      await processDueGoogleSyncJobs({ calendarId: session.calendarId, limit: 8 });
    } catch {}
  });
  return NextResponse.json({
    ok: true,
    parent: {
      id,
      displayName: parsed.data.displayName,
      colorKey,
      hasAccount: false,
    },
  });
}
