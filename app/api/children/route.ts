import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { children } from "@/lib/db/schema";
import { getCalendarSession } from "@/lib/security/session";

export async function GET() {
  const session = await getCalendarSession();
  if (!session) {
    return NextResponse.json({ error: "Calendar access is required." }, { status: 401 });
  }

  const rows = await getDb()
    .select({
      id: children.id,
      displayName: children.displayName,
      fullName: children.fullName,
      dateOfBirth: children.dateOfBirth,
      schoolName: children.schoolName,
      yearClass: children.yearClass,
      updatedAt: children.updatedAt,
    })
    .from(children)
    .where(and(eq(children.calendarId, session.calendarId), eq(children.active, true)))
    .orderBy(asc(children.createdAt));

  return NextResponse.json({
    permission: session.permission,
    children: rows,
  });
}
