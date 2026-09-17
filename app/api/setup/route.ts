import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, getSql } from "@/lib/db";
import { participants } from "@/lib/db/schema";
import { isSameOriginMutation } from "@/lib/security/request";
import { getEditorSession } from "@/lib/security/session";
import { generateSecureToken, hashToken } from "@/lib/security/tokens";

const setupSchema = z
  .object({
    calendarName: z.string().trim().min(1).max(80),
    parentOneName: z.string().trim().min(1).max(50),
    parentTwoName: z.string().trim().min(1).max(50),
    children: z.array(z.string().trim().min(1).max(50)).min(1).max(10),
  })
  .refine(
    (value) => value.parentOneName.toLocaleLowerCase() !== value.parentTwoName.toLocaleLowerCase(),
    { message: "Use a different display name for each parent." },
  );

export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ error: "This request was blocked for safety." }, { status: 403 });
  }

  const session = await getEditorSession();
  if (!session) {
    return NextResponse.json({ error: "Open the secure setup link first." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "The setup details could not be read." }, { status: 400 });
  }

  const parsed = setupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Check the setup details and try again." },
      { status: 400 },
    );
  }

  const db = getDb();
  const bootstrapRows = await db
    .select({
      id: participants.id,
      colorKey: participants.colorKey,
    })
    .from(participants)
    .where(
      and(
        eq(participants.id, session.participantId),
        eq(participants.calendarId, session.calendarId),
        eq(participants.active, true),
      ),
    )
    .limit(1);

  if (bootstrapRows[0]?.colorKey !== "setup") {
    return NextResponse.json(
      { error: "This calendar has already been set up." },
      { status: 409 },
    );
  }

  const parentTwoId = randomUUID();
  const childRows = parsed.data.children.map((displayName) => ({
    id: randomUUID(),
    displayName,
  }));
  const parentOneToken = generateSecureToken();
  const parentTwoToken = generateSecureToken();
  const parentOneHash = hashToken(parentOneToken);
  const parentTwoHash = hashToken(parentTwoToken);
  const sql = getSql();

  const statements = [
    sql`
      UPDATE calendars
      SET name = ${parsed.data.calendarName}, updated_at = now()
      WHERE id = ${session.calendarId}
    `,
    sql`
      UPDATE participants
      SET display_name = ${parsed.data.parentOneName}, color_key = 'emerald', updated_at = now()
      WHERE id = ${session.participantId}
        AND calendar_id = ${session.calendarId}
    `,
    sql`
      INSERT INTO participants (id, calendar_id, display_name, role, color_key, active)
      VALUES (${parentTwoId}, ${session.calendarId}, ${parsed.data.parentTwoName}, 'parent', 'violet', true)
    `,
    ...childRows.map(
      (child) => sql`
        INSERT INTO children (id, calendar_id, display_name, active)
        VALUES (${child.id}, ${session.calendarId}, ${child.displayName}, true)
      `,
    ),
    sql`
      UPDATE access_tokens
      SET revoked_at = now()
      WHERE calendar_id = ${session.calendarId}
        AND participant_id = ${session.participantId}
        AND type = 'editor'
        AND revoked_at IS NULL
    `,
    sql`
      INSERT INTO access_tokens (calendar_id, participant_id, type, token_hash)
      VALUES (${session.calendarId}, ${session.participantId}, 'editor', ${parentOneHash})
    `,
    sql`
      INSERT INTO access_tokens (calendar_id, participant_id, type, token_hash)
      VALUES (${session.calendarId}, ${parentTwoId}, 'editor', ${parentTwoHash})
    `,
    sql`
      INSERT INTO audit_log (
        calendar_id,
        actor_participant_id,
        action,
        entity_type,
        after_state
      )
      VALUES (
        ${session.calendarId},
        ${session.participantId},
        'calendar.setup_completed',
        'calendar',
        ${JSON.stringify({
          calendarName: parsed.data.calendarName,
          parentOneName: parsed.data.parentOneName,
          parentTwoName: parsed.data.parentTwoName,
          children: parsed.data.children,
        })}::jsonb
      )
    `,
  ];

  try {
    await sql.transaction(statements);
  } catch {
    return NextResponse.json(
      { error: "Setup could not be completed. Please try again." },
      { status: 409 },
    );
  }

  const baseUrl = request.nextUrl.origin;
  return NextResponse.json({
    ok: true,
    calendarName: parsed.data.calendarName,
    parentOne: {
      name: parsed.data.parentOneName,
      editorUrl: `${baseUrl}/access/editor/${parentOneToken}`,
    },
    parentTwo: {
      name: parsed.data.parentTwoName,
      editorUrl: `${baseUrl}/access/editor/${parentTwoToken}`,
    },
  });
}
