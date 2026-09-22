import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  pgEnum,
  pgTable,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { calendars, calendarMemberships } from "@/lib/db/schema/core";

export const staffRosterAccessRole = pgEnum("staff_roster_access_role", [
  "owner",
  "manager",
  "staff",
]);

export const staffRosterAvailabilityStatus = pgEnum(
  "staff_roster_availability_status",
  ["available", "unavailable"],
);

export const staffRosterRoles = pgTable(
  "staff_roster_roles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    calendarId: uuid("calendar_id")
      .notNull()
      .references(() => calendars.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 80 }).notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("staff_roster_roles_calendar_name_unique")
      .on(table.calendarId, table.name)
      .where(sql`${table.active} = true`),
    index("staff_roster_roles_calendar_active_idx").on(
      table.calendarId,
      table.active,
    ),
  ],
);

export const staffRosterLocations = pgTable(
  "staff_roster_locations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    calendarId: uuid("calendar_id")
      .notNull()
      .references(() => calendars.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 100 }).notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("staff_roster_locations_calendar_name_unique")
      .on(table.calendarId, table.name)
      .where(sql`${table.active} = true`),
    index("staff_roster_locations_calendar_active_idx").on(
      table.calendarId,
      table.active,
    ),
  ],
);

export const staffRosterMembers = pgTable(
  "staff_roster_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    calendarId: uuid("calendar_id")
      .notNull()
      .references(() => calendars.id, { onDelete: "cascade" }),
    membershipId: uuid("membership_id").references(() => calendarMemberships.id, {
      onDelete: "set null",
    }),
    displayName: varchar("display_name", { length: 80 }).notNull(),
    accessRole: staffRosterAccessRole("access_role").notNull().default("staff"),
    defaultRoleId: uuid("default_role_id").references(() => staffRosterRoles.id, {
      onDelete: "set null",
    }),
    defaultLocationId: uuid("default_location_id").references(
      () => staffRosterLocations.id,
      { onDelete: "set null" },
    ),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("staff_roster_members_membership_unique")
      .on(table.membershipId)
      .where(sql`${table.membershipId} IS NOT NULL`),
    index("staff_roster_members_calendar_active_idx").on(
      table.calendarId,
      table.active,
    ),
    index("staff_roster_members_calendar_role_idx").on(
      table.calendarId,
      table.accessRole,
    ),
  ],
);

export const staffRosterAvailability = pgTable(
  "staff_roster_availability",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    calendarId: uuid("calendar_id")
      .notNull()
      .references(() => calendars.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => staffRosterMembers.id, { onDelete: "cascade" }),
    availabilityDate: date("availability_date", { mode: "string" }).notNull(),
    startTime: time("start_time", { withTimezone: false, precision: 0 }),
    endTime: time("end_time", { withTimezone: false, precision: 0 }),
    status: staffRosterAvailabilityStatus("status").notNull(),
    note: text("note"),
    createdByMembershipId: uuid("created_by_membership_id").references(
      () => calendarMemberships.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check(
      "staff_roster_availability_time_pair_valid",
      sql`(${table.startTime} IS NULL AND ${table.endTime} IS NULL)
        OR
        (${table.startTime} IS NOT NULL AND ${table.endTime} IS NOT NULL AND ${table.endTime} > ${table.startTime})`,
    ),
    index("staff_roster_availability_calendar_date_idx").on(
      table.calendarId,
      table.availabilityDate,
    ),
    index("staff_roster_availability_member_date_idx").on(
      table.memberId,
      table.availabilityDate,
    ),
  ],
);


export const staffRosterSettings = pgTable("staff_roster_settings", {
  calendarId: uuid("calendar_id")
    .primaryKey()
    .references(() => calendars.id, { onDelete: "cascade" }),
  setupCompletedAt: timestamp("setup_completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const staffRosterShifts = pgTable(
  "staff_roster_shifts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    calendarId: uuid("calendar_id")
      .notNull()
      .references(() => calendars.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => staffRosterMembers.id, { onDelete: "restrict" }),
    roleId: uuid("role_id").references(() => staffRosterRoles.id, {
      onDelete: "set null",
    }),
    locationId: uuid("location_id").references(() => staffRosterLocations.id, {
      onDelete: "set null",
    }),
    shiftDate: date("shift_date", { mode: "string" }).notNull(),
    startTime: time("start_time", { withTimezone: false, precision: 0 }).notNull(),
    endTime: time("end_time", { withTimezone: false, precision: 0 }).notNull(),
    note: text("note"),
    availabilityOverride: boolean("availability_override").notNull().default(false),
    createdByMembershipId: uuid("created_by_membership_id").references(
      () => calendarMemberships.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check(
      "staff_roster_shifts_time_valid",
      sql`${table.endTime} > ${table.startTime}`,
    ),
    index("staff_roster_shifts_calendar_date_idx").on(
      table.calendarId,
      table.shiftDate,
    ),
    index("staff_roster_shifts_member_date_idx").on(
      table.memberId,
      table.shiftDate,
      table.startTime,
    ),
  ],
);
