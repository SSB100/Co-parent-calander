import {
  check,
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
import { calendars, participants } from "@/lib/db/schema/core";

export const attachmentStatus = pgEnum("attachment_status", ["pending", "ready"]);

export const attachmentCategory = pgEnum("attachment_category", [
  "receipt",
  "school_form",
  "medical_letter",
  "registration",
  "camp",
  "insurance",
  "profile_photo",
  "other",
]);

export const attachmentEntityType = pgEnum("attachment_entity_type", [
  "expense",
  "responsibility",
  "event",
  "child",
]);

export const attachmentRole = pgEnum("attachment_role", ["supporting", "profile_photo"]);

export const attachments = pgTable(
  "attachments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    calendarId: uuid("calendar_id")
      .notNull()
      .references(() => calendars.id, { onDelete: "cascade" }),
    storageProvider: varchar("storage_provider", { length: 32 })
      .notNull()
      .default("vercel_blob"),
    storageKey: text("storage_key").notNull(),
    originalFileName: text("original_file_name").notNull(),
    contentType: varchar("content_type", { length: 160 }).notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    category: attachmentCategory("category").notNull().default("other"),
    primaryEntityType: attachmentEntityType("primary_entity_type").notNull(),
    primaryEntityId: uuid("primary_entity_id").notNull(),
    primaryRole: attachmentRole("primary_role").notNull().default("supporting"),
    status: attachmentStatus("status").notNull().default("pending"),
    uploadedBy: uuid("uploaded_by").references(() => participants.id, {
      onDelete: "set null",
    }),
    readyAt: timestamp("ready_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check("attachment_size_positive", sql`${table.sizeBytes} > 0`),
    check(
      "attachment_ready_state_valid",
      sql`(${table.status} = 'pending' AND ${table.readyAt} IS NULL) OR (${table.status} = 'ready' AND ${table.readyAt} IS NOT NULL)`,
    ),
    uniqueIndex("attachments_storage_key_unique").on(table.storageKey),
    index("attachments_calendar_status_idx").on(
      table.calendarId,
      table.status,
      table.createdAt,
    ),
    index("attachments_primary_target_idx").on(
      table.calendarId,
      table.primaryEntityType,
      table.primaryEntityId,
      table.primaryRole,
    ),
  ],
);

export const attachmentLinks = pgTable(
  "attachment_links",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    calendarId: uuid("calendar_id")
      .notNull()
      .references(() => calendars.id, { onDelete: "cascade" }),
    attachmentId: uuid("attachment_id")
      .notNull()
      .references(() => attachments.id, { onDelete: "cascade" }),
    entityType: attachmentEntityType("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    role: attachmentRole("role").notNull().default("supporting"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("attachment_link_unique").on(
      table.attachmentId,
      table.entityType,
      table.entityId,
      table.role,
    ),
    index("attachment_links_target_idx").on(
      table.calendarId,
      table.entityType,
      table.entityId,
      table.role,
    ),
    uniqueIndex("child_profile_photo_unique")
      .on(table.calendarId, table.entityType, table.entityId, table.role)
      .where(
        sql`${table.entityType} = 'child' AND ${table.role} = 'profile_photo'`,
      ),
  ],
);
