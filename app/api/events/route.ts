import { randomUUID } from "node:crypto";
import { differenceInCalendarDays, parseISO } from "date-fns";
import { and, asc, eq, gte, isNotNull, isNull, lte, ne, or } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ApprovalEngineError,
  createApprovalProposal,
} from "@/lib/approvals/engine";
import { approvalActorFromSession, proposalReasonSchema, sharedApprovalTargetForSession } from "@/lib/approvals/http";
import { getDb, getSql } from "@/lib/db";
import { expandEventOccurrences } from "@/lib/events/recurrence";
import { events } from "@/lib/db/schema";
import { buildCalendarSyncJobStatement, expandGoogleSyncRange } from "@/lib/google-calendar/outbox";
import { kickGoogleCalendarSync } from "@/lib/google-calendar/dispatch";
import { localDateInTimeZone } from "@/lib/calendar/time";
import { isSameOriginMutation } from "@/lib/security/request";
import { getCalendarSession, getEditorSession } from "@/lib/security/session";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => !Number.isNaN(parseISO(value).getTime()), "Choose a valid date.");
const category = z.enum(["school", "sport", "medical", "birthday", "holiday", "activity", "other"]);
const recurrence = z.enum(["none", "weekly", "fortnightly", "monthly", "yearly"]);
const eventFields = z.object({
  title: z.string().trim().min(1, "Add an event title.").max(80, "Keep the title under 80 characters."),
  description: z.string().trim().max(500, "Keep the event note under 500 characters.").nullable().transform((value) => (value ? value : null)),
  category,
  startDate: isoDate,
  endDate: isoDate.nullable(),
  recurrence: recurrence.default("none"),
  recurrenceEndDate: isoDate.nullable().default(null),
}).superRefine((value, context) => {
  const endDate = value.endDate ?? value.startDate;
  if (endDate < value.startDate) {
    context.addIssue({ code: "custom", message: "The event end date cannot be before the start date." });
    return;
  }
  if (differenceInCalendarDays(parseISO(endDate), parseISO(value.startDate)) > 31) {
    context.addIssue({ code: "custom", message: "Events can span up to 32 days." });
  }
  if (
    value.recurrence !== "none" &&
    value.recurrenceEndDate &&
    value.recurrenceEndDate < value.startDate
  ) {
    context.addIssue({
      code: "custom",
      message: "The repeat-until date cannot be before the first event.",
    });
  }
  if (value.recurrence === "none" && value.recurrenceEndDate) {
    context.addIssue({
      code: "custom",
      message: "Choose a repeat option before setting a repeat-until date.",
    });
  }
});
const createSchema = eventFields.safeExtend({ reason: proposalReasonSchema });
const editSchema = eventFields.safeExtend({ id: z.string().uuid(), reason: proposalReasonSchema });
const deleteSchema = z.object({ id: z.string().uuid(), reason: proposalReasonSchema });


function approvalError(error: unknown, fallback: string) {
  if (error instanceof ApprovalEngineError) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode });
  }
  return NextResponse.json({ error: fallback }, { status: 409 });
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
  const today = localDateInTimeZone(session.calendarTimezone);
  const referenceDate = targetDate ?? today;

  const rows = await getDb()
    .select({
      id: events.id,
      title: events.title,
      description: events.description,
      category: events.category,
      startDate: events.startDate,
      endDate: events.endDate,
      recurrence: events.recurrence,
      recurrenceEndDate: events.recurrenceEndDate,
    })
    .from(events)
    .where(
      and(
        eq(events.calendarId, session.calendarId),
        lte(events.startDate, targetDate ?? "9999-12-31"),
        or(
          and(
            eq(events.recurrence, "none"),
            or(
              gte(events.startDate, referenceDate),
              and(isNotNull(events.endDate), gte(events.endDate, referenceDate)),
            ),
          ),
          and(
            ne(events.recurrence, "none"),
            or(
              isNull(events.recurrenceEndDate),
              gte(events.recurrenceEndDate, referenceDate),
            ),
          ),
        ),
      ),
    )
    .orderBy(asc(events.startDate))
    .limit(targetDate ? 100 : 50);

  if (targetDate) {
    return NextResponse.json({
      events: expandEventOccurrences({
        events: rows,
        from: targetDate,
        to: targetDate,
      }),
    });
  }

  return NextResponse.json({ events: rows });
}

export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: "This request was blocked for safety." }, { status: 403 });
  const session = await getEditorSession();
  if (!session) return NextResponse.json({ error: "Editor access is required." }, { status: 401 });
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Choose valid event details." }, { status: 400 });

  const id = randomUUID();
  const { reason, ...data } = parsed.data;

  try {
    const target = await sharedApprovalTargetForSession(session);

    if (target.required && target.approverMembershipId) {
      const proposedState = { kind: "shared_event" as const, event: { id, ...data } };
      const result = await createApprovalProposal({
        calendarId: session.calendarId,
        actor: approvalActorFromSession(session),
        entityType: "shared_event",
        entityId: id,
        action: "create",
        previousState: null,
        proposedState,
        reason,
        approverMembershipId: target.approverMembershipId,
      });

      return NextResponse.json(
        {
          ok: true,
          pending: true,
          proposalId: result?.proposal.id ?? null,
          approverName: result?.proposal.approverName ?? target.approverName,
        },
        { status: 202 },
      );
    }
  } catch (error) {
    return approvalError(error, "The event proposal could not be saved.");
  }

  const afterState = JSON.stringify({ id, ...data });
  const sql = getSql();
  const syncRange = expandGoogleSyncRange(data.startDate, data.endDate ?? data.startDate);
  try {
    await sql.transaction([
      sql`INSERT INTO events (id, calendar_id, start_date, end_date, title, description, category, recurrence, recurrence_end_date, created_by, updated_at) VALUES (${id}, ${session.calendarId}, ${data.startDate}, ${data.endDate}, ${data.title}, ${data.description}, ${data.category}, ${data.recurrence}, ${data.recurrenceEndDate}, ${session.participantId}, now())`,
      sql`INSERT INTO audit_log (calendar_id, actor_participant_id, action, entity_type, entity_id, after_state) VALUES (${session.calendarId}, ${session.participantId}, 'event.create', 'event', ${id}, ${afterState}::jsonb)`,
      buildCalendarSyncJobStatement(
        sql,
        data.recurrence !== "none"
          ? { calendarId: session.calendarId, jobType: "full" }
          : {
              calendarId: session.calendarId,
              rangeStart: syncRange.from,
              rangeEnd: syncRange.to,
            },
      ),
    ]);
  } catch {
    return NextResponse.json({ error: "The event could not be saved." }, { status: 409 });
  }
  kickGoogleCalendarSync(session.calendarId);
  return NextResponse.json({ ok: true, pending: false, id });
}

export async function PATCH(request: NextRequest) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: "This request was blocked for safety." }, { status: 403 });
  const session = await getEditorSession();
  if (!session) return NextResponse.json({ error: "Editor access is required." }, { status: 401 });
  const parsed = editSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Choose valid event details." }, { status: 400 });

  const db = getDb();
  const existing = await db.select({ id: events.id, title: events.title, description: events.description, category: events.category, startDate: events.startDate, endDate: events.endDate, recurrence: events.recurrence, recurrenceEndDate: events.recurrenceEndDate }).from(events).where(and(eq(events.id, parsed.data.id), eq(events.calendarId, session.calendarId))).limit(1);
  if (!existing[0]) return NextResponse.json({ error: "Event not found." }, { status: 404 });

  const { id, reason, ...data } = parsed.data;

  try {
    const target = await sharedApprovalTargetForSession(session);

    if (target.required && target.approverMembershipId) {
      const result = await createApprovalProposal({
        calendarId: session.calendarId,
        actor: approvalActorFromSession(session),
        entityType: "shared_event",
        entityId: id,
        action: "edit",
        previousState: { kind: "shared_event", event: existing[0] },
        proposedState: { kind: "shared_event", event: { id, ...data } },
        reason,
        approverMembershipId: target.approverMembershipId,
      });

      return NextResponse.json(
        {
          ok: true,
          pending: true,
          proposalId: result?.proposal.id ?? null,
          approverName: result?.proposal.approverName ?? target.approverName,
        },
        { status: 202 },
      );
    }
  } catch (error) {
    return approvalError(error, "The event proposal could not be saved.");
  }

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
      sql`UPDATE events SET start_date = ${data.startDate}, end_date = ${data.endDate}, title = ${data.title}, description = ${data.description}, category = ${data.category}, recurrence = ${data.recurrence}, recurrence_end_date = ${data.recurrenceEndDate}, updated_at = now() WHERE id = ${id} AND calendar_id = ${session.calendarId}`,
      sql`INSERT INTO audit_log (calendar_id, actor_participant_id, action, entity_type, entity_id, before_state, after_state) VALUES (${session.calendarId}, ${session.participantId}, 'event.update', 'event', ${id}, ${beforeState}::jsonb, ${afterState}::jsonb)`,
      buildCalendarSyncJobStatement(
        sql,
        existing[0].recurrence !== "none" || data.recurrence !== "none"
          ? { calendarId: session.calendarId, jobType: "full" }
          : {
              calendarId: session.calendarId,
              rangeStart: syncRange.from,
              rangeEnd: syncRange.to,
            },
      ),
    ]);
  } catch {
    return NextResponse.json({ error: "The event could not be updated." }, { status: 409 });
  }
  kickGoogleCalendarSync(session.calendarId);
  return NextResponse.json({ ok: true, pending: false, id });
}

export async function DELETE(request: NextRequest) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: "This request was blocked for safety." }, { status: 403 });
  const session = await getEditorSession();
  if (!session) return NextResponse.json({ error: "Editor access is required." }, { status: 401 });
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose a valid event." }, { status: 400 });

  const db = getDb();
  const existing = await db.select({ id: events.id, title: events.title, description: events.description, category: events.category, startDate: events.startDate, endDate: events.endDate, recurrence: events.recurrence, recurrenceEndDate: events.recurrenceEndDate }).from(events).where(and(eq(events.id, parsed.data.id), eq(events.calendarId, session.calendarId))).limit(1);
  if (!existing[0]) return NextResponse.json({ error: "Event not found." }, { status: 404 });

  try {
    const target = await sharedApprovalTargetForSession(session);

    if (target.required && target.approverMembershipId) {
      const result = await createApprovalProposal({
        calendarId: session.calendarId,
        actor: approvalActorFromSession(session),
        entityType: "shared_event",
        entityId: parsed.data.id,
        action: "delete",
        previousState: { kind: "shared_event", event: existing[0] },
        proposedState: { kind: "shared_event", event: null },
        reason: parsed.data.reason,
        approverMembershipId: target.approverMembershipId,
      });

      return NextResponse.json(
        {
          ok: true,
          pending: true,
          proposalId: result?.proposal.id ?? null,
          approverName: result?.proposal.approverName ?? target.approverName,
        },
        { status: 202 },
      );
    }
  } catch (error) {
    return approvalError(error, "The event proposal could not be saved.");
  }

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
      buildCalendarSyncJobStatement(
        sql,
        existing[0].recurrence !== "none"
          ? { calendarId: session.calendarId, jobType: "full" }
          : {
              calendarId: session.calendarId,
              rangeStart: syncRange.from,
              rangeEnd: syncRange.to,
            },
      ),
    ]);
  } catch {
    return NextResponse.json({ error: "The event could not be deleted." }, { status: 409 });
  }
  kickGoogleCalendarSync(session.calendarId);
  return NextResponse.json({ ok: true, pending: false });
}
