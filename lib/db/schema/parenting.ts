import {
  boolean,
  check,
  date,
  index,
  integer,
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

export const assignmentSource = pgEnum("assignment_source", ["manual", "recurring"]);

export const parentingSchedules = pgTable(
  "parenting_schedules",
  {
    id: uuid("id").primaryKey(),
    calendarId: uuid("calendar_id")
      .notNull()
      .references(() => calendars.id, { onDelete: "cascade" }),
    anchorDate: date("anchor_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }),
    active: boolean("active").notNull().default(true),
    createdBy: uuid("created_by").references(() => participants.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check(
      "parenting_schedules_end_valid",
      sql`${table.endDate} IS NULL OR ${table.endDate} >= ${table.anchorDate}`,
    ),
    index("parenting_schedules_calendar_idx").on(
      table.calendarId,
      table.active,
      table.anchorDate,
    ),
  ],
);

export const parentingScheduleSlots = pgTable(
  "parenting_schedule_slots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    scheduleId: uuid("schedule_id")
      .notNull()
      .references(() => parentingSchedules.id, { onDelete: "cascade" }),
    slotIndex: integer("slot_index").notNull(),
    morningParentId: uuid("morning_parent_id").references(() => participants.id, {
      onDelete: "restrict",
    }),
    afternoonParentId: uuid("afternoon_parent_id").references(() => participants.id, {
      onDelete: "restrict",
    }),
  },
  (table) => [
    check(
      "parenting_schedule_slot_index_valid",
      sql`${table.slotIndex} >= 0 AND ${table.slotIndex} < 14`,
    ),
    check(
      "parenting_schedule_slot_assignment_valid",
      sql`${table.morningParentId} IS NOT NULL OR ${table.afternoonParentId} IS NOT NULL`,
    ),
    uniqueIndex("parenting_schedule_slot_unique").on(
      table.scheduleId,
      table.slotIndex,
    ),
  ],
);

export const parentingScheduleChildren = pgTable(
  "parenting_schedule_children",
  {
    scheduleId: uuid("schedule_id")
      .notNull()
      .references(() => parentingSchedules.id, { onDelete: "cascade" }),
    childId: uuid("child_id")
      .notNull()
      .references(() => children.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("parenting_schedule_child_unique").on(
      table.scheduleId,
      table.childId,
    ),
    index("parenting_schedule_child_child_idx").on(
      table.childId,
      table.scheduleId,
    ),
  ],
);

export const recurringRules = pgTable(
  "recurring_rules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    calendarId: uuid("calendar_id")
      .notNull()
      .references(() => calendars.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id")
      .notNull()
      .references(() => participants.id, { onDelete: "cascade" }),
    rrule: text("rrule").notNull(),
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }),
    active: boolean("active").notNull().default(true),
    createdBy: uuid("created_by").references(() => participants.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check(
      "recurring_rules_end_valid",
      sql`${table.endDate} IS NULL OR ${table.endDate} >= ${table.startDate}`,
    ),
    index("recurring_rules_calendar_idx").on(table.calendarId),
  ],
);

export const recurringRuleChildren = pgTable(
  "recurring_rule_children",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    recurringRuleId: uuid("recurring_rule_id")
      .notNull()
      .references(() => recurringRules.id, { onDelete: "cascade" }),
    childId: uuid("child_id")
      .notNull()
      .references(() => children.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("recurring_rule_child_unique").on(table.recurringRuleId, table.childId),
  ],
);

export const parentingAssignments = pgTable(
  "parenting_assignments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    calendarId: uuid("calendar_id")
      .notNull()
      .references(() => calendars.id, { onDelete: "cascade" }),
    childId: uuid("child_id")
      .notNull()
      .references(() => children.id, { onDelete: "cascade" }),
    assignmentDate: date("assignment_date", { mode: "string" }).notNull(),
    // The original parent_id column is retained as the morning slot for backwards compatibility.
    parentId: uuid("parent_id").references(() => participants.id, { onDelete: "restrict" }),
    afternoonParentId: uuid("afternoon_parent_id").references(() => participants.id, {
      onDelete: "restrict",
    }),
    source: assignmentSource("source").notNull().default("manual"),
    recurringRuleId: uuid("recurring_rule_id").references(() => recurringRules.id, {
      onDelete: "set null",
    }),
    handoverTime: time("handover_time"),
    handoverLocation: text("handover_location"),
    note: text("note"),
    createdBy: uuid("created_by").references(() => participants.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("assignment_child_date_unique").on(
      table.calendarId,
      table.childId,
      table.assignmentDate,
    ),
    index("assignment_calendar_date_idx").on(table.calendarId, table.assignmentDate),
    index("assignment_parent_idx").on(table.parentId),
    index("assignment_afternoon_parent_idx").on(table.afternoonParentId),
  ],
);
