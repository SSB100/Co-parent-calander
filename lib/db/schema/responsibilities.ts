import {
  check,
  date,
  foreignKey,
  index,
  pgEnum,
  pgTable,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { children } from "@/lib/db/schema/children";
import { calendars, participants } from "@/lib/db/schema/core";
import { events } from "@/lib/db/schema/events";
import { expenses } from "@/lib/db/schema/expenses";

export const responsibilityCategory = pgEnum("responsibility_category", [
  "school",
  "medical",
  "sport",
  "activity",
  "transport",
  "shopping",
  "forms_permissions",
  "appointment",
  "home_admin",
  "other",
]);

export const responsibilityRecurrence = pgEnum("responsibility_recurrence", [
  "none",
  "weekly",
  "fortnightly",
  "monthly",
  "yearly",
]);

export const responsibilities = pgTable(
  "responsibilities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    calendarId: uuid("calendar_id")
      .notNull()
      .references(() => calendars.id, { onDelete: "cascade" }),
    seriesId: uuid("series_id").notNull(),
    title: text("title").notNull(),
    responsibleParticipantId: uuid("responsible_participant_id")
      .notNull()
      .references(() => participants.id, { onDelete: "restrict" }),
    dueDate: date("due_date", { mode: "string" }).notNull(),
    dueTime: time("due_time"),
    category: responsibilityCategory("category").notNull().default("other"),
    note: text("note"),
    recurrence: responsibilityRecurrence("recurrence").notNull().default("none"),
    recurrenceEndDate: date("recurrence_end_date", { mode: "string" }),
    linkedEventId: uuid("linked_event_id").references(() => events.id, { onDelete: "set null" }),
    linkedExpenseId: uuid("linked_expense_id").references(() => expenses.id, { onDelete: "set null" }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    completedByParticipantId: uuid("completed_by_participant_id").references(
      () => participants.id,
      { onDelete: "set null" },
    ),
    nextOccurrenceId: uuid("next_occurrence_id"),
    createdBy: uuid("created_by").references(() => participants.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check(
      "responsibility_recurrence_end_valid",
      sql`${table.recurrenceEndDate} IS NULL OR ${table.recurrenceEndDate} >= ${table.dueDate}`,
    ),
    index("responsibilities_calendar_due_idx").on(table.calendarId, table.dueDate),
    index("responsibilities_calendar_completion_idx").on(
      table.calendarId,
      table.completedAt,
      table.dueDate,
    ),
    index("responsibilities_responsible_due_idx").on(
      table.responsibleParticipantId,
      table.completedAt,
      table.dueDate,
    ),
    index("responsibilities_series_idx").on(table.calendarId, table.seriesId, table.dueDate),
    foreignKey({
      name: "responsibilities_next_occurrence_id_fk",
      columns: [table.nextOccurrenceId],
      foreignColumns: [table.id],
    }).onDelete("set null"),
    index("responsibilities_next_occurrence_idx").on(table.nextOccurrenceId),
    index("responsibilities_linked_event_idx").on(table.linkedEventId),
    index("responsibilities_linked_expense_idx").on(table.linkedExpenseId),
  ],
);

export const responsibilityChildren = pgTable(
  "responsibility_children",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    responsibilityId: uuid("responsibility_id")
      .notNull()
      .references(() => responsibilities.id, { onDelete: "cascade" }),
    childId: uuid("child_id")
      .notNull()
      .references(() => children.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("responsibility_child_unique").on(table.responsibilityId, table.childId),
    index("responsibility_children_child_idx").on(table.childId, table.responsibilityId),
  ],
);
