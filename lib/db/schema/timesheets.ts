import { boolean, integer, jsonb, pgTable, timestamp, uuid, varchar, text, unique, primaryKey, foreignKey, uniqueIndex, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { calendars } from "./core";
// Check constraints, partial indexes, generated elapsed duration, protected
// history and SECURITY INVOKER mutation routines are specified in migrations 0036 and 0037.
const instant = (name: string) => timestamp(name, { withTimezone: true });
export const organisations = pgTable("organisations", {
  id: uuid("id").defaultRandom().primaryKey(), calendarId: uuid("calendar_id").notNull().unique().references(() => calendars.id),
  name: varchar("name", { length: 120 }).notNull(), timezone: text("timezone").notNull(), incrementMinutes: integer("increment_minutes").notNull().default(15),
  version: integer("version").notNull().default(1), archivedAt: instant("archived_at"), createdAt: instant("created_at").notNull().defaultNow(), updatedAt: instant("updated_at").notNull().defaultNow(),
});
const orgId = () => uuid("organisation_id").notNull().references(() => organisations.id);
export const organisationMemberships = pgTable("organisation_memberships", {
  id: uuid("id").defaultRandom().primaryKey(), organisationId: orgId(), userId: uuid("user_id").notNull(),
  role: varchar("role", { length: 16 }).$type<"owner" | "manager" | "member">().notNull(), active: boolean("active").notNull().default(true), createdAt: instant("created_at").notNull().defaultNow(),
}, t => [unique().on(t.organisationId, t.userId), unique().on(t.id, t.organisationId)]);
export const timesheetStaffProfiles = pgTable("timesheet_staff_profiles", {
  id: uuid("id").defaultRandom().primaryKey(), organisationId: orgId(), membershipId: uuid("membership_id").unique(),
  displayName: varchar("display_name", { length: 100 }).notNull(), email: varchar("email", { length: 254 }).notNull(),
  inviteRole: varchar("invite_role", { length: 16 }).$type<"member" | "manager">().notNull().default("member"),
  active: boolean("active").notNull().default(true), version: integer("version").notNull().default(1),
  createdAt: instant("created_at").notNull().defaultNow(), updatedAt: instant("updated_at").notNull().defaultNow(),
}, t => [unique().on(t.id, t.organisationId), unique().on(t.organisationId, t.email), foreignKey({ columns: [t.membershipId, t.organisationId], foreignColumns: [organisationMemberships.id, organisationMemberships.organisationId] })]);
export const timesheetManagerAssignments = pgTable("timesheet_manager_assignments", {
  organisationId: orgId(), managerStaffId: uuid("manager_staff_id").notNull(), staffId: uuid("staff_id").notNull(),
}, t => [primaryKey({ columns: [t.managerStaffId, t.staffId] }), foreignKey({ columns: [t.managerStaffId, t.organisationId], foreignColumns: [timesheetStaffProfiles.id, timesheetStaffProfiles.organisationId] }), foreignKey({ columns: [t.staffId, t.organisationId], foreignColumns: [timesheetStaffProfiles.id, timesheetStaffProfiles.organisationId] })]);
export const timesheetClients = pgTable("timesheet_clients", {
  id: uuid("id").defaultRandom().primaryKey(), organisationId: orgId(), name: varchar("name", { length: 120 }).notNull(), active: boolean("active").notNull().default(true), version: integer("version").notNull().default(1),
}, t => [unique().on(t.id, t.organisationId)]);
export const timesheetProjects = pgTable("timesheet_projects", {
  id: uuid("id").defaultRandom().primaryKey(), organisationId: orgId(), clientId: uuid("client_id").notNull(), name: varchar("name", { length: 120 }).notNull(), active: boolean("active").notNull().default(true), version: integer("version").notNull().default(1),
}, t => [unique().on(t.id, t.organisationId), unique().on(t.id, t.clientId, t.organisationId), foreignKey({ columns: [t.clientId, t.organisationId], foreignColumns: [timesheetClients.id, timesheetClients.organisationId] })]);
export const timesheetWorkTypes = pgTable("timesheet_work_types", {
  id: uuid("id").defaultRandom().primaryKey(), organisationId: orgId(), name: varchar("name", { length: 120 }).notNull(),
  active: boolean("active").notNull().default(true), version: integer("version").notNull().default(1),
}, t => [unique().on(t.id, t.organisationId),
  uniqueIndex("timesheet_work_types_org_name_unique").on(t.organisationId, sql`lower(${t.name})`),
  check("timesheet_work_types_name_check", sql`length(trim(${t.name})) BETWEEN 1 AND 120 AND ${t.name}=trim(${t.name})`),
  check("timesheet_work_types_version_check", sql`${t.version}>0`),
]);
export const timesheetInvitations = pgTable("timesheet_invitations", {
  id: uuid("id").defaultRandom().primaryKey(), organisationId: orgId(), staffId: uuid("staff_id").notNull(),
  email: varchar("email", { length: 254 }).notNull(), role: varchar("role", { length: 16 }).$type<"member" | "manager">().notNull(), tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
  createdByUserId: uuid("created_by_user_id").notNull(), expiresAt: instant("expires_at").notNull(), revokedAt: instant("revoked_at"), redeemedAt: instant("redeemed_at"), redeemedByUserId: uuid("redeemed_by_user_id"), createdAt: instant("created_at").notNull().defaultNow(),
}, t => [foreignKey({ columns: [t.staffId, t.organisationId], foreignColumns: [timesheetStaffProfiles.id, timesheetStaffProfiles.organisationId] })]);
export const timesheetEntries = pgTable("timesheet_entries", {
  id: uuid("id").defaultRandom().primaryKey(), organisationId: orgId(), staffId: uuid("staff_id").notNull(), clientId: uuid("client_id"), projectId: uuid("project_id"),
  workTypeId: uuid("work_type_id"), workTypeName: varchar("work_type_name", { length: 120 }),
  startAt: instant("start_at").notNull(), endAt: instant("end_at").notNull(), timezone: text("timezone").notNull(), durationMinutes: integer("duration_minutes").notNull().generatedAlwaysAs(sql`(extract(epoch FROM (end_at - start_at)) / 60)::integer`), incrementMinutes: integer("increment_minutes").notNull(),
  notes: varchar("notes", { length: 4000 }).notNull().default(""), billable: boolean("billable").notNull().default(false), version: integer("version").notNull().default(1), deletedAt: instant("deleted_at"),
  createdByUserId: uuid("created_by_user_id").notNull(), updatedByUserId: uuid("updated_by_user_id").notNull(), createdAt: instant("created_at").notNull().defaultNow(), updatedAt: instant("updated_at").notNull().defaultNow(),
}, t => [unique().on(t.id, t.organisationId), check("timesheet_entries_work_type_snapshot_check", sql`(${t.workTypeId} IS NULL AND ${t.workTypeName} IS NULL) OR (${t.workTypeId} IS NOT NULL AND ${t.workTypeName} IS NOT NULL AND length(trim(${t.workTypeName})) BETWEEN 1 AND 120)`), foreignKey({ name: "timesheet_entries_work_type_tenant_fk", columns: [t.workTypeId, t.organisationId], foreignColumns: [timesheetWorkTypes.id, timesheetWorkTypes.organisationId] }), foreignKey({ columns: [t.staffId, t.organisationId], foreignColumns: [timesheetStaffProfiles.id, timesheetStaffProfiles.organisationId] }), foreignKey({ columns: [t.clientId, t.organisationId], foreignColumns: [timesheetClients.id, timesheetClients.organisationId] }), foreignKey({ columns: [t.projectId, t.clientId, t.organisationId], foreignColumns: [timesheetProjects.id, timesheetProjects.clientId, timesheetProjects.organisationId] })]);
export const timesheetEntryRevisions = pgTable("timesheet_entry_revisions", {
  id: uuid("id").defaultRandom().primaryKey(), organisationId: orgId(), entryId: uuid("entry_id").notNull(), actorUserId: uuid("actor_user_id").notNull(), reason: varchar("reason", { length: 500 }).notNull().default(""), action: varchar("action", { length: 16 }).notNull(), beforeState: jsonb("before_state"), afterState: jsonb("after_state"), createdAt: instant("created_at").notNull().defaultNow(),
}, t => [foreignKey({ columns: [t.entryId, t.organisationId], foreignColumns: [timesheetEntries.id, timesheetEntries.organisationId] })]);
export const timesheetAudit = pgTable("timesheet_audit", {
  id: uuid("id").defaultRandom().primaryKey(), organisationId: orgId(), actorUserId: uuid("actor_user_id").notNull(), action: varchar("action", { length: 64 }).notNull(), entityId: uuid("entity_id"), createdAt: instant("created_at").notNull().defaultNow(),
});
