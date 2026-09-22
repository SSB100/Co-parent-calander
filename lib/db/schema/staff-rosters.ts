import { sql } from "drizzle-orm";
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

export const staffRosterMemberRoles = pgTable(
  "staff_roster_member_roles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    calendarId: uuid("calendar_id")
      .notNull()
      .references(() => calendars.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => staffRosterMembers.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => staffRosterRoles.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("staff_roster_member_roles_member_role_unique").on(
      table.memberId,
      table.roleId,
    ),
    index("staff_roster_member_roles_calendar_idx").on(table.calendarId),
    index("staff_roster_member_roles_member_idx").on(table.memberId),
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


export const staffRosterSettings = pgTable(
  "staff_roster_settings",
  {
    calendarId: uuid("calendar_id")
      .primaryKey()
      .references(() => calendars.id, { onDelete: "cascade" }),
    setupCompletedAt: timestamp("setup_completed_at", { withTimezone: true }),
    operationalStartMinute: integer("operational_start_minute")
      .notNull()
      .default(0),
    operationalEndMinute: integer("operational_end_minute")
      .notNull()
      .default(24 * 60),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check(
      "staff_roster_settings_operational_hours_valid",
      sql`${table.operationalStartMinute} >= 0
        AND ${table.operationalEndMinute} <= 1440
        AND ${table.operationalEndMinute} > ${table.operationalStartMinute}`,
    ),
  ],
);

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

export const staffRosterWeekPublications = pgTable(
  "staff_roster_week_publications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    calendarId: uuid("calendar_id")
      .notNull()
      .references(() => calendars.id, { onDelete: "cascade" }),
    weekStart: date("week_start", { mode: "string" }).notNull(),
    revision: integer("revision").notNull().default(1),
    publishedAt: timestamp("published_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    publishedByMembershipId: uuid("published_by_membership_id").references(
      () => calendarMemberships.id,
      { onDelete: "set null" },
    ),
    lastSentAt: timestamp("last_sent_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastSentByMembershipId: uuid("last_sent_by_membership_id").references(
      () => calendarMemberships.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("staff_roster_week_publications_calendar_week_unique").on(
      table.calendarId,
      table.weekStart,
    ),
    index("staff_roster_week_publications_calendar_idx").on(table.calendarId),
  ],
);

export const staffRosterPublishedShifts = pgTable(
  "staff_roster_published_shifts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    publicationId: uuid("publication_id")
      .notNull()
      .references(() => staffRosterWeekPublications.id, { onDelete: "cascade" }),
    sourceShiftId: uuid("source_shift_id"),
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
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check(
      "staff_roster_published_shifts_time_valid",
      sql`${table.endTime} > ${table.startTime}`,
    ),
    uniqueIndex("staff_roster_published_shifts_source_unique")
      .on(table.publicationId, table.sourceShiftId)
      .where(sql`${table.sourceShiftId} IS NOT NULL`),
    index("staff_roster_published_shifts_publication_date_idx").on(
      table.publicationId,
      table.shiftDate,
    ),
    index("staff_roster_published_shifts_member_date_idx").on(
      table.memberId,
      table.shiftDate,
      table.startTime,
    ),
  ],
);

export const staffRosterCorrectionStatus = pgEnum(
  "staff_roster_correction_status",
  ["pending", "approved", "declined", "cancelled"],
);

export const staffRosterLeaveStatus = pgEnum(
  "staff_roster_leave_status",
  ["pending", "approved", "declined", "cancelled"],
);

export const staffRosterClockSessions = pgTable(
  "staff_roster_clock_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    calendarId: uuid("calendar_id")
      .notNull()
      .references(() => calendars.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => staffRosterMembers.id, { onDelete: "restrict" }),
    publishedShiftId: uuid("published_shift_id").references(
      () => staffRosterPublishedShifts.id,
      { onDelete: "set null" },
    ),
    scheduledDate: date("scheduled_date", { mode: "string" }),
    scheduledStartTime: time("scheduled_start_time", {
      withTimezone: false,
      precision: 0,
    }),
    scheduledEndTime: time("scheduled_end_time", {
      withTimezone: false,
      precision: 0,
    }),
    clockInAt: timestamp("clock_in_at", { withTimezone: true }).notNull(),
    clockOutAt: timestamp("clock_out_at", { withTimezone: true }),
    unrostered: boolean("unrostered").notNull().default(false),
    correctedAt: timestamp("corrected_at", { withTimezone: true }),
    correctedByMembershipId: uuid("corrected_by_membership_id").references(
      () => calendarMemberships.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check(
      "staff_roster_clock_sessions_time_valid",
      sql`${table.clockOutAt} IS NULL OR ${table.clockOutAt} > ${table.clockInAt}`,
    ),
    check(
      "staff_roster_clock_sessions_schedule_pair_valid",
      sql`(${table.scheduledStartTime} IS NULL AND ${table.scheduledEndTime} IS NULL)
        OR
        (${table.scheduledStartTime} IS NOT NULL AND ${table.scheduledEndTime} IS NOT NULL AND ${table.scheduledEndTime} > ${table.scheduledStartTime})`,
    ),
    uniqueIndex("staff_roster_clock_sessions_member_active_unique")
      .on(table.memberId)
      .where(sql`${table.clockOutAt} IS NULL`),
    index("staff_roster_clock_sessions_calendar_clock_in_idx").on(
      table.calendarId,
      table.clockInAt,
    ),
    index("staff_roster_clock_sessions_member_clock_in_idx").on(
      table.memberId,
      table.clockInAt,
    ),
  ],
);

export const staffRosterTimesheetCorrections = pgTable(
  "staff_roster_timesheet_corrections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    calendarId: uuid("calendar_id")
      .notNull()
      .references(() => calendars.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => staffRosterMembers.id, { onDelete: "restrict" }),
    clockSessionId: uuid("clock_session_id")
      .notNull()
      .references(() => staffRosterClockSessions.id, { onDelete: "cascade" }),
    requestedClockInAt: timestamp("requested_clock_in_at", { withTimezone: true }),
    requestedClockOutAt: timestamp("requested_clock_out_at", { withTimezone: true }),
    reason: text("reason").notNull(),
    status: staffRosterCorrectionStatus("status").notNull().default("pending"),
    reviewedByMembershipId: uuid("reviewed_by_membership_id").references(
      () => calendarMemberships.id,
      { onDelete: "set null" },
    ),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check(
      "staff_roster_timesheet_corrections_requested_time_valid",
      sql`${table.requestedClockInAt} IS NOT NULL OR ${table.requestedClockOutAt} IS NOT NULL`,
    ),
    index("staff_roster_timesheet_corrections_calendar_status_idx").on(
      table.calendarId,
      table.status,
    ),
    index("staff_roster_timesheet_corrections_member_created_idx").on(
      table.memberId,
      table.createdAt,
    ),
  ],
);

export const staffRosterLeaveRequests = pgTable(
  "staff_roster_leave_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    calendarId: uuid("calendar_id")
      .notNull()
      .references(() => calendars.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => staffRosterMembers.id, { onDelete: "restrict" }),
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }).notNull(),
    allDay: boolean("all_day").notNull().default(true),
    startTime: time("start_time", { withTimezone: false, precision: 0 }),
    endTime: time("end_time", { withTimezone: false, precision: 0 }),
    note: text("note"),
    status: staffRosterLeaveStatus("status").notNull().default("pending"),
    reviewedByMembershipId: uuid("reviewed_by_membership_id").references(
      () => calendarMemberships.id,
      { onDelete: "set null" },
    ),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check(
      "staff_roster_leave_requests_date_valid",
      sql`${table.endDate} >= ${table.startDate}`,
    ),
    check(
      "staff_roster_leave_requests_time_valid",
      sql`(${table.allDay} = true AND ${table.startTime} IS NULL AND ${table.endTime} IS NULL)
        OR
        (${table.allDay} = false AND ${table.startTime} IS NOT NULL AND ${table.endTime} IS NOT NULL AND ${table.endTime} > ${table.startTime})`,
    ),
    index("staff_roster_leave_requests_calendar_status_idx").on(
      table.calendarId,
      table.status,
    ),
    index("staff_roster_leave_requests_member_date_idx").on(
      table.memberId,
      table.startDate,
      table.endDate,
    ),
  ],
);

export const staffRosterInvites = pgTable(
  "staff_roster_invites",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    calendarId: uuid("calendar_id")
      .notNull()
      .references(() => calendars.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => staffRosterMembers.id, { onDelete: "cascade" }),
    codeHash: varchar("code_hash", { length: 64 }).notNull(),
    codeHint: varchar("code_hint", { length: 8 }).notNull(),
    createdByMembershipId: uuid("created_by_membership_id").references(
      () => calendarMemberships.id,
      { onDelete: "set null" },
    ),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    redeemedByMembershipId: uuid("redeemed_by_membership_id").references(
      () => calendarMemberships.id,
      { onDelete: "set null" },
    ),
    redeemedAt: timestamp("redeemed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("staff_roster_invites_code_hash_unique").on(table.codeHash),
    index("staff_roster_invites_calendar_member_idx").on(
      table.calendarId,
      table.memberId,
    ),
    index("staff_roster_invites_calendar_active_idx").on(
      table.calendarId,
      table.revokedAt,
      table.redeemedAt,
    ),
  ],
);

export const staffRosterUpdates = pgTable(
  "staff_roster_updates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    calendarId: uuid("calendar_id")
      .notNull()
      .references(() => calendars.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => staffRosterMembers.id, { onDelete: "cascade" }),
    publicationId: uuid("publication_id")
      .notNull()
      .references(() => staffRosterWeekPublications.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 32 }).notNull(),
    title: varchar("title", { length: 160 }).notNull(),
    beforeSummary: text("before_summary"),
    afterSummary: text("after_summary"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("staff_roster_updates_calendar_created_idx").on(
      table.calendarId,
      table.createdAt,
    ),
    index("staff_roster_updates_member_created_idx").on(
      table.memberId,
      table.createdAt,
    ),
  ],
);

