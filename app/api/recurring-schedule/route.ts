import { randomUUID } from "node:crypto";
import { parseISO } from "date-fns";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, getSql } from "@/lib/db";
import { children, participants, recurringRules } from "@/lib/db/schema";
import {
  buildFortnightRuleText,
  dateForSlot,
  FORTNIGHT_SLOTS,
  normalizeAnchorDate,
  parseFortnightRuleText,
} from "@/lib/recurrence/fortnight";
import { isSameOriginMutation } from "@/lib/security/request";
import { getEditorSession } from "@/lib/security/session";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => !Number.isNaN(parseISO(value).getTime()), "Choose a valid date.");

const scheduleSchema = z
  .object({
    anchorDate: isoDate,
    endDate: isoDate.nullable(),
    pattern: z.array(z.string().uuid().nullable()).length(FORTNIGHT_SLOTS),
  })
  .superRefine((value, context) => {
    if (value.endDate && value.endDate < value.anchorDate) {
      context.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "The repeating schedule end date cannot be before its start date.",
      });
    }
  });

async function loadSchedule(calendarId: string) {
  const db = getDb();
  const [parentRows, ruleRows] = await db.batch([
    db
      .select({
        id: participants.id,
        displayName: participants.displayName,
        colorKey: participants.colorKey,
      })
      .from(participants)
      .where(and(eq(participants.calendarId, calendarId), eq(participants.active, true)))
      .orderBy(asc(participants.createdAt)),
    db
      .select({
        id: recurringRules.id,
        parentId: recurringRules.parentId,
        rrule: recurringRules.rrule,
        startDate: recurringRules.startDate,
        endDate: recurringRules.endDate,
        createdAt: recurringRules.createdAt,
      })
      .from(recurringRules)
      .where(and(eq(recurringRules.calendarId, calendarId), eq(recurringRules.active, true)))
      .orderBy(desc(recurringRules.createdAt)),
  ]);

  const parsedRules = ruleRows
    .map((rule) => ({ rule, metadata: parseFortnightRuleText(rule.rrule) }))
    .filter(
      (item): item is typeof item & { metadata: NonNullable<typeof item.metadata> } =>
        item.metadata !== null,
    );

  const latest = parsedRules[0];
  if (!latest) {
    return {
      active: false,
      anchorDate: normalizeAnchorDate(new Date().toISOString().slice(0, 10)),
      endDate: null,
      pattern: Array<string | null>(FORTNIGHT_SLOTS).fill(null),
      participants: parentRows,
    };
  }

  const scheduleId = latest.metadata.scheduleId;
  const pattern = Array<string | null>(FORTNIGHT_SLOTS).fill(null);
  for (const item of parsedRules) {
    if (item.metadata.scheduleId !== scheduleId) continue;
    pattern[item.metadata.slot] = item.rule.parentId;
  }

  return {
    active: true,
    scheduleId,
    anchorDate: latest.metadata.anchorDate,
    endDate: latest.rule.endDate,
    pattern,
    participants: parentRows,
  };
}

export async function GET() {
  const session = await getEditorSession();
  if (!session) {
    return NextResponse.json({ error: "Editor access is required." }, { status: 401 });
  }

  return NextResponse.json(await loadSchedule(session.calendarId));
}

export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ error: "This request was blocked for safety." }, { status: 403 });
  }

  const session = await getEditorSession();
  if (!session) {
    return NextResponse.json({ error: "Editor access is required." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "The repeating schedule could not be read." }, { status: 400 });
  }

  const parsed = scheduleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Choose a valid repeating schedule." },
      { status: 400 },
    );
  }

  if (parsed.data.pattern.every((parentId) => parentId === null)) {
    return NextResponse.json(
      { error: "Choose at least one repeating day, or turn the repeating schedule off." },
      { status: 400 },
    );
  }

  const anchorDate = normalizeAnchorDate(parsed.data.anchorDate);
  const endDate = parsed.data.endDate;
  const pattern = parsed.data.pattern;
  const selectedParentIds = [...new Set(pattern.filter((value): value is string => Boolean(value)))];
  const db = getDb();

  const [parentRows, childRows, beforeRuleRows] = await db.batch([
    db
      .select({ id: participants.id })
      .from(participants)
      .where(
        and(
          eq(participants.calendarId, session.calendarId),
          eq(participants.active, true),
          inArray(participants.id, selectedParentIds),
        ),
      ),
    db
      .select({ id: children.id })
      .from(children)
      .where(and(eq(children.calendarId, session.calendarId), eq(children.active, true))),
    db
      .select({
        id: recurringRules.id,
        parentId: recurringRules.parentId,
        rrule: recurringRules.rrule,
        startDate: recurringRules.startDate,
        endDate: recurringRules.endDate,
      })
      .from(recurringRules)
      .where(and(eq(recurringRules.calendarId, session.calendarId), eq(recurringRules.active, true))),
  ]);

  if (parentRows.length !== selectedParentIds.length) {
    return NextResponse.json(
      { error: "One of the selected parents is no longer active on this calendar." },
      { status: 400 },
    );
  }

  if (childRows.length === 0) {
    return NextResponse.json(
      { error: "Add at least one child before creating a repeating schedule." },
      { status: 409 },
    );
  }

  const scheduleId = randomUUID();
  const sql = getSql();
  const statements = [
    sql`
      DELETE FROM parenting_assignments
      WHERE calendar_id = ${session.calendarId}
        AND source = 'recurring'
    `,
    sql`
      UPDATE recurring_rules
      SET active = false, updated_at = now()
      WHERE calendar_id = ${session.calendarId}
        AND active = true
    `,
  ];

  for (let slot = 0; slot < FORTNIGHT_SLOTS; slot += 1) {
    const parentId = pattern[slot];
    if (!parentId) continue;

    const ruleId = randomUUID();
    const startDate = dateForSlot(anchorDate, slot);
    const rrule = buildFortnightRuleText({ scheduleId, anchorDate, slot });

    statements.push(sql`
      INSERT INTO recurring_rules (
        id,
        calendar_id,
        parent_id,
        rrule,
        start_date,
        end_date,
        active,
        created_by,
        created_at,
        updated_at
      )
      VALUES (
        ${ruleId},
        ${session.calendarId},
        ${parentId},
        ${rrule},
        ${startDate},
        ${endDate},
        true,
        ${session.participantId},
        now(),
        now()
      )
    `);

    for (const child of childRows) {
      statements.push(sql`
        INSERT INTO recurring_rule_children (
          recurring_rule_id,
          child_id
        )
        VALUES (${ruleId}, ${child.id})
      `);
    }
  }

  const beforeState = JSON.stringify({ rules: beforeRuleRows });
  const afterState = JSON.stringify({ scheduleId, anchorDate, endDate, pattern });
  statements.push(sql`
    INSERT INTO audit_log (
      calendar_id,
      actor_participant_id,
      action,
      entity_type,
      entity_id,
      before_state,
      after_state
    )
    VALUES (
      ${session.calendarId},
      ${session.participantId},
      'recurring_schedule.replace',
      'recurring_schedule',
      NULL,
      ${beforeState}::jsonb,
      ${afterState}::jsonb
    )
  `);

  try {
    await sql.transaction(statements);
  } catch {
    return NextResponse.json(
      { error: "The repeating schedule could not be saved. Please refresh and try again." },
      { status: 409 },
    );
  }

  return NextResponse.json({
    ok: true,
    active: true,
    scheduleId,
    anchorDate,
    endDate,
    pattern,
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

  const db = getDb();
  const beforeRuleRows = await db
    .select({
      id: recurringRules.id,
      parentId: recurringRules.parentId,
      rrule: recurringRules.rrule,
      startDate: recurringRules.startDate,
      endDate: recurringRules.endDate,
    })
    .from(recurringRules)
    .where(and(eq(recurringRules.calendarId, session.calendarId), eq(recurringRules.active, true)));

  const sql = getSql();
  const beforeState = JSON.stringify({ rules: beforeRuleRows });

  try {
    await sql.transaction([
      sql`
        DELETE FROM parenting_assignments
        WHERE calendar_id = ${session.calendarId}
          AND source = 'recurring'
      `,
      sql`
        UPDATE recurring_rules
        SET active = false, updated_at = now()
        WHERE calendar_id = ${session.calendarId}
          AND active = true
      `,
      sql`
        INSERT INTO audit_log (
          calendar_id,
          actor_participant_id,
          action,
          entity_type,
          entity_id,
          before_state,
          after_state
        )
        VALUES (
          ${session.calendarId},
          ${session.participantId},
          'recurring_schedule.disable',
          'recurring_schedule',
          NULL,
          ${beforeState}::jsonb,
          '{"active":false}'::jsonb
        )
      `,
    ]);
  } catch {
    return NextResponse.json(
      { error: "The repeating schedule could not be turned off." },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true, active: false });
}
