import { boolean, integer, jsonb, pgTable, timestamp, uuid, varchar, primaryKey, foreignKey, unique, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { calendars, calendarInvites } from "./core";

// Composite tenant FKs, conditional indexes, immutable booked terms and the
// serialized SECURITY INVOKER mutation functions are defined in migration 0035.
const instant = (name: string) => timestamp(name, { withTimezone: true });
const calendarId = () => uuid("calendar_id").notNull().references(() => calendars.id, { onDelete: "cascade" });

export const salonSettings = pgTable("salon_settings", {
  calendarId: calendarId().primaryKey(),
  businessName: varchar("business_name", { length: 120 }).notNull().default(""),
  description: varchar("description", { length: 1000 }).notNull().default(""),
  location: varchar("location", { length: 200 }).notNull().default(""),
  publicEnabled: boolean("public_enabled").notNull().default(false),
  leadMinutes: integer("lead_minutes").notNull().default(60),
  advanceDays: integer("advance_days").notNull().default(90),
  slotMinutes: integer("slot_minutes").notNull().default(15),
  cancellationHours: integer("cancellation_hours").notNull().default(24),
  updatedAt: instant("updated_at").notNull().defaultNow(),
}, table => [
  check("salon_settings_lead_minutes_check", sql`${table.leadMinutes} BETWEEN 0 AND 43200`),
  check("salon_settings_advance_days_check", sql`${table.advanceDays} BETWEEN 1 AND 365`),
  check("salon_settings_slot_minutes_check", sql`${table.slotMinutes} IN (5,10,15,20,30,60)`),
  check("salon_settings_cancellation_hours_check", sql`${table.cancellationHours} BETWEEN 0 AND 720`),
]);

export const salonPractitioners = pgTable("salon_practitioners", {
  id: uuid("id").defaultRandom().primaryKey(),
  calendarId: calendarId(),
  // ON DELETE SET NULL (user_id) retains this stable practitioner and their
  // history when their composite Core membership is revoked.
  userId: uuid("user_id"),
  role: varchar("role", { length: 16 }).$type<"owner" | "manager" | "practitioner">().notNull(),
  displayName: varchar("display_name", { length: 100 }).notNull(),
  bio: varchar("bio", { length: 500 }).notNull().default(""),
  kind: varchar("kind", { length: 16 }).$type<"staff" | "contractor">().notNull().default("staff"),
  active: boolean("active").notNull().default(true),
  bookable: boolean("bookable").notNull().default(false),
  createdAt: instant("created_at").notNull().defaultNow(),
  updatedAt: instant("updated_at").notNull().defaultNow(),
}, table => [
  unique("salon_practitioners_id_calendar_id_key").on(table.id, table.calendarId),
  unique("salon_practitioners_calendar_id_user_id_key").on(table.calendarId, table.userId),
  index("salon_practitioners_user_idx").on(table.userId).where(sql`${table.userId} IS NOT NULL`),
  check("salon_practitioners_role_check", sql`${table.role} IN ('owner','manager','practitioner')`),
  check("salon_practitioners_kind_check", sql`${table.kind} IN ('staff','contractor')`),
  check("salon_practitioners_display_name_check", sql`length(trim(${table.displayName})) > 0`),
]);

export const salonServices = pgTable("salon_services", {
  id: uuid("id").defaultRandom().primaryKey(),
  calendarId: calendarId(),
  name: varchar("name", { length: 120 }).notNull(),
  description: varchar("description", { length: 1000 }).notNull().default(""),
  durationMinutes: integer("duration_minutes").notNull(),
  bufferBeforeMinutes: integer("buffer_before_minutes").notNull().default(0),
  bufferAfterMinutes: integer("buffer_after_minutes").notNull().default(0),
  priceMinor: integer("price_minor"),
  currency: varchar("currency", { length: 3 }).notNull().default("NZD"),
  active: boolean("active").notNull().default(true),
  bookable: boolean("bookable").notNull().default(false),
  createdAt: instant("created_at").notNull().defaultNow(),
  updatedAt: instant("updated_at").notNull().defaultNow(),
}, table => [
  unique("salon_services_id_calendar_id_key").on(table.id, table.calendarId),
  index("salon_services_calendar_idx").on(table.calendarId),
  check("salon_services_name_check", sql`length(trim(${table.name})) > 0`),
  check("salon_services_duration_minutes_check", sql`${table.durationMinutes} BETWEEN 5 AND 720`),
  check("salon_services_buffer_before_minutes_check", sql`${table.bufferBeforeMinutes} BETWEEN 0 AND 240`),
  check("salon_services_buffer_after_minutes_check", sql`${table.bufferAfterMinutes} BETWEEN 0 AND 240`),
  check("salon_services_price_minor_check", sql`${table.priceMinor} BETWEEN 0 AND 10000000`),
  check("salon_services_currency_check", sql`${table.currency} ~ '^[A-Z]{3}$'`),
]);

export const salonPractitionerServices = pgTable("salon_practitioner_services", {
  calendarId: calendarId(),
  practitionerId: uuid("practitioner_id").notNull(),
  serviceId: uuid("service_id").notNull(),
  active: boolean("active").notNull().default(true),
}, table => [
  primaryKey({ columns: [table.practitionerId, table.serviceId] }),
  foreignKey({ columns: [table.practitionerId, table.calendarId], foreignColumns: [salonPractitioners.id, salonPractitioners.calendarId] }),
  foreignKey({ columns: [table.serviceId, table.calendarId], foreignColumns: [salonServices.id, salonServices.calendarId] }),
  index("salon_practitioner_services_calendar_idx").on(table.calendarId),
]);

export const salonWorkingHours = pgTable("salon_working_hours", {
  id: uuid("id").defaultRandom().primaryKey(),
  calendarId: calendarId(),
  practitionerId: uuid("practitioner_id").notNull(),
  weekday: integer("weekday").notNull(),
  startMinute: integer("start_minute").notNull(),
  endMinute: integer("end_minute").notNull(),
  active: boolean("active").notNull().default(true),
}, table => [
  foreignKey({ columns: [table.practitionerId, table.calendarId], foreignColumns: [salonPractitioners.id, salonPractitioners.calendarId] }),
  unique("salon_working_hours_practitioner_id_weekday_start_minute_end_m_key").on(table.practitionerId, table.weekday, table.startMinute, table.endMinute),
  index("salon_working_hours_calendar_idx").on(table.calendarId, table.practitionerId).where(sql`${table.active}`),
  check("salon_working_hours_weekday_check", sql`${table.weekday} BETWEEN 0 AND 6`),
  check("salon_working_hours_start_minute_check", sql`${table.startMinute} BETWEEN 0 AND 1439`),
  check("salon_working_hours_end_minute_check", sql`${table.endMinute} BETWEEN 1 AND 1440`),
  check("salon_working_hours_check", sql`${table.endMinute} > ${table.startMinute}`),
]);

export const salonTimeBlocks = pgTable("salon_time_blocks", {
  id: uuid("id").defaultRandom().primaryKey(),
  calendarId: calendarId(),
  practitionerId: uuid("practitioner_id").notNull(),
  startAt: instant("start_at").notNull(),
  endAt: instant("end_at").notNull(),
  reason: varchar("reason", { length: 500 }).notNull().default(""),
  active: boolean("active").notNull().default(true),
  createdByUserId: uuid("created_by_user_id").notNull(),
  updatedByUserId: uuid("updated_by_user_id").notNull(),
  createdAt: instant("created_at").notNull().defaultNow(),
  updatedAt: instant("updated_at").notNull().defaultNow(),
}, table => [
  foreignKey({ columns: [table.practitionerId, table.calendarId], foreignColumns: [salonPractitioners.id, salonPractitioners.calendarId] }),
  index("salon_time_blocks_practitioner_time_idx").on(table.calendarId, table.practitionerId, table.startAt).where(sql`${table.active}`),
  check("salon_time_blocks_check", sql`${table.endAt} > ${table.startAt} AND isfinite(${table.startAt}) AND isfinite(${table.endAt})`),
]);

export const salonAppointments = pgTable("salon_appointments", {
  id: uuid("id").defaultRandom().primaryKey(),
  calendarId: calendarId(),
  practitionerId: uuid("practitioner_id").notNull(),
  serviceId: uuid("service_id").notNull(),
  clientUserId: uuid("client_user_id"),
  createdByUserId: uuid("created_by_user_id").notNull(),
  updatedByUserId: uuid("updated_by_user_id").notNull(),
  requestKey: uuid("request_key").notNull(),
  requestPayload: jsonb("request_payload").$type<Record<string, unknown>>().notNull(),
  clientName: varchar("client_name", { length: 100 }).notNull(),
  clientEmail: varchar("client_email", { length: 254 }).notNull().default(""),
  clientPhone: varchar("client_phone", { length: 40 }).notNull().default(""),
  notes: varchar("notes", { length: 2000 }).notNull().default(""),
  serviceName: varchar("service_name", { length: 120 }).notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  bufferBeforeMinutes: integer("buffer_before_minutes").notNull(),
  bufferAfterMinutes: integer("buffer_after_minutes").notNull(),
  priceMinor: integer("price_minor"),
  currency: varchar("currency", { length: 3 }).notNull(),
  cancellationHours: integer("cancellation_hours").notNull(),
  startAt: instant("start_at").notNull(),
  endAt: instant("end_at").notNull(),
  busyStartAt: instant("busy_start_at").notNull(),
  busyEndAt: instant("busy_end_at").notNull(),
  status: varchar("status", { length: 16 }).$type<"confirmed" | "cancelled">().notNull().default("confirmed"),
  version: integer("version").notNull().default(1),
  createdAt: instant("created_at").notNull().defaultNow(),
  updatedAt: instant("updated_at").notNull().defaultNow(),
}, table => [
  unique("salon_appointments_id_calendar_id_key").on(table.id, table.calendarId),
  unique("salon_appointments_calendar_id_created_by_user_id_request_key_key").on(table.calendarId, table.createdByUserId, table.requestKey),
  foreignKey({ columns: [table.practitionerId, table.calendarId], foreignColumns: [salonPractitioners.id, salonPractitioners.calendarId] }),
  foreignKey({ columns: [table.serviceId, table.calendarId], foreignColumns: [salonServices.id, salonServices.calendarId] }),
  index("salon_appointments_calendar_time_idx").on(table.calendarId, table.startAt),
  index("salon_appointments_practitioner_time_idx").on(table.calendarId, table.practitionerId, table.busyStartAt).where(sql`${table.status}='confirmed'`),
  index("salon_appointments_client_time_idx").on(table.clientUserId, table.startAt).where(sql`${table.clientUserId} IS NOT NULL`),
  check("salon_appointments_client_name_check", sql`length(trim(${table.clientName})) > 0`),
  check("salon_appointments_duration_minutes_check", sql`${table.durationMinutes} BETWEEN 5 AND 720`),
  check("salon_appointments_buffer_before_minutes_check", sql`${table.bufferBeforeMinutes} BETWEEN 0 AND 240`),
  check("salon_appointments_buffer_after_minutes_check", sql`${table.bufferAfterMinutes} BETWEEN 0 AND 240`),
  check("salon_appointments_price_minor_check", sql`${table.priceMinor} BETWEEN 0 AND 10000000`),
  check("salon_appointments_currency_check", sql`${table.currency} ~ '^[A-Z]{3}$'`),
  check("salon_appointments_cancellation_hours_check", sql`${table.cancellationHours} BETWEEN 0 AND 720`),
  check("salon_appointments_status_check", sql`${table.status} IN ('confirmed','cancelled')`),
  check("salon_appointments_version_check", sql`${table.version} >= 1`),
  check("salon_appointment_time_valid", sql`isfinite(${table.startAt}) AND isfinite(${table.endAt}) AND isfinite(${table.busyStartAt}) AND isfinite(${table.busyEndAt}) AND ${table.endAt}=${table.startAt}+${table.durationMinutes}*interval '1 minute' AND ${table.busyStartAt}=${table.startAt}-${table.bufferBeforeMinutes}*interval '1 minute' AND ${table.busyEndAt}=${table.endAt}+${table.bufferAfterMinutes}*interval '1 minute'`),
]);

export const salonUpdates = pgTable("salon_updates", {
  id: uuid("id").defaultRandom().primaryKey(),
  calendarId: calendarId(),
  appointmentId: uuid("appointment_id").notNull(),
  userId: uuid("user_id").notNull(),
  action: varchar("action", { length: 40 }).$type<"created" | "rescheduled" | "cancelled">().notNull(),
  version: integer("version").notNull(),
  previousStartAt: instant("previous_start_at"),
  startAt: instant("start_at").notNull(),
  createdAt: instant("created_at").notNull().defaultNow(),
}, table => [
  foreignKey({ columns: [table.appointmentId, table.calendarId], foreignColumns: [salonAppointments.id, salonAppointments.calendarId] }),
  index("salon_updates_calendar_created_idx").on(table.calendarId, table.createdAt),
  uniqueIndex("salon_updates_appointment_version_unique").on(table.appointmentId, table.version),
  check("salon_updates_action_check", sql`${table.action} IN ('created','rescheduled','cancelled')`),
]);

export const salonInviteRoles = pgTable("salon_invite_roles", {
  inviteId: uuid("invite_id").primaryKey(),
  calendarId: calendarId(),
  role: varchar("role", { length: 16 }).$type<"manager" | "practitioner">().notNull(),
  displayName: varchar("display_name", { length: 100 }).notNull(),
  kind: varchar("kind", { length: 16 }).$type<"staff" | "contractor">().notNull().default("staff"),
}, table => [
  foreignKey({ columns: [table.inviteId, table.calendarId], foreignColumns: [calendarInvites.id, calendarInvites.calendarId] }).onDelete("cascade"),
  index("salon_invite_roles_calendar_idx").on(table.calendarId),
  check("salon_invite_roles_role_check", sql`${table.role} IN ('manager','practitioner')`),
  check("salon_invite_roles_kind_check", sql`${table.kind} IN ('staff','contractor')`),
  check("salon_invite_roles_display_name_check", sql`length(trim(${table.displayName})) > 0`),
]);
