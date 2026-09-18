import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSql } from "@/lib/db";
import {
  loadResponsibilitySnapshot,
  nextResponsibilityDueDate,
} from "@/lib/responsibilities/model";
import { isSameOriginMutation } from "@/lib/security/request";
import { getEditorSession } from "@/lib/security/session";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const responsibilityId = z.string().uuid();
const inputSchema = z.object({
  operation: z.enum(["complete", "reopen"]),
});

export async function PATCH(request: NextRequest, context: RouteContext) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ error: "This request was blocked for safety." }, { status: 403 });
  }

  const session = await getEditorSession();
  if (!session) {
    return NextResponse.json({ error: "Editor access is required." }, { status: 401 });
  }

  const params = await context.params;
  const parsedId = responsibilityId.safeParse(params.id);
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsedId.success || !parsed.success) {
    return NextResponse.json({ error: "Choose a valid completion update." }, { status: 400 });
  }

  const existing = await loadResponsibilitySnapshot(session.calendarId, parsedId.data);
  if (!existing) {
    return NextResponse.json({ error: "Responsibility not found." }, { status: 404 });
  }

  if (existing.responsibleParticipantId !== session.participantId) {
    return NextResponse.json(
      { error: "Only the responsible parent can update completion." },
      { status: 403 },
    );
  }

  if (parsed.data.operation === "reopen") {
    if (!existing.completedAt) {
      return NextResponse.json({ ok: true, completed: false });
    }
    if (existing.nextOccurrenceId) {
      return NextResponse.json(
        {
          error:
            "This recurring responsibility has already created its next occurrence and cannot be reopened.",
        },
        { status: 409 },
      );
    }

    const sql = getSql();
    try {
      await sql.transaction([
        sql`
          UPDATE responsibilities
          SET
            completed_at = NULL,
            completed_by_participant_id = NULL,
            updated_at = now()
          WHERE id = ${existing.id}
            AND calendar_id = ${session.calendarId}
            AND completed_by_participant_id = ${session.participantId}
        `,
        sql`
          INSERT INTO audit_log (
            calendar_id, actor_participant_id, action, entity_type, entity_id,
            before_state, after_state
          )
          VALUES (
            ${session.calendarId}, ${session.participantId},
            'responsibility.reopen', 'responsibility', ${existing.id},
            ${JSON.stringify({ completedAt: existing.completedAt })}::jsonb,
            ${JSON.stringify({ completedAt: null })}::jsonb
          )
        `,
      ]);
    } catch {
      return NextResponse.json(
        { error: "The responsibility could not be reopened." },
        { status: 409 },
      );
    }

    return NextResponse.json({ ok: true, completed: false });
  }

  if (existing.completedAt) {
    return NextResponse.json({
      ok: true,
      completed: true,
      nextOccurrenceId: existing.nextOccurrenceId,
    });
  }

  const nextDueDate = nextResponsibilityDueDate(existing.dueDate, existing.recurrence);
  const shouldGenerateNext =
    Boolean(nextDueDate) &&
    (!existing.recurrenceEndDate || nextDueDate! <= existing.recurrenceEndDate);
  const nextId = shouldGenerateNext ? randomUUID() : null;
  const completedAt = new Date();
  const sql = getSql();

  const statements = [
    sql`
      UPDATE responsibilities
      SET
        completed_at = ${completedAt},
        completed_by_participant_id = ${session.participantId},
        next_occurrence_id = ${nextId},
        updated_at = now()
      WHERE id = ${existing.id}
        AND calendar_id = ${session.calendarId}
        AND responsible_participant_id = ${session.participantId}
        AND completed_at IS NULL
    `,
  ];

  if (nextId && nextDueDate) {
    statements.push(
      sql`
        INSERT INTO responsibilities (
          id, calendar_id, series_id, title, responsible_participant_id,
          due_date, due_time, category, note, recurrence, recurrence_end_date,
          linked_event_id, linked_expense_id, created_by, updated_at
        )
        SELECT
          ${nextId},
          calendar_id,
          series_id,
          title,
          responsible_participant_id,
          ${nextDueDate},
          due_time,
          category,
          note,
          recurrence,
          recurrence_end_date,
          linked_event_id,
          linked_expense_id,
          ${session.participantId},
          now()
        FROM responsibilities
        WHERE id = ${existing.id}
          AND calendar_id = ${session.calendarId}
          AND completed_at = ${completedAt}
          AND next_occurrence_id = ${nextId}
      `,
      sql`
        INSERT INTO responsibility_children (responsibility_id, child_id)
        SELECT ${nextId}, child_id
        FROM responsibility_children
        WHERE responsibility_id = ${existing.id}
          AND EXISTS (
            SELECT 1
            FROM responsibilities next_item
            WHERE next_item.id = ${nextId}
              AND next_item.calendar_id = ${session.calendarId}
          )
      `,
    );
  }

  statements.push(
    sql`
      INSERT INTO audit_log (
        calendar_id, actor_participant_id, action, entity_type, entity_id,
        before_state, after_state
      )
      VALUES (
        ${session.calendarId}, ${session.participantId},
        'responsibility.complete', 'responsibility', ${existing.id},
        ${JSON.stringify({ completedAt: null })}::jsonb,
        ${JSON.stringify({ completedAt, nextOccurrenceId: nextId })}::jsonb
      )
    `,
  );

  try {
    await sql.transaction(statements);
  } catch {
    return NextResponse.json(
      { error: "The responsibility could not be completed." },
      { status: 409 },
    );
  }

  return NextResponse.json({
    ok: true,
    completed: true,
    nextOccurrenceId: nextId,
  });
}
