import {
  check,
  date,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { calendars, participants } from "@/lib/db/schema/core";

export const eventCategory = pgEnum("event_category", [
  "school",
  "sport",
  "medical",
  "birthday",
  "holiday",
  "activity",
  "other",
]);

export const eventRecurrence = pgEnum("event_recurrence", [
  "none",
  "weekly",
  "fortnightly",
  "monthly",
  "yearly",
]);

export const events = pgTable(
  "events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    calendarId: uuid("calendar_id")
      .notNull()
      .references(() => calendars.id, { onDelete: "cascade" }),
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }),
    title: text("title").notNull(),
    description: text("description"),
    category: eventCategory("category").notNull().default("other"),
    recurrence: eventRecurrence("recurrence").notNull().default("none"),
    recurrenceEndDate: date("recurrence_end_date", { mode: "string" }),
    createdBy: uuid("created_by").references(() => participants.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check(
      "events_end_date_valid",
      sql`${table.endDate} IS NULL OR ${table.endDate} >= ${table.startDate}`,
    ),
    check(
      "events_recurrence_end_valid",
      sql`${table.recurrenceEndDate} IS NULL OR ${table.recurrenceEndDate} >= ${table.startDate}`,
    ),
    index("events_calendar_date_idx").on(table.calendarId, table.startDate),
    index("events_calendar_recurrence_idx").on(
      table.calendarId,
      table.recurrence,
      table.recurrenceEndDate,
    ),
  ],
);
