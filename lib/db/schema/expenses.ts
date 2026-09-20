import {
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
    index("expenses_calendar_date_idx").on(table.calendarId, table.expenseDate),
    index("expenses_calendar_status_idx").on(table.calendarId, table.settlementStatus),
    index("expenses_child_idx").on(table.childId),
    index("expenses_paid_by_idx").on(table.paidByParticipantId),
    index("expenses_due_date_idx").on(table.calendarId, table.dueDate),
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
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check("expense_shares_non_negative", sql`${table.shareCents} >= 0`),
    uniqueIndex("expense_share_participant_unique").on(table.expenseId, table.participantId),
    index("expense_shares_participant_idx").on(table.participantId, table.expenseId),
  ],
);
