import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { auditLog, participants } from "@/lib/db/schema";
import { getEditorSession } from "@/lib/security/session";

export async function GET() {
  const session = await getEditorSession();
  if (!session) {
    return NextResponse.json({ error: "Editor access is required." }, { status: 401 });
  }

  const db = getDb();
  const rows = await db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      entityType: auditLog.entityType,
      entityId: auditLog.entityId,
      occurredAt: auditLog.occurredAt,
      actorName: participants.displayName,
    })
    .from(auditLog)
    .leftJoin(participants, eq(auditLog.actorParticipantId, participants.id))
    .where(eq(auditLog.calendarId, session.calendarId))
    .orderBy(desc(auditLog.occurredAt))
    .limit(40);

  return NextResponse.json({ activity: rows });
}
