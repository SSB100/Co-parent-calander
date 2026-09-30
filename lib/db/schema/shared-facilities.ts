import { boolean, integer, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { calendars, calendarInvites } from "./core";
// Composite tenant constraints, partial indexes and serialization triggers are
// declared in 0033_shared_facilities.sql. Keep generated migrations under review.
export const templateMemberRoles = pgTable("template_member_roles", {
  calendarId: uuid("calendar_id").notNull().references(() => calendars.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull(), role: varchar("role", { length: 16 }).notNull(), resourceIds: uuid("resource_ids").array().notNull(),
});
export const templateInviteRoles = pgTable("template_invite_roles", {
  inviteId: uuid("invite_id").primaryKey().references(() => calendarInvites.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 16 }).notNull(), resourceIds: uuid("resource_ids").array().notNull(),
});
export const facilitySettings = pgTable("facility_settings", {
  calendarId: uuid("calendar_id").primaryKey().references(() => calendars.id, { onDelete: "cascade" }),
  openMinute: integer("open_minute").notNull().default(480), closeMinute: integer("close_minute").notNull().default(1320), openDays: integer("open_days").array().notNull(),
  minDuration: integer("min_duration").notNull().default(30), maxDuration: integer("max_duration").notNull().default(240), minNoticeHours: integer("min_notice_hours").notNull().default(0), advanceDays: integer("advance_days").notNull().default(90), cancellationHours: integer("cancellation_hours").notNull().default(0), maxActiveBookings: integer("max_active_bookings").notNull().default(10), requireApproval: boolean("require_approval").notNull().default(false), shareTitles: boolean("share_titles").notNull().default(false),
});
export const facilityResources = pgTable("facility_resources", {
  id: uuid("id").primaryKey().defaultRandom(), calendarId: uuid("calendar_id").notNull().references(() => calendars.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 100 }).notNull(), description: varchar("description", { length: 1000 }).notNull().default(""), location: varchar("location", { length: 160 }).notNull().default(""), capacity: integer("capacity"), active: boolean("active").notNull().default(true), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const facilityBookings = pgTable("facility_bookings", {
  id: uuid("id").primaryKey().defaultRandom(), calendarId: uuid("calendar_id").notNull().references(() => calendars.id, { onDelete: "cascade" }), resourceId: uuid("resource_id").notNull(), userId: uuid("user_id").notNull(), updatedByUserId: uuid("updated_by_user_id").notNull(), requestKey: uuid("request_key").notNull().defaultRandom(), title: varchar("title", { length: 120 }).notNull().default(""), notes: varchar("notes", { length: 2000 }).notNull().default(""), startAt: timestamp("start_at", { withTimezone: true }).notNull(), endAt: timestamp("end_at", { withTimezone: true }).notNull(), status: varchar("status", { length: 16 }).notNull().default("confirmed"), version: integer("version").notNull().default(1), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export const facilityUpdates = pgTable("facility_updates", {
  id: uuid("id").primaryKey().defaultRandom(), calendarId: uuid("calendar_id").notNull().references(() => calendars.id, { onDelete: "cascade" }), bookingId: uuid("booking_id").notNull().references(() => facilityBookings.id, { onDelete: "cascade" }), userId: uuid("user_id").notNull(), action: text("action").notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
