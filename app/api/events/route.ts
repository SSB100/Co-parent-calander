import { randomUUID } from "node:crypto";
import { differenceInCalendarDays, parseISO } from "date-fns";
import { and, asc, eq, gte, isNotNull, lte, or } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { after, NextResponse } from "next/server";
import { z } from "zod";
import { getDb, getSql } from "@/lib/db";
import { events } from "@/lib/db/schema";
import { buildCalendarSyncJobStatement, expandGoogleSyncRange } from "@/lib/google-calendar/outbox";
import { processDueGoogleSyncJobs } from "@/lib/google-calendar/queue";
import { isSameOriginMutation } from "@/lib/security/request";
import { getCalendarSession, getEditorSession } from "@/lib/security/session";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => !Number.isNaN(parseISO(value).getTime()), "Choose a valid date.");
const category = z.enum(["school", "sport", "medical", "birthday", "holiday", "activity", "other"]);
const eventFields = z.object({
  title: z.string().trim().min(1, "Add an event title.").max(80, "Keep the title under 80 characters."),
  description: z.string().trim().max(500, "Keep the event note under 500 characters.").nullable().transform((value) => (value ? value : null)),
  category,
  startDate: isoDate,
  endDate: isoDate.nullable(),
}).superRefine((value, context) => {
  const endDate = value.endDate ?? value.startDate;
  if (endDate < value.startDate) {
    context.addIssue({ code: "custom", message: "The event end date cannot be before the start date." });
    return;
  }
  if (differenceInCalendarDays(parseISO(endDate), parseISO(value.startDate)) > 31) {
    context.addIssue({ code: "custom", message: "Events can span up to 32 days." });
  }
});
const editSchema = eventFields.extend({ id: z.string().uuid() });
const deleteSchema = z.object({ id: z.string().uuid() });

function localDate(timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export async function GET(request: NextRequest) {
  const session = await getCalendarSession();
  if (!session) return NextResponse.json({ error: "Calendar access is required." }, { status: 401 });

  const requestedDate = request.nextUrl.searchParams.get("date");
  const parsedDate = requestedDate ? isoDate.safeParse(requestedDate) : null;
  if (requestedDate && !parsedDate?.success) {
    return NextResponse.json({ error: "Choose a valid event date." }, { status: 400 });
  }

  const targetDate = parsedDate?.success ? parsedDate.data : null;
  const today = localDate("Pacific/Auckland");
  const dateCondition = targetDate
    ? or(
        eq(events.startDate, targetDate),
        and(lte(events.startDate, targetDate), isNotNull(events.endDate), gte(events.endDate, targetDate)),
      )
    : or(gte(events.startDate, today), and(isNotNull(events.endDate), gte(events.endDate, today)));

  const rows = await getDb()
    .select({ id: events.id, title: events.title, description: events.description, category: events.category, startDate: events.startDate, endDate: events.endDate })
    .from(events)
    .where(and(eq(events.calendarId, session.calendarId), dateCondition))
    .orderBy(asc(events.startDate))
    .limit(targetDate ? 20 : 30);

  return NextResponse.json({ events: rows });
}

export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: "This request was blocked for safety." }, { status: 403 });
  const session = await getEditorSession();
  if (!session) return NextResponse.json({ error: "Editor access is required." }, { status: 401 });
  const parsed = eventFields.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Choose valid event details." }, { status: 400 });

  const id = randomUUID();
  const data = parsed.data;
  const afterState = JSON.stringify({ id, ...data });
  const sql = getSql();
  const syncRange = expandGoogleSyncRange(data.startDate, data.endDate ?? data.startDate);
  try {
    await sql.transaction([
      sql`INSERT INTO events (id, calendar_id, start_date, end_date, title, description, category, created_by, updated_at) VALUES (${id}, ${session.calendarId}, ${data.startDate}, ${data.endDate}, ${data.title}, ${data.description}, ${data.category}, ${session.participantId}, now())`,
      sql`INSERT INTO audit_log (calendar_id, actor_participant_id, action, entity_type, entity_id, after_state) VALUES (${session.calendarId}, ${session.participantId}, 'event.create', 'event', ${id}, ${afterState}::jsonb)`,
      buildCalendarSyncJobStatement(sql, {
        calendarId: session.calendarId,
        rangeStart: syncRange.from,
        rangeEnd: syncRange.to,
      }),
    ]);
  } catch {
    return NextResponse.json({ error: "The event could not be saved." }, { status: 409 });
  }
  after(async () => {
    try {
      await processDueGoogleSyncJobs({ calendarId: session.calendarId, limit: 8 });
    } catch {}
  });
  return NextResponse.json({ ok: true, id });
}

export async function PATCH(request: NextRequest) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: "This request was blocked for safety." }, { status: 403 });
  const session = await getEditorSession();
  if (!session) return NextResponse.json({ error: "Editor access is required." }, { status: 401 });
  const parsed = editSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Choose valid event details." }, { status: 400 });

  const db = getDb();
  const existing = await db.select({ id: events.id, title: events.title, description: events.description, category: events.category, startDate: events.startDate, endDate: events.endDate }).from(events).where(and(eq(events.id, parsed.data.id), eq(events.calendarId, session.calendarId))).limit(1);
  if (!existing[0]) return NextResponse.json({ error: "Event not found." }, { status: 404 });

  const { id, ...data } = parsed.data;
  const beforeState = JSON.stringify(existing[0]);
  const afterState = JSON.stringify({ id, ...data });
  const sql = getSql();
  const oldEnd = existing[0].endDate ?? existing[0].startDate;
  const newEnd = data.endDate ?? data.startDate;
  const syncRange = expandGoogleSyncRange(
    [existing[0].startDate, data.startDate].sort()[0],
    [oldEnd, newEnd].sort().at(-1)!,
  );
  try {
    await sql.transaction([
      sql`UPDATE events SET start_date = ${data.startDate}, end_date = ${data.endDate}, title = ${data.title}, description = ${data.description}, category = ${data.category}, updated_at = now() WHERE id = ${id} AND calendar_id = ${session.calendarId}`,
      sql`INSERT INTO audit_log (calendar_id, actor_participant_id, action, entity_type, entity_id, before_state, after_state) VALUES (${session.calendarId}, ${session.participantId}, 'event.update', 'event', ${id}, ${beforeState}::jsonb, ${afterState}::jsonb)`,
      buildCalendarSyncJobStatement(sql, {
        calendarId: session.calendarId,
        rangeStart: syncRange.from,
        rangeEnd: syncRange.to,
      }),
    ]);
  } catch {
    return NextResponse.json({ error: "The event could not be updated." }, { status: 409 });
  }
  after(async () => {
    try {
      await processDueGoogleSyncJobs({ calendarId: session.calendarId, limit: 8 });
    } catch {}
  });
  return NextResponse.json({ ok: true, id });
}

export async function DELETE(request: NextRequest) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: "This request was blocked for safety." }, { status: 403 });
  const session = await getEditorSession();
  if (!session) return NextResponse.json({ error: "Editor access is required." }, { status: 401 });
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose a valid event." }, { status: 400 });

  const db = getDb();
  const existing = await db.select({ id: events.id, title: events.title, description: events.description, category: events.category, startDate: events.startDate, endDate: events.endDate }).from(events).where(and(eq(events.id, parsed.data.id), eq(events.calendarId, session.calendarId))).limit(1);
  if (!existing[0]) return NextResponse.json({ error: "Event not found." }, { status: 404 });

  const beforeState = JSON.stringify(existing[0]);
  const sql = getSql();
  const syncRange = expandGoogleSyncRange(
    existing[0].startDate,
    existing[0].endDate ?? existing[0].startDate,
  );
  try {
    await sql.transaction([
      sql`DELETE FROM events WHERE id = ${parsed.data.id} AND calendar_id = ${session.calendarId}`,
      sql`INSERT INTO audit_log (calendar_id, actor_participant_id, action, entity_type, entity_id, before_state) VALUES (${session.calendarId}, ${session.participantId}, 'event.delete', 'event', ${parsed.data.id}, ${beforeState}::jsonb)`,
      buildCalendarSyncJobStatement(sql, {
        calendarId: session.calendarId,
        rangeStart: syncRange.from,
        rangeEnd: syncRange.to,
      }),
    ]);
  } catch {
    return NextResponse.json({ error: "The event could not be deleted." }, { status: 409 });
  }
  after(async () => {
    try {
      await processDueGoogleSyncJobs({ calendarId: session.calendarId, limit: 8 });
    } catch {}
  });
  return NextResponse.json({ ok: true });
}
