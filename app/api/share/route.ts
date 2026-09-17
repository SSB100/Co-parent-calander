import { and, desc, eq, isNull } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getDb, getSql } from "@/lib/db";
import { accessTokens, calendars } from "@/lib/db/schema";
import { isSameOriginMutation } from "@/lib/security/request";
import { getEditorSession } from "@/lib/security/session";
import { generateSecureToken, hashToken } from "@/lib/security/tokens";

export async function GET() {
  const session = await getEditorSession();
  if (!session) {
    return NextResponse.json({ error: "Editor access is required." }, { status: 401 });
  }

  const db = getDb();
  const rows = await db
    .select({
      shareEnabled: calendars.shareEnabled,
      tokenCreatedAt: accessTokens.createdAt,
      lastUsedAt: accessTokens.lastUsedAt,
    })
    .from(calendars)
    .leftJoin(
      accessTokens,
      and(
        eq(accessTokens.calendarId, calendars.id),
        eq(accessTokens.type, "viewer"),
        isNull(accessTokens.revokedAt),
      ),
    )
    .where(eq(calendars.id, session.calendarId))
    .orderBy(desc(accessTokens.createdAt))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return NextResponse.json({ error: "Calendar not found." }, { status: 404 });
  }

  return NextResponse.json({
    enabled: row.shareEnabled && Boolean(row.tokenCreatedAt),
    lastUsedAt: row.lastUsedAt,
    tokenCreatedAt: row.tokenCreatedAt,
  });
}

export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ error: "This request was blocked for safety." }, { status: 403 });
  }

  const session = await getEditorSession();
  if (!session) {
    return NextResponse.json({ error: "Editor access is required." }, { status: 401 });
  }

  const token = generateSecureToken();
  const tokenHash = hashToken(token);
  const sql = getSql();

  await sql.transaction([
    sql`
      UPDATE access_tokens
      SET revoked_at = now()
      WHERE calendar_id = ${session.calendarId}
        AND type = 'viewer'
        AND revoked_at IS NULL
    `,
    sql`
      INSERT INTO access_tokens (calendar_id, type, token_hash)
      VALUES (${session.calendarId}, 'viewer', ${tokenHash})
    `,
    sql`
      UPDATE calendars
      SET share_enabled = true, updated_at = now()
      WHERE id = ${session.calendarId}
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
        'share.viewer_link_generated',
        'calendar',
        ${JSON.stringify({ shareEnabled: true })}::jsonb
      )
    `,
  ]);

  return NextResponse.json({
    enabled: true,
    viewerUrl: `${request.nextUrl.origin}/share/${token}`,
  });
}

export async function DELETE(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ error: "This request was blocked for safety." }, { status: 403 });
  }

  const session = await getEditorSession();
  if (!session) {
    return NextResponse.json({ error: "Editor access is required." }, { status: 401 });
  }

  const sql = getSql();
  await sql.transaction([
    sql`
      UPDATE access_tokens
      SET revoked_at = now()
      WHERE calendar_id = ${session.calendarId}
        AND type = 'viewer'
        AND revoked_at IS NULL
    `,
    sql`
      UPDATE calendars
      SET share_enabled = false, updated_at = now()
      WHERE id = ${session.calendarId}
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
        'share.viewer_link_revoked',
        'calendar',
        ${JSON.stringify({ shareEnabled: false })}::jsonb
      )
    `,
  ]);

  return NextResponse.json({ enabled: false });
}
