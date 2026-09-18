import { and, asc, eq, or } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  assertLinkableEntity,
  canonicalEntityLink,
  createEntityLinkSchema,
  linkedEntitySchema,
  loadLinkableSummary,
  type LinkableSummary,
  type LinkedEntityType,
  type RelatedTargetType,
} from "@/lib/links/model";
import { getDb, getSql } from "@/lib/db";
import {
  attachmentLinks,
  attachments,
  children,
  entityLinks,
  events,
  expenses,
  responsibilities,
  responsibilityChildren,
} from "@/lib/db/schema";
import { isSameOriginMutation } from "@/lib/security/request";
import { getCalendarSession, getEditorSession } from "@/lib/security/session";

type RelatedItem = LinkableSummary & {
  origin: "explicit" | "native" | "document";
  removable: boolean;
};

function itemKey(type: RelatedTargetType, id: string) {
  return `${type}:${id}`;
}

async function nativeRelatedItems(
  calendarId: string,
  sourceType: LinkedEntityType,
  sourceId: string,
) {
  const db = getDb();
  const targets: Array<{ type: RelatedTargetType; id: string }> = [];

  if (sourceType === "expense") {
    const expenseRows = await db
      .select({ childId: expenses.childId })
      .from(expenses)
      .where(and(eq(expenses.calendarId, calendarId), eq(expenses.id, sourceId)))
      .limit(1);
    const childId = expenseRows[0]?.childId;
    if (childId) targets.push({ type: "child", id: childId });

    const taskRows = await db
      .select({ id: responsibilities.id })
      .from(responsibilities)
      .where(
        and(
          eq(responsibilities.calendarId, calendarId),
          eq(responsibilities.linkedExpenseId, sourceId),
        ),
      );
    for (const row of taskRows) targets.push({ type: "responsibility", id: row.id });
  }

  if (sourceType === "responsibility") {
    const rows = await db
      .select({
        linkedEventId: responsibilities.linkedEventId,
        linkedExpenseId: responsibilities.linkedExpenseId,
      })
      .from(responsibilities)
      .where(
        and(
          eq(responsibilities.calendarId, calendarId),
          eq(responsibilities.id, sourceId),
        ),
      )
      .limit(1);
    const row = rows[0];
    if (row?.linkedEventId) targets.push({ type: "event", id: row.linkedEventId });
    if (row?.linkedExpenseId) targets.push({ type: "expense", id: row.linkedExpenseId });

    const childRows = await db
      .select({ childId: responsibilityChildren.childId })
      .from(responsibilityChildren)
      .where(eq(responsibilityChildren.responsibilityId, sourceId));
    for (const child of childRows) targets.push({ type: "child", id: child.childId });
  }

  if (sourceType === "event") {
    const rows = await db
      .select({ id: responsibilities.id })
      .from(responsibilities)
      .where(
        and(
          eq(responsibilities.calendarId, calendarId),
          eq(responsibilities.linkedEventId, sourceId),
        ),
      );
    for (const row of rows) targets.push({ type: "responsibility", id: row.id });
  }

  if (sourceType === "child") {
    const expenseRows = await db
      .select({ id: expenses.id })
      .from(expenses)
      .where(and(eq(expenses.calendarId, calendarId), eq(expenses.childId, sourceId)));
    for (const row of expenseRows) targets.push({ type: "expense", id: row.id });

    const taskRows = await db
      .select({ id: responsibilities.id })
      .from(responsibilityChildren)
      .innerJoin(
        responsibilities,
        eq(responsibilityChildren.responsibilityId, responsibilities.id),
      )
      .where(
        and(
          eq(responsibilityChildren.childId, sourceId),
          eq(responsibilities.calendarId, calendarId),
        ),
      );
    for (const row of taskRows) targets.push({ type: "responsibility", id: row.id });
  }

  const unique = new Map<string, RelatedItem>();
  for (const target of targets) {
    const summary = await loadLinkableSummary(calendarId, target.type, target.id);
    if (!summary) continue;
    unique.set(itemKey(summary.type, summary.id), {
      ...summary,
      origin: "native",
      removable: false,
    });
  }
  return [...unique.values()];
}

async function explicitRelatedItems(
  calendarId: string,
  sourceType: LinkedEntityType,
  sourceId: string,
) {
  const rows = await getDb()
    .select({
      leftType: entityLinks.leftType,
      leftId: entityLinks.leftId,
      rightType: entityLinks.rightType,
      rightId: entityLinks.rightId,
    })
    .from(entityLinks)
    .where(
      and(
        eq(entityLinks.calendarId, calendarId),
        or(
          and(eq(entityLinks.leftType, sourceType), eq(entityLinks.leftId, sourceId)),
          and(eq(entityLinks.rightType, sourceType), eq(entityLinks.rightId, sourceId)),
        ),
      ),
    )
    .orderBy(asc(entityLinks.createdAt));

  const items: RelatedItem[] = [];
  for (const row of rows) {
    const target =
      row.leftType === sourceType && row.leftId === sourceId
        ? { type: row.rightType, id: row.rightId }
        : { type: row.leftType, id: row.leftId };
    const summary = await loadLinkableSummary(calendarId, target.type, target.id);
    if (!summary) continue;
    items.push({ ...summary, origin: "explicit", removable: true });
  }
  return items;
}

async function documentRelatedItems(
  calendarId: string,
  sourceType: LinkedEntityType,
  sourceId: string,
) {
  const rows = await getDb()
    .select({
      id: attachments.id,
      fileName: attachments.originalFileName,
      category: attachments.category,
      sizeBytes: attachments.sizeBytes,
      primaryEntityType: attachments.primaryEntityType,
      primaryEntityId: attachments.primaryEntityId,
      primaryRole: attachments.primaryRole,
    })
    .from(attachmentLinks)
    .innerJoin(attachments, eq(attachmentLinks.attachmentId, attachments.id))
    .where(
      and(
        eq(attachmentLinks.calendarId, calendarId),
        eq(attachmentLinks.entityType, sourceType),
        eq(attachmentLinks.entityId, sourceId),
        eq(attachmentLinks.role, "supporting"),
        eq(attachments.status, "ready"),
      ),
    )
    .orderBy(asc(attachmentLinks.createdAt));

  return rows.map(
    (row): RelatedItem => ({
      type: "attachment",
      id: row.id,
      title: row.fileName,
      subtitle: `${row.category.replaceAll("_", " ")} · ${Math.max(
        0.1,
        row.sizeBytes / (1024 * 1024),
      ).toFixed(1)} MB`,
      href: null,
      origin: "document",
      removable: !(
        row.primaryEntityType === sourceType &&
        row.primaryEntityId === sourceId &&
        row.primaryRole === "supporting"
      ),
    }),
  );
}

async function candidateItems(calendarId: string) {
  const db = getDb();
  const [eventRows, expenseRows, taskRows, childRows, documentRows] =
    await Promise.all([
      db
        .select({ id: events.id })
        .from(events)
        .where(eq(events.calendarId, calendarId))
        .orderBy(asc(events.startDate))
        .limit(150),
      db
        .select({ id: expenses.id })
        .from(expenses)
        .where(eq(expenses.calendarId, calendarId))
        .orderBy(asc(expenses.expenseDate))
        .limit(150),
      db
        .select({ id: responsibilities.id })
        .from(responsibilities)
        .where(eq(responsibilities.calendarId, calendarId))
        .orderBy(asc(responsibilities.dueDate))
        .limit(150),
      db
        .select({ id: children.id })
        .from(children)
        .where(and(eq(children.calendarId, calendarId), eq(children.active, true)))
        .orderBy(asc(children.createdAt))
        .limit(50),
      db
        .select({ id: attachments.id })
        .from(attachments)
        .where(
          and(
            eq(attachments.calendarId, calendarId),
            eq(attachments.status, "ready"),
            eq(attachments.primaryRole, "supporting"),
          ),
        )
        .orderBy(asc(attachments.createdAt))
        .limit(150),
    ]);

  const candidates: LinkableSummary[] = [];
  for (const [type, rows] of [
    ["event", eventRows],
    ["expense", expenseRows],
    ["responsibility", taskRows],
    ["child", childRows],
    ["attachment", documentRows],
  ] as const) {
    for (const row of rows) {
      const summary = await loadLinkableSummary(calendarId, type, row.id);
      if (summary) candidates.push(summary);
    }
  }
  return candidates;
}

export async function GET(request: NextRequest) {
  const session = await getCalendarSession();
  if (!session) {
    return NextResponse.json({ error: "Calendar access is required." }, { status: 401 });
  }

  const parsed = linkedEntitySchema.safeParse({
    entityType: request.nextUrl.searchParams.get("entityType"),
    entityId: request.nextUrl.searchParams.get("entityId"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Choose a valid related item." }, { status: 400 });
  }

  try {
    await assertLinkableEntity(session.calendarId, parsed.data.entityType, parsed.data.entityId);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Item not found." },
      { status: 404 },
    );
  }

  const [explicit, native, documents] = await Promise.all([
    explicitRelatedItems(session.calendarId, parsed.data.entityType, parsed.data.entityId),
    nativeRelatedItems(session.calendarId, parsed.data.entityType, parsed.data.entityId),
    documentRelatedItems(session.calendarId, parsed.data.entityType, parsed.data.entityId),
  ]);

  const unique = new Map<string, RelatedItem>();
  for (const item of [...explicit, ...documents, ...native]) {
    const key = itemKey(item.type, item.id);
    const existing = unique.get(key);
    if (!existing || item.origin === "native") unique.set(key, item);
  }

  const includeCandidates =
    request.nextUrl.searchParams.get("includeCandidates") === "true" &&
    (session.permission === "owner" || session.permission === "editor");
  const candidates = includeCandidates
    ? (await candidateItems(session.calendarId)).filter(
        (candidate) =>
          candidate.type === "attachment" ||
          candidate.type !== parsed.data.entityType ||
          candidate.id !== parsed.data.entityId,
      )
    : undefined;

  return NextResponse.json({
    permission: session.permission,
    items: [...unique.values()],
    candidates,
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

  const parsed = createEntityLinkSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Choose two valid Covie items to link." }, { status: 400 });
  }

  if (
    parsed.data.targetType === parsed.data.entityType &&
    parsed.data.targetId === parsed.data.entityId
  ) {
    return NextResponse.json({ error: "An item cannot link to itself." }, { status: 400 });
  }

  try {
    await Promise.all([
      assertLinkableEntity(session.calendarId, parsed.data.entityType, parsed.data.entityId),
      assertLinkableEntity(session.calendarId, parsed.data.targetType, parsed.data.targetId),
    ]);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Related item not found." },
      { status: 404 },
    );
  }

  const sql = getSql();

  if (parsed.data.targetType === "attachment") {
    try {
      await sql.transaction([
        sql`
          INSERT INTO attachment_links (
            calendar_id, attachment_id, entity_type, entity_id, role
          )
          VALUES (
            ${session.calendarId}, ${parsed.data.targetId},
            ${parsed.data.entityType}::attachment_entity_type,
            ${parsed.data.entityId}, 'supporting'
          )
          ON CONFLICT DO NOTHING
        `,
        sql`
          INSERT INTO audit_log (
            calendar_id, actor_participant_id, action, entity_type, entity_id, after_state
          )
          VALUES (
            ${session.calendarId}, ${session.participantId},
            'link.create', 'entity_link', ${parsed.data.entityId},
            ${JSON.stringify({
              sourceType: parsed.data.entityType,
              sourceId: parsed.data.entityId,
              targetType: parsed.data.targetType,
              targetId: parsed.data.targetId,
            })}::jsonb
          )
        `,
      ]);
    } catch {
      return NextResponse.json({ error: "The document could not be linked." }, { status: 409 });
    }
    return NextResponse.json({ ok: true });
  }

  const pair = canonicalEntityLink({
    leftType: parsed.data.entityType,
    leftId: parsed.data.entityId,
    rightType: parsed.data.targetType,
    rightId: parsed.data.targetId,
  });

  try {
    await sql.transaction([
      sql`
        INSERT INTO entity_links (
          calendar_id, left_type, left_id, right_type, right_id, created_by
        )
        VALUES (
          ${session.calendarId}, ${pair.leftType}::linked_entity_type, ${pair.leftId},
          ${pair.rightType}::linked_entity_type, ${pair.rightId}, ${session.participantId}
        )
        ON CONFLICT DO NOTHING
      `,
      sql`
        INSERT INTO audit_log (
          calendar_id, actor_participant_id, action, entity_type, entity_id, after_state
        )
        VALUES (
          ${session.calendarId}, ${session.participantId},
          'link.create', 'entity_link', ${parsed.data.entityId},
          ${JSON.stringify({
            sourceType: parsed.data.entityType,
            sourceId: parsed.data.entityId,
            targetType: parsed.data.targetType,
            targetId: parsed.data.targetId,
          })}::jsonb
        )
      `,
    ]);
  } catch {
    return NextResponse.json({ error: "The related item could not be linked." }, { status: 409 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ error: "This request was blocked for safety." }, { status: 403 });
  }
  const session = await getEditorSession();
  if (!session) {
    return NextResponse.json({ error: "Editor access is required." }, { status: 401 });
  }

  const parsed = createEntityLinkSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Choose a valid related item." }, { status: 400 });
  }

  const sql = getSql();

  if (parsed.data.targetType === "attachment") {
    const attachmentRows = await getDb()
      .select({
        primaryEntityType: attachments.primaryEntityType,
        primaryEntityId: attachments.primaryEntityId,
        primaryRole: attachments.primaryRole,
      })
      .from(attachments)
      .where(
        and(
          eq(attachments.calendarId, session.calendarId),
          eq(attachments.id, parsed.data.targetId),
          eq(attachments.status, "ready"),
        ),
      )
      .limit(1);
    const attachment = attachmentRows[0];
    if (!attachment) {
      return NextResponse.json({ error: "Document not found." }, { status: 404 });
    }
    if (
      attachment.primaryEntityType === parsed.data.entityType &&
      attachment.primaryEntityId === parsed.data.entityId &&
      attachment.primaryRole === "supporting"
    ) {
      return NextResponse.json(
        { error: "Remove the document from its original item instead." },
        { status: 409 },
      );
    }

    await sql.transaction([
      sql`
        DELETE FROM attachment_links
        WHERE calendar_id = ${session.calendarId}
          AND attachment_id = ${parsed.data.targetId}
          AND entity_type = ${parsed.data.entityType}::attachment_entity_type
          AND entity_id = ${parsed.data.entityId}
          AND role = 'supporting'
      `,
      sql`
        INSERT INTO audit_log (
          calendar_id, actor_participant_id, action, entity_type, entity_id, before_state
        )
        VALUES (
          ${session.calendarId}, ${session.participantId},
          'link.delete', 'entity_link', ${parsed.data.entityId},
          ${JSON.stringify({
            sourceType: parsed.data.entityType,
            sourceId: parsed.data.entityId,
            targetType: parsed.data.targetType,
            targetId: parsed.data.targetId,
          })}::jsonb
        )
      `,
    ]);
    return NextResponse.json({ ok: true });
  }

  const pair = canonicalEntityLink({
    leftType: parsed.data.entityType,
    leftId: parsed.data.entityId,
    rightType: parsed.data.targetType,
    rightId: parsed.data.targetId,
  });

  await sql.transaction([
    sql`
      DELETE FROM entity_links
      WHERE calendar_id = ${session.calendarId}
        AND left_type = ${pair.leftType}::linked_entity_type
        AND left_id = ${pair.leftId}
        AND right_type = ${pair.rightType}::linked_entity_type
        AND right_id = ${pair.rightId}
    `,
    sql`
      INSERT INTO audit_log (
        calendar_id, actor_participant_id, action, entity_type, entity_id, before_state
      )
      VALUES (
        ${session.calendarId}, ${session.participantId},
        'link.delete', 'entity_link', ${parsed.data.entityId},
        ${JSON.stringify({
          sourceType: parsed.data.entityType,
          sourceId: parsed.data.entityId,
          targetType: parsed.data.targetType,
          targetId: parsed.data.targetId,
        })}::jsonb
      )
    `,
  ]);

  return NextResponse.json({ ok: true });
}
