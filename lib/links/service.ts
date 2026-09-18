import { and, asc, eq, or } from "drizzle-orm";
import type { CalendarApprovalPermission } from "@/lib/approvals/types";
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
import {
  assertLinkableEntity,
  canonicalEntityLink,
  loadLinkableSummary,
  type LinkableSummary,
  type LinkedEntityType,
  type RelatedTargetType,
} from "@/lib/links/model";

export type RelatedItemsReadSession = {
  calendarId: string;
  permission: CalendarApprovalPermission;
};

export type RelatedItemsWriteSession = RelatedItemsReadSession & {
  participantId: string;
};

export type RelatedItem = LinkableSummary & {
  origin: "explicit" | "native" | "document";
  removable: boolean;
};

export type LinkMutationInput = {
  entityType: LinkedEntityType;
  entityId: string;
  targetType: RelatedTargetType;
  targetId: string;
};

export class RelatedItemsServiceError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "RelatedItemsServiceError";
  }
}

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
      .where(
        and(
          eq(expenses.calendarId, calendarId),
          eq(expenses.id, sourceId),
        ),
      )
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

    for (const row of taskRows) {
      targets.push({ type: "responsibility", id: row.id });
    }
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
    if (row?.linkedEventId) {
      targets.push({ type: "event", id: row.linkedEventId });
    }
    if (row?.linkedExpenseId) {
      targets.push({ type: "expense", id: row.linkedExpenseId });
    }

    const childRows = await db
      .select({ childId: responsibilityChildren.childId })
      .from(responsibilityChildren)
      .where(eq(responsibilityChildren.responsibilityId, sourceId));

    for (const child of childRows) {
      targets.push({ type: "child", id: child.childId });
    }
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

    for (const row of rows) {
      targets.push({ type: "responsibility", id: row.id });
    }
  }

  if (sourceType === "child") {
    const expenseRows = await db
      .select({ id: expenses.id })
      .from(expenses)
      .where(
        and(
          eq(expenses.calendarId, calendarId),
          eq(expenses.childId, sourceId),
        ),
      );

    for (const row of expenseRows) {
      targets.push({ type: "expense", id: row.id });
    }

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

    for (const row of taskRows) {
      targets.push({ type: "responsibility", id: row.id });
    }
  }

  const unique = new Map<string, RelatedItem>();
  for (const target of targets) {
    const summary = await loadLinkableSummary(
      calendarId,
      target.type,
      target.id,
    );
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
          and(
            eq(entityLinks.leftType, sourceType),
            eq(entityLinks.leftId, sourceId),
          ),
          and(
            eq(entityLinks.rightType, sourceType),
            eq(entityLinks.rightId, sourceId),
          ),
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

    const summary = await loadLinkableSummary(
      calendarId,
      target.type,
      target.id,
    );
    if (!summary) continue;

    items.push({
      ...summary,
      origin: "explicit",
      removable: true,
    });
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
    .innerJoin(
      attachments,
      eq(attachmentLinks.attachmentId, attachments.id),
    )
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
        .select({
          id: events.id,
          title: events.title,
          startDate: events.startDate,
          endDate: events.endDate,
        })
        .from(events)
        .where(eq(events.calendarId, calendarId))
        .orderBy(asc(events.startDate))
        .limit(150),
      db
        .select({
          id: expenses.id,
          title: expenses.title,
          expenseDate: expenses.expenseDate,
          amountCents: expenses.amountCents,
        })
        .from(expenses)
        .where(eq(expenses.calendarId, calendarId))
        .orderBy(asc(expenses.expenseDate))
        .limit(150),
      db
        .select({
          id: responsibilities.id,
          title: responsibilities.title,
          dueDate: responsibilities.dueDate,
          completedAt: responsibilities.completedAt,
        })
        .from(responsibilities)
        .where(eq(responsibilities.calendarId, calendarId))
        .orderBy(asc(responsibilities.dueDate))
        .limit(150),
      db
        .select({
          id: children.id,
          displayName: children.displayName,
          schoolName: children.schoolName,
        })
        .from(children)
        .where(
          and(
            eq(children.calendarId, calendarId),
            eq(children.active, true),
          ),
        )
        .orderBy(asc(children.createdAt))
        .limit(50),
      db
        .select({
          id: attachments.id,
          fileName: attachments.originalFileName,
          category: attachments.category,
          sizeBytes: attachments.sizeBytes,
        })
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

  return [
    ...eventRows.map(
      (row): LinkableSummary => ({
        type: "event",
        id: row.id,
        title: row.title,
        subtitle:
          row.endDate && row.endDate !== row.startDate
            ? `${row.startDate} – ${row.endDate}`
            : row.startDate,
        href: `/calendar?date=${encodeURIComponent(row.startDate)}`,
      }),
    ),
    ...expenseRows.map(
      (row): LinkableSummary => ({
        type: "expense",
        id: row.id,
        title: row.title,
        subtitle: `${row.expenseDate} · NZ$${(row.amountCents / 100).toFixed(2)}`,
        href: `/expenses?date=${encodeURIComponent(row.expenseDate)}`,
      }),
    ),
    ...taskRows.map(
      (row): LinkableSummary => ({
        type: "responsibility",
        id: row.id,
        title: row.title,
        subtitle: row.completedAt
          ? `Completed · ${row.dueDate}`
          : `Due ${row.dueDate}`,
        href: `/responsibilities?date=${encodeURIComponent(row.dueDate)}`,
      }),
    ),
    ...childRows.map(
      (row): LinkableSummary => ({
        type: "child",
        id: row.id,
        title: row.displayName,
        subtitle: row.schoolName,
        href: `/kids/${row.id}`,
      }),
    ),
    ...documentRows.map(
      (row): LinkableSummary => ({
        type: "attachment",
        id: row.id,
        title: row.fileName,
        subtitle: `${row.category.replaceAll("_", " ")} · ${Math.max(
          0.1,
          row.sizeBytes / (1024 * 1024),
        ).toFixed(1)} MB`,
        href: null,
      }),
    ),
  ];
}

async function assertSourceAndTarget(
  calendarId: string,
  input: LinkMutationInput,
) {
  try {
    await Promise.all([
      assertLinkableEntity(
        calendarId,
        input.entityType,
        input.entityId,
      ),
      assertLinkableEntity(
        calendarId,
        input.targetType,
        input.targetId,
      ),
    ]);
  } catch (error) {
    throw new RelatedItemsServiceError(
      404,
      error instanceof Error ? error.message : "Related item not found.",
    );
  }
}

export async function listRelatedItems(input: {
  session: RelatedItemsReadSession;
  entityType: LinkedEntityType;
  entityId: string;
  includeCandidates: boolean;
}) {
  const { session, entityType, entityId } = input;

  try {
    await assertLinkableEntity(
      session.calendarId,
      entityType,
      entityId,
    );
  } catch (error) {
    throw new RelatedItemsServiceError(
      404,
      error instanceof Error ? error.message : "Item not found.",
    );
  }

  const [explicit, native, documents] = await Promise.all([
    explicitRelatedItems(session.calendarId, entityType, entityId),
    nativeRelatedItems(session.calendarId, entityType, entityId),
    documentRelatedItems(session.calendarId, entityType, entityId),
  ]);

  const unique = new Map<string, RelatedItem>();
  for (const item of [...explicit, ...documents, ...native]) {
    const key = itemKey(item.type, item.id);
    const existing = unique.get(key);
    if (!existing || item.origin === "native") {
      unique.set(key, item);
    }
  }

  const canEdit =
    session.permission === "owner" ||
    session.permission === "editor";

  const candidates =
    input.includeCandidates && canEdit
      ? (await candidateItems(session.calendarId)).filter(
          (candidate) =>
            candidate.type === "attachment" ||
            candidate.type !== entityType ||
            candidate.id !== entityId,
        )
      : undefined;

  return {
    permission: session.permission,
    items: [...unique.values()],
    candidates,
  };
}

export async function createRelatedItemLink(input: {
  session: RelatedItemsWriteSession;
  link: LinkMutationInput;
}) {
  const { session, link } = input;

  if (
    link.targetType === link.entityType &&
    link.targetId === link.entityId
  ) {
    throw new RelatedItemsServiceError(
      400,
      "An item cannot link to itself.",
    );
  }

  await assertSourceAndTarget(session.calendarId, link);
  const sql = getSql();

  if (link.targetType === "attachment") {
    const existingAttachmentLinks = await getDb()
      .select({ id: attachmentLinks.id })
      .from(attachmentLinks)
      .where(
        and(
          eq(attachmentLinks.calendarId, session.calendarId),
          eq(attachmentLinks.attachmentId, link.targetId),
          eq(attachmentLinks.entityType, link.entityType),
          eq(attachmentLinks.entityId, link.entityId),
          eq(attachmentLinks.role, "supporting"),
        ),
      )
      .limit(1);

    if (existingAttachmentLinks[0]) {
      return { ok: true as const };
    }

    try {
      await sql.transaction([
        sql`
          INSERT INTO attachment_links (
            calendar_id, attachment_id, entity_type, entity_id, role
          )
          VALUES (
            ${session.calendarId}, ${link.targetId},
            ${link.entityType}::attachment_entity_type,
            ${link.entityId}, 'supporting'
          )
          ON CONFLICT DO NOTHING
        `,
        sql`
          INSERT INTO audit_log (
            calendar_id, actor_participant_id, action, entity_type,
            entity_id, after_state
          )
          VALUES (
            ${session.calendarId}, ${session.participantId},
            'link.create', 'entity_link', ${link.entityId},
            ${JSON.stringify({
              sourceType: link.entityType,
              sourceId: link.entityId,
              targetType: link.targetType,
              targetId: link.targetId,
            })}::jsonb
          )
        `,
      ]);
    } catch {
      throw new RelatedItemsServiceError(
        409,
        "The document could not be linked.",
      );
    }

    return { ok: true as const };
  }

  const pair = canonicalEntityLink({
    leftType: link.entityType,
    leftId: link.entityId,
    rightType: link.targetType,
    rightId: link.targetId,
  });

  const existingEntityLinks = await getDb()
    .select({ id: entityLinks.id })
    .from(entityLinks)
    .where(
      and(
        eq(entityLinks.calendarId, session.calendarId),
        eq(entityLinks.leftType, pair.leftType),
        eq(entityLinks.leftId, pair.leftId),
        eq(entityLinks.rightType, pair.rightType),
        eq(entityLinks.rightId, pair.rightId),
      ),
    )
    .limit(1);

  if (existingEntityLinks[0]) {
    return { ok: true as const };
  }

  try {
    await sql.transaction([
      sql`
        INSERT INTO entity_links (
          calendar_id, left_type, left_id, right_type, right_id, created_by
        )
        VALUES (
          ${session.calendarId},
          ${pair.leftType}::linked_entity_type,
          ${pair.leftId},
          ${pair.rightType}::linked_entity_type,
          ${pair.rightId},
          ${session.participantId}
        )
        ON CONFLICT DO NOTHING
      `,
      sql`
        INSERT INTO audit_log (
          calendar_id, actor_participant_id, action, entity_type,
          entity_id, after_state
        )
        VALUES (
          ${session.calendarId}, ${session.participantId},
          'link.create', 'entity_link', ${link.entityId},
          ${JSON.stringify({
            sourceType: link.entityType,
            sourceId: link.entityId,
            targetType: link.targetType,
            targetId: link.targetId,
          })}::jsonb
        )
      `,
    ]);
  } catch {
    throw new RelatedItemsServiceError(
      409,
      "The related item could not be linked.",
    );
  }

  return { ok: true as const };
}

export async function deleteRelatedItemLink(input: {
  session: RelatedItemsWriteSession;
  link: LinkMutationInput;
}) {
  const { session, link } = input;
  const sql = getSql();

  if (link.targetType === "attachment") {
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
          eq(attachments.id, link.targetId),
          eq(attachments.status, "ready"),
        ),
      )
      .limit(1);

    const attachment = attachmentRows[0];
    if (!attachment) {
      throw new RelatedItemsServiceError(404, "Document not found.");
    }

    if (
      attachment.primaryEntityType === link.entityType &&
      attachment.primaryEntityId === link.entityId &&
      attachment.primaryRole === "supporting"
    ) {
      throw new RelatedItemsServiceError(
        409,
        "Remove the document from its original item instead.",
      );
    }

    const existingAttachmentLinks = await getDb()
      .select({ id: attachmentLinks.id })
      .from(attachmentLinks)
      .where(
        and(
          eq(attachmentLinks.calendarId, session.calendarId),
          eq(attachmentLinks.attachmentId, link.targetId),
          eq(attachmentLinks.entityType, link.entityType),
          eq(attachmentLinks.entityId, link.entityId),
          eq(attachmentLinks.role, "supporting"),
        ),
      )
      .limit(1);

    if (!existingAttachmentLinks[0]) {
      return { ok: true as const };
    }

    try {
      await sql.transaction([
        sql`
          DELETE FROM attachment_links
          WHERE calendar_id = ${session.calendarId}
            AND attachment_id = ${link.targetId}
            AND entity_type = ${link.entityType}::attachment_entity_type
            AND entity_id = ${link.entityId}
            AND role = 'supporting'
        `,
        sql`
          INSERT INTO audit_log (
            calendar_id, actor_participant_id, action, entity_type,
            entity_id, before_state
          )
          VALUES (
            ${session.calendarId}, ${session.participantId},
            'link.delete', 'entity_link', ${link.entityId},
            ${JSON.stringify({
              sourceType: link.entityType,
              sourceId: link.entityId,
              targetType: link.targetType,
              targetId: link.targetId,
            })}::jsonb
          )
        `,
      ]);
    } catch {
      throw new RelatedItemsServiceError(
        409,
        "The document link could not be removed.",
      );
    }

    return { ok: true as const };
  }

  if (link.targetType === link.entityType && link.targetId === link.entityId) {
    throw new RelatedItemsServiceError(
      400,
      "An item cannot link to itself.",
    );
  }

  const pair = canonicalEntityLink({
    leftType: link.entityType,
    leftId: link.entityId,
    rightType: link.targetType,
    rightId: link.targetId,
  });

  const existingEntityLinks = await getDb()
    .select({ id: entityLinks.id })
    .from(entityLinks)
    .where(
      and(
        eq(entityLinks.calendarId, session.calendarId),
        eq(entityLinks.leftType, pair.leftType),
        eq(entityLinks.leftId, pair.leftId),
        eq(entityLinks.rightType, pair.rightType),
        eq(entityLinks.rightId, pair.rightId),
      ),
    )
    .limit(1);

  if (!existingEntityLinks[0]) {
    return { ok: true as const };
  }

  try {
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
          calendar_id, actor_participant_id, action, entity_type,
          entity_id, before_state
        )
        VALUES (
          ${session.calendarId}, ${session.participantId},
          'link.delete', 'entity_link', ${link.entityId},
          ${JSON.stringify({
            sourceType: link.entityType,
            sourceId: link.entityId,
            targetType: link.targetType,
            targetId: link.targetId,
          })}::jsonb
        )
      `,
    ]);
  } catch {
    throw new RelatedItemsServiceError(
      409,
      "The related item could not be unlinked.",
    );
  }

  return { ok: true as const };
}
