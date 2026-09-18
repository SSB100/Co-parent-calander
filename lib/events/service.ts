import { randomUUID } from "node:crypto";
import { and, asc, eq, gte, isNotNull, isNull, lte, ne, or } from "drizzle-orm";
import {
  ApprovalEngineError,
  createApprovalProposal,
} from "@/lib/approvals/engine";
import {
  approvalActorFromSession,
  sharedApprovalTargetForSession,
} from "@/lib/approvals/http";
import type { CalendarApprovalPermission } from "@/lib/approvals/types";
import { localDateInTimeZone } from "@/lib/calendar/time";
import { getDb, getSql } from "@/lib/db";
import { events } from "@/lib/db/schema";
import type { EventDetails } from "@/lib/events/model";
import { expandEventOccurrences } from "@/lib/events/recurrence";
import { kickGoogleCalendarSync } from "@/lib/google-calendar/dispatch";
import {
  buildCalendarSyncJobStatement,
  expandGoogleSyncRange,
} from "@/lib/google-calendar/outbox";

export type EventServiceSession = {
  calendarId: string;
  calendarTimezone: string;
  membershipId: string;
  participantId: string;
  permission: CalendarApprovalPermission;
};

export class EventServiceError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "EventServiceError";
  }
}

function eventSelection() {
  return {
    id: events.id,
    title: events.title,
    description: events.description,
    category: events.category,
    startDate: events.startDate,
    endDate: events.endDate,
    recurrence: events.recurrence,
    recurrenceEndDate: events.recurrenceEndDate,
  };
}

async function loadExistingEvent(calendarId: string, eventId: string) {
  const rows = await getDb()
    .select(eventSelection())
    .from(events)
    .where(and(eq(events.id, eventId), eq(events.calendarId, calendarId)))
    .limit(1);

  return rows[0] ?? null;
}

function proposalFailure(error: unknown, fallback: string): never {
  if (error instanceof ApprovalEngineError) {
    throw new EventServiceError(error.statusCode, error.message);
  }
  throw new EventServiceError(409, fallback);
}

export async function listEvents(input: {
  calendarId: string;
  calendarTimezone: string;
  targetDate: string | null;
}) {
  const today = localDateInTimeZone(input.calendarTimezone);
  const referenceDate = input.targetDate ?? today;

  const rows = await getDb()
    .select(eventSelection())
    .from(events)
    .where(
      and(
        eq(events.calendarId, input.calendarId),
        lte(events.startDate, input.targetDate ?? "9999-12-31"),
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
    .limit(input.targetDate ? 100 : 50);

  if (!input.targetDate) return rows;

  return expandEventOccurrences({
    events: rows,
    from: input.targetDate,
    to: input.targetDate,
  });
}

export async function createEvent(input: {
  session: EventServiceSession;
  details: EventDetails;
  reason: string | null;
}) {
  const { session, details, reason } = input;
  const id = randomUUID();

  try {
    const target = await sharedApprovalTargetForSession(session);
    if (target.required && target.approverMembershipId) {
      const result = await createApprovalProposal({
        calendarId: session.calendarId,
        actor: approvalActorFromSession(session),
        entityType: "shared_event",
        entityId: id,
        action: "create",
        previousState: null,
        proposedState: {
          kind: "shared_event" as const,
          event: { id, ...details },
        },
        reason,
        approverMembershipId: target.approverMembershipId,
      });

      return {
        ok: true as const,
        pending: true as const,
        proposalId: result?.proposal.id ?? null,
        approverName: result?.proposal.approverName ?? target.approverName,
      };
    }
  } catch (error) {
    proposalFailure(error, "The event proposal could not be saved.");
  }

  const sql = getSql();
  const syncRange = expandGoogleSyncRange(
    details.startDate,
    details.endDate ?? details.startDate,
  );

  try {
    await sql.transaction([
      sql`
        INSERT INTO events (
          id, calendar_id, start_date, end_date, title, description, category,
          recurrence, recurrence_end_date, created_by, updated_at
        )
        VALUES (
          ${id}, ${session.calendarId}, ${details.startDate}, ${details.endDate},
          ${details.title}, ${details.description}, ${details.category},
          ${details.recurrence}, ${details.recurrenceEndDate},
          ${session.participantId}, now()
        )
      `,
      sql`
        INSERT INTO audit_log (
          calendar_id, actor_participant_id, action, entity_type, entity_id, after_state
        )
        VALUES (
          ${session.calendarId},
          ${session.participantId},
          'event.create',
          'event',
          ${id},
          ${JSON.stringify({ id, ...details })}::jsonb
        )
      `,
      buildCalendarSyncJobStatement(
        sql,
        details.recurrence !== "none"
          ? { calendarId: session.calendarId, jobType: "full" }
          : {
              calendarId: session.calendarId,
              rangeStart: syncRange.from,
              rangeEnd: syncRange.to,
            },
      ),
    ]);
  } catch {
    throw new EventServiceError(409, "The event could not be saved.");
  }

  kickGoogleCalendarSync(session.calendarId);
  return { ok: true as const, pending: false as const, id };
}

export async function updateEvent(input: {
  session: EventServiceSession;
  id: string;
  details: EventDetails;
  reason: string | null;
}) {
  const { session, id, details, reason } = input;
  const existing = await loadExistingEvent(session.calendarId, id);
  if (!existing) throw new EventServiceError(404, "Event not found.");

  try {
    const target = await sharedApprovalTargetForSession(session);
    if (target.required && target.approverMembershipId) {
      const result = await createApprovalProposal({
        calendarId: session.calendarId,
        actor: approvalActorFromSession(session),
        entityType: "shared_event",
        entityId: id,
        action: "edit",
        previousState: { kind: "shared_event", event: existing },
        proposedState: {
          kind: "shared_event",
          event: { id, ...details },
        },
        reason,
        approverMembershipId: target.approverMembershipId,
      });

      return {
        ok: true as const,
        pending: true as const,
        proposalId: result?.proposal.id ?? null,
        approverName: result?.proposal.approverName ?? target.approverName,
      };
    }
  } catch (error) {
    proposalFailure(error, "The event proposal could not be saved.");
  }

  const oldEnd = existing.endDate ?? existing.startDate;
  const newEnd = details.endDate ?? details.startDate;
  const syncRange = expandGoogleSyncRange(
    [existing.startDate, details.startDate].sort()[0],
    [oldEnd, newEnd].sort().at(-1)!,
  );
  const sql = getSql();

  try {
    await sql.transaction([
      sql`
        UPDATE events
        SET
          start_date = ${details.startDate},
          end_date = ${details.endDate},
          title = ${details.title},
          description = ${details.description},
          category = ${details.category},
          recurrence = ${details.recurrence},
          recurrence_end_date = ${details.recurrenceEndDate},
          updated_at = now()
        WHERE id = ${id}
          AND calendar_id = ${session.calendarId}
      `,
      sql`
        INSERT INTO audit_log (
          calendar_id, actor_participant_id, action, entity_type, entity_id,
          before_state, after_state
        )
        VALUES (
          ${session.calendarId},
          ${session.participantId},
          'event.update',
          'event',
          ${id},
          ${JSON.stringify(existing)}::jsonb,
          ${JSON.stringify({ id, ...details })}::jsonb
        )
      `,
      buildCalendarSyncJobStatement(
        sql,
        existing.recurrence !== "none" || details.recurrence !== "none"
          ? { calendarId: session.calendarId, jobType: "full" }
          : {
              calendarId: session.calendarId,
              rangeStart: syncRange.from,
              rangeEnd: syncRange.to,
            },
      ),
    ]);
  } catch {
    throw new EventServiceError(409, "The event could not be updated.");
  }

  kickGoogleCalendarSync(session.calendarId);
  return { ok: true as const, pending: false as const, id };
}

export async function deleteEvent(input: {
  session: EventServiceSession;
  id: string;
  reason: string | null;
}) {
  const { session, id, reason } = input;
  const existing = await loadExistingEvent(session.calendarId, id);
  if (!existing) throw new EventServiceError(404, "Event not found.");

  try {
    const target = await sharedApprovalTargetForSession(session);
    if (target.required && target.approverMembershipId) {
      const result = await createApprovalProposal({
        calendarId: session.calendarId,
        actor: approvalActorFromSession(session),
        entityType: "shared_event",
        entityId: id,
        action: "delete",
        previousState: { kind: "shared_event", event: existing },
        proposedState: { kind: "shared_event", event: null },
        reason,
        approverMembershipId: target.approverMembershipId,
      });

      return {
        ok: true as const,
        pending: true as const,
        proposalId: result?.proposal.id ?? null,
        approverName: result?.proposal.approverName ?? target.approverName,
      };
    }
  } catch (error) {
    proposalFailure(error, "The event proposal could not be saved.");
  }

  const syncRange = expandGoogleSyncRange(
    existing.startDate,
    existing.endDate ?? existing.startDate,
  );
  const sql = getSql();

  try {
    await sql.transaction([
      sql`
        DELETE FROM events
        WHERE id = ${id}
          AND calendar_id = ${session.calendarId}
      `,
      sql`
        INSERT INTO audit_log (
          calendar_id, actor_participant_id, action, entity_type, entity_id, before_state
        )
        VALUES (
          ${session.calendarId},
          ${session.participantId},
          'event.delete',
          'event',
          ${id},
          ${JSON.stringify(existing)}::jsonb
        )
      `,
      buildCalendarSyncJobStatement(
        sql,
        existing.recurrence !== "none"
          ? { calendarId: session.calendarId, jobType: "full" }
          : {
              calendarId: session.calendarId,
              rangeStart: syncRange.from,
              rangeEnd: syncRange.to,
            },
      ),
    ]);
  } catch {
    throw new EventServiceError(409, "The event could not be deleted.");
  }

  kickGoogleCalendarSync(session.calendarId);
  return { ok: true as const, pending: false as const };
}
