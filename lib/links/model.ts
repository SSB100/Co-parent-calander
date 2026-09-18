import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import {
  attachments,
  children,
  events,
  expenses,
  responsibilities,
} from "@/lib/db/schema";

export const linkedEntityTypes = [
  "event",
  "expense",
  "responsibility",
  "child",
] as const;

export const relatedTargetTypes = [
  ...linkedEntityTypes,
  "attachment",
] as const;

export type LinkedEntityType = (typeof linkedEntityTypes)[number];
export type RelatedTargetType = (typeof relatedTargetTypes)[number];

export const linkedEntitySchema = z.object({
  entityType: z.enum(linkedEntityTypes),
  entityId: z.string().uuid(),
});

export const relatedTargetSchema = z.object({
  targetType: z.enum(relatedTargetTypes),
  targetId: z.string().uuid(),
});

export const createEntityLinkSchema = linkedEntitySchema.extend({
  targetType: z.enum(relatedTargetTypes),
  targetId: z.string().uuid(),
});

export type LinkableSummary = {
  type: RelatedTargetType;
  id: string;
  title: string;
  subtitle: string | null;
  href: string | null;
};

const typeRank: Record<LinkedEntityType, number> = {
  event: 0,
  expense: 1,
  responsibility: 2,
  child: 3,
};

export function canonicalEntityLink(input: {
  leftType: LinkedEntityType;
  leftId: string;
  rightType: LinkedEntityType;
  rightId: string;
}) {
  const leftKey = `${String(typeRank[input.leftType]).padStart(2, "0")}:${input.leftId}`;
  const rightKey = `${String(typeRank[input.rightType]).padStart(2, "0")}:${input.rightId}`;

  if (leftKey <= rightKey) return input;
  return {
    leftType: input.rightType,
    leftId: input.rightId,
    rightType: input.leftType,
    rightId: input.leftId,
  };
}

export async function loadLinkableSummary(
  calendarId: string,
  type: RelatedTargetType,
  id: string,
): Promise<LinkableSummary | null> {
  const db = getDb();

  if (type === "event") {
    const rows = await db
      .select({
        id: events.id,
        title: events.title,
        startDate: events.startDate,
        endDate: events.endDate,
      })
      .from(events)
      .where(and(eq(events.calendarId, calendarId), eq(events.id, id)))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return {
      type,
      id: row.id,
      title: row.title,
      subtitle:
        row.endDate && row.endDate !== row.startDate
          ? `${row.startDate} – ${row.endDate}`
          : row.startDate,
      href: `/calendar?date=${encodeURIComponent(row.startDate)}`,
    };
  }

  if (type === "expense") {
    const rows = await db
      .select({
        id: expenses.id,
        title: expenses.title,
        expenseDate: expenses.expenseDate,
        amountCents: expenses.amountCents,
      })
      .from(expenses)
      .where(and(eq(expenses.calendarId, calendarId), eq(expenses.id, id)))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return {
      type,
      id: row.id,
      title: row.title,
      subtitle: `${row.expenseDate} · NZ$${(row.amountCents / 100).toFixed(2)}`,
      href: `/expenses?date=${encodeURIComponent(row.expenseDate)}`,
    };
  }

  if (type === "responsibility") {
    const rows = await db
      .select({
        id: responsibilities.id,
        title: responsibilities.title,
        dueDate: responsibilities.dueDate,
        completedAt: responsibilities.completedAt,
      })
      .from(responsibilities)
      .where(
        and(
          eq(responsibilities.calendarId, calendarId),
          eq(responsibilities.id, id),
        ),
      )
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return {
      type,
      id: row.id,
      title: row.title,
      subtitle: row.completedAt
        ? `Completed · ${row.dueDate}`
        : `Due ${row.dueDate}`,
      href: `/responsibilities?date=${encodeURIComponent(row.dueDate)}`,
    };
  }

  if (type === "child") {
    const rows = await db
      .select({
        id: children.id,
        displayName: children.displayName,
        schoolName: children.schoolName,
      })
      .from(children)
      .where(
        and(
          eq(children.calendarId, calendarId),
          eq(children.id, id),
          eq(children.active, true),
        ),
      )
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return {
      type,
      id: row.id,
      title: row.displayName,
      subtitle: row.schoolName,
      href: `/kids/${row.id}`,
    };
  }

  const rows = await db
    .select({
      id: attachments.id,
      fileName: attachments.originalFileName,
      category: attachments.category,
      contentType: attachments.contentType,
      sizeBytes: attachments.sizeBytes,
      primaryRole: attachments.primaryRole,
    })
    .from(attachments)
    .where(
      and(
        eq(attachments.calendarId, calendarId),
        eq(attachments.id, id),
        eq(attachments.status, "ready"),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row || row.primaryRole === "profile_photo") return null;

  return {
    type,
    id: row.id,
    title: row.fileName,
    subtitle: `${row.category.replaceAll("_", " ")} · ${Math.max(
      0.1,
      row.sizeBytes / (1024 * 1024),
    ).toFixed(1)} MB`,
    href: null,
  };
}

export async function assertLinkableEntity(
  calendarId: string,
  type: RelatedTargetType,
  id: string,
) {
  const summary = await loadLinkableSummary(calendarId, type, id);
  if (!summary) {
    throw new Error(
      type === "attachment" ? "Document not found." : "Related item not found.",
    );
  }
  return summary;
}
