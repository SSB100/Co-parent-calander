import {
  boolean,
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { children } from "@/lib/db/schema/children";
import { calendars, participants } from "@/lib/db/schema/core";

export const expenseCategory = pgEnum("expense_category", [
  "school",
  "childcare",
  "medical",
  "sport",
  "clothing",
  "activity",
  "travel",
  "essentials",
  "other",
]);

export const expenseSettlementStatus = pgEnum("expense_settlement_status", [
  "not_needed",
  "outstanding",
  "settled",
]);

export const expenseRecurrenceFrequency = pgEnum("expense_recurrence_frequency", [
  "weekly",
  "fortnightly",
  "monthly",
  "yearly",
]);

export const expenseRecurringSeries = pgTable(
  "expense_recurring_series",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    calendarId: uuid("calendar_id")
      .notNull()
      .references(() => calendars.id, { onDelete: "cascade" }),
    childId: uuid("child_id").references(() => children.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    category: expenseCategory("category").notNull().default("other"),
    amountCents: integer("amount_cents").notNull(),
    paidByParticipantId: uuid("paid_by_participant_id")
      .notNull()
      .references(() => participants.id, { onDelete: "restrict" }),
    startDate: date("start_date", { mode: "string" }).notNull(),
    dueOffsetDays: integer("due_offset_days"),
    frequency: expenseRecurrenceFrequency("frequency").notNull(),
    endDate: date("end_date", { mode: "string" }),
    lastGeneratedDate: date("last_generated_date", { mode: "string" }).notNull(),
    note: text("note"),
    active: boolean("active").notNull().default(true),
    createdBy: uuid("created_by").references(() => participants.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check("expense_recurring_series_amount_positive", sql`${table.amountCents} > 0`),
    check(
      "expense_recurring_series_end_valid",
      sql`${table.endDate} IS NULL OR ${table.endDate} >= ${table.startDate}`,
    ),
    index("expense_recurring_series_calendar_idx").on(
      table.calendarId,
      table.active,
      table.lastGeneratedDate,
    ),
  ],
);

export const expenseRecurringSeriesShares = pgTable(
  "expense_recurring_series_shares",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    seriesId: uuid("series_id")
      .notNull()
      .references(() => expenseRecurringSeries.id, { onDelete: "cascade" }),
    participantId: uuid("participant_id")
      .notNull()
      .references(() => participants.id, { onDelete: "restrict" }),
    shareCents: integer("share_cents").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check("expense_recurring_series_shares_non_negative", sql`${table.shareCents} >= 0`),
    uniqueIndex("expense_recurring_series_share_unique").on(
      table.seriesId,
      table.participantId,
    ),
  ],
);

export const expenses = pgTable(
  "expenses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    calendarId: uuid("calendar_id")
      .notNull()
      .references(() => calendars.id, { onDelete: "cascade" }),
    childId: uuid("child_id").references(() => children.id, { onDelete: "set null" }),
    expenseDate: date("expense_date", { mode: "string" }).notNull(),
    title: text("title").notNull(),
    category: expenseCategory("category").notNull().default("other"),
    amountCents: integer("amount_cents").notNull(),
    paidByParticipantId: uuid("paid_by_participant_id")
      .notNull()
      .references(() => participants.id, { onDelete: "restrict" }),
    dueDate: date("due_date", { mode: "string" }),
    note: text("note"),
    seriesId: uuid("series_id").references(() => expenseRecurringSeries.id, {
      onDelete: "restrict",
    }),
    seriesOccurrenceDate: date("series_occurrence_date", { mode: "string" }),
    settlementStatus: expenseSettlementStatus("settlement_status")
      .notNull()
      .default("outstanding"),
    settledAt: timestamp("settled_at", { withTimezone: true }),
    settledByParticipantId: uuid("settled_by_participant_id").references(
      () => participants.id,
      { onDelete: "set null" },
    ),
    createdBy: uuid("created_by").references(() => participants.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check("expenses_amount_positive", sql`${table.amountCents} > 0`),
    check(
      "expenses_settlement_state_valid",
      sql`(${table.settlementStatus} = 'settled' AND ${table.settledAt} IS NOT NULL) OR (${table.settlementStatus} <> 'settled' AND ${table.settledAt} IS NULL)`,
    ),
    check(
      "expenses_series_occurrence_valid",
      sql`(${table.seriesId} IS NULL AND ${table.seriesOccurrenceDate} IS NULL) OR (${table.seriesId} IS NOT NULL AND ${table.seriesOccurrenceDate} IS NOT NULL)`,
    ),
    index("expenses_calendar_date_idx").on(table.calendarId, table.expenseDate),
    index("expenses_calendar_status_idx").on(table.calendarId, table.settlementStatus),
    index("expenses_child_idx").on(table.childId),
    index("expenses_paid_by_idx").on(table.paidByParticipantId),
    index("expenses_due_date_idx").on(table.calendarId, table.dueDate),
    uniqueIndex("expenses_series_occurrence_unique")
      .on(table.seriesId, table.seriesOccurrenceDate)
      .where(sql`${table.seriesId} IS NOT NULL`),
  ],
);

export const expenseShares = pgTable(
  "expense_shares",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    expenseId: uuid("expense_id")
      .notNull()
      .references(() => expenses.id, { onDelete: "cascade" }),
    participantId: uuid("participant_id")
      .notNull()
      .references(() => participants.id, { onDelete: "restrict" }),
    shareCents: integer("share_cents").notNull(),
    paidCents: integer("paid_cents").notNull().default(0),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check("expense_shares_non_negative", sql`${table.shareCents} >= 0`),
    check(
      "expense_shares_paid_amount_valid",
      sql`${table.paidCents} >= 0 AND ${table.paidCents} <= ${table.shareCents}`,
    ),
    uniqueIndex("expense_share_participant_unique").on(table.expenseId, table.participantId),
    index("expense_shares_participant_idx").on(table.participantId, table.expenseId),
  ],
);

export const expenseSharePayments = pgTable(
  "expense_share_payments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    expenseShareId: uuid("expense_share_id")
      .notNull()
      .references(() => expenseShares.id, { onDelete: "cascade" }),
    participantId: uuid("participant_id")
      .notNull()
      .references(() => participants.id, { onDelete: "restrict" }),
    amountCents: integer("amount_cents").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check("expense_share_payments_amount_positive", sql`${table.amountCents} > 0`),
    index("expense_share_payments_share_idx").on(
      table.expenseShareId,
      table.createdAt,
    ),
    index("expense_share_payments_participant_idx").on(
      table.participantId,
      table.createdAt,
    ),
  ],
);

