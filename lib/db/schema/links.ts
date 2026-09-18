import {
  check,
  index,
  pgEnum,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { calendars, participants } from "@/lib/db/schema/core";

export const linkedEntityType = pgEnum("linked_entity_type", [
  "event",
  "expense",
  "responsibility",
  "child",
]);

export const entityLinks = pgTable(
  "entity_links",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    calendarId: uuid("calendar_id")
      .notNull()
      .references(() => calendars.id, { onDelete: "cascade" }),
    leftType: linkedEntityType("left_type").notNull(),
    leftId: uuid("left_id").notNull(),
    rightType: linkedEntityType("right_type").notNull(),
    rightId: uuid("right_id").notNull(),
    createdBy: uuid("created_by").references(() => participants.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check(
      "entity_link_not_self",
      sql`NOT (${table.leftType} = ${table.rightType} AND ${table.leftId} = ${table.rightId})`,
    ),
    check(
      "entity_link_canonical",
      sql`${table.leftType} < ${table.rightType} OR (${table.leftType} = ${table.rightType} AND ${table.leftId}::text < ${table.rightId}::text)`,
    ),
    uniqueIndex("entity_links_unique").on(
      table.calendarId,
      table.leftType,
      table.leftId,
      table.rightType,
      table.rightId,
    ),
    index("entity_links_left_idx").on(
      table.calendarId,
      table.leftType,
      table.leftId,
    ),
    index("entity_links_right_idx").on(
      table.calendarId,
      table.rightType,
      table.rightId,
    ),
  ],
);
