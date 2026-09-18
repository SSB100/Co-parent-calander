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
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { calendarMemberships, calendars } from "@/lib/db/schema/core";

export const googleParentLabelMode = pgEnum("google_parent_label_mode", ["names", "neutral"]);

export const googleConnectionStatus = pgEnum("google_connection_status", [
  "initial_sync",
  "active",
  "reconnect_required",
  "error",
]);

export const googleEventKind = pgEnum("google_event_kind", ["parenting", "handover", "shared_event"]);

export const googleSyncJobStatus = pgEnum("google_sync_job_status", [
  "pending",
  "processing",
  "retry",
  "failed",
  "succeeded",
]);

export const googleCalendarConnections = pgTable(
  "google_calendar_connections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    calendarId: uuid("calendar_id").notNull().references(() => calendars.id, { onDelete: "cascade" }),
    membershipId: uuid("membership_id").notNull().references(() => calendarMemberships.id, { onDelete: "cascade" }),
    googleCalendarId: text("google_calendar_id"),
    googleCalendarName: text("google_calendar_name"),
    accessTokenEncrypted: text("access_token_encrypted"),
    refreshTokenEncrypted: text("refresh_token_encrypted"),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    status: googleConnectionStatus("status").notNull().default("initial_sync"),
    syncParenting: boolean("sync_parenting").notNull().default(true),
    syncHandovers: boolean("sync_handovers").notNull().default(true),
    syncSharedEvents: boolean("sync_shared_events").notNull().default(true),
    syncLocations: boolean("sync_locations").notNull().default(false),
    syncSharedNotes: boolean("sync_shared_notes").notNull().default(false),
    parentLabelMode: googleParentLabelMode("parent_label_mode").notNull().default("names"),
    lastSuccessfulSyncAt: timestamp("last_successful_sync_at", { withTimezone: true }),
    lastAttemptedSyncAt: timestamp("last_attempted_sync_at", { withTimezone: true }),
    lastError: text("last_error"),
    connectedAt: timestamp("connected_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("google_connection_membership_unique").on(table.membershipId),
    index("google_connection_calendar_idx").on(table.calendarId),
  ],
);

export const googleEventLinks = pgTable(
  "google_event_links",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    connectionId: uuid("connection_id").notNull().references(() => googleCalendarConnections.id, { onDelete: "cascade" }),
    localKey: text("local_key").notNull(),
    googleEventId: varchar("google_event_id", { length: 128 }).notNull(),
    eventKind: googleEventKind("event_kind").notNull(),
    localEntityId: uuid("local_entity_id"),
    rangeStart: date("range_start", { mode: "string" }).notNull(),
    rangeEnd: date("range_end", { mode: "string" }).notNull(),
    contentHash: varchar("content_hash", { length: 64 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check("google_event_link_range_valid", sql`${table.rangeEnd} >= ${table.rangeStart}`),
    uniqueIndex("google_event_link_local_unique").on(table.connectionId, table.localKey),
    uniqueIndex("google_event_link_google_unique").on(table.connectionId, table.googleEventId),
    index("google_event_link_range_idx").on(table.connectionId, table.rangeStart, table.rangeEnd),
  ],
);

export const calendarSyncJobs = pgTable(
  "calendar_sync_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    connectionId: uuid("connection_id").notNull().references(() => googleCalendarConnections.id, { onDelete: "cascade" }),
    calendarId: uuid("calendar_id").notNull().references(() => calendars.id, { onDelete: "cascade" }),
    jobType: varchar("job_type", { length: 32 }).notNull().default("range"),
    rangeStart: date("range_start", { mode: "string" }),
    rangeEnd: date("range_end", { mode: "string" }),
    status: googleSyncJobStatus("status").notNull().default("pending"),
    retryCount: integer("retry_count").notNull().default(0),
    availableAt: timestamp("available_at", { withTimezone: true }).defaultNow().notNull(),
    lastAttemptedAt: timestamp("last_attempted_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("calendar_sync_jobs_due_idx").on(table.status, table.availableAt),
    index("calendar_sync_jobs_connection_idx").on(table.connectionId, table.createdAt),
    index("calendar_sync_jobs_calendar_idx").on(table.calendarId, table.createdAt),
  ],
);
