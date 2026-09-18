import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const accessTokenType = pgEnum("access_token_type", ["editor", "viewer"]);
export const assignmentSource = pgEnum("assignment_source", ["manual", "recurring"]);
export const participantRole = pgEnum("participant_role", ["parent"]);
export const eventCategory = pgEnum("event_category", [
  "school",
  "sport",
  "medical",
  "birthday",
  "holiday",
  "activity",
  "other",
]);
export const eventRecurrence = pgEnum("event_recurrence", [
  "none",
  "weekly",
  "fortnightly",
  "monthly",
  "yearly",
]);

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

export const responsibilityCategory = pgEnum("responsibility_category", [
  "school",
  "medical",
  "sport",
  "activity",
  "transport",
  "shopping",
  "forms_permissions",
  "appointment",
  "home_admin",
  "other",
]);
export const responsibilityRecurrence = pgEnum("responsibility_recurrence", [
  "none",
  "weekly",
  "fortnightly",
  "monthly",
  "yearly",
]);
export const calendarPermission = pgEnum("calendar_permission", [
  "owner",
  "editor",
  "viewer",
]);
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

export const proposalAction = pgEnum("proposal_action", ["create", "edit", "delete"]);
export const proposalStatus = pgEnum("proposal_status", [
  "draft",
  "waiting",
  "approved",
  "declined",
  "withdrawn",
]);

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
export const linkedEntityType = pgEnum("linked_entity_type", [
  "event",
  "expense",
  "responsibility",
  "child",
]);

export const schemaMigrations = pgTable("covie_schema_migrations", {
  migrationId: varchar("migration_id", { length: 64 }).primaryKey(),
  description: text("description").notNull(),
  baseline: boolean("baseline").notNull().default(false),
  appliedAt: timestamp("applied_at", { withTimezone: true }).defaultNow().notNull(),
});

export const calendars = pgTable("calendars", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  timezone: text("timezone").notNull().default("Pacific/Auckland"),
  shareEnabled: boolean("share_enabled").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const participants = pgTable(
  "participants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    calendarId: uuid("calendar_id")
      .notNull()
      .references(() => calendars.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    role: participantRole("role").notNull().default("parent"),
    colorKey: varchar("color_key", { length: 32 }).notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("participants_calendar_idx").on(table.calendarId)],
);

export const calendarMemberships = pgTable(
  "calendar_memberships",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    calendarId: uuid("calendar_id")
      .notNull()
      .references(() => calendars.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
    participantId: uuid("participant_id").references(() => participants.id, {
      onDelete: "set null",
    }),
    permission: calendarPermission("permission").notNull().default("editor"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("calendar_membership_user_unique").on(table.calendarId, table.userId),
    uniqueIndex("calendar_membership_participant_unique").on(table.participantId),
    uniqueIndex("calendar_single_owner_unique")
      .on(table.calendarId)
      .where(sql`${table.permission} = 'owner'`),
    index("calendar_membership_user_idx").on(table.userId),
    index("calendar_membership_calendar_idx").on(table.calendarId),
  ],
);

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

export const calendarInvites = pgTable(
  "calendar_invites",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    calendarId: uuid("calendar_id")
      .notNull()
      .references(() => calendars.id, { onDelete: "cascade" }),
    codeHash: varchar("code_hash", { length: 64 }).notNull(),
    codeHint: varchar("code_hint", { length: 8 }).notNull(),
    permission: calendarPermission("permission").notNull().default("editor"),
    createdByUserId: uuid("created_by_user_id").notNull(),
    maxUses: integer("max_uses").notNull().default(1),
    useCount: integer("use_count").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    redeemedByUserId: uuid("redeemed_by_user_id"),
    redeemedAt: timestamp("redeemed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check(
      "calendar_invites_usage_valid",
      sql`${table.maxUses} >= 1 AND ${table.useCount} >= 0 AND ${table.useCount} <= ${table.maxUses}`,
    ),
    uniqueIndex("calendar_invites_code_hash_unique").on(table.codeHash),
    index("calendar_invites_calendar_idx").on(table.calendarId),
  ],
);

export const children = pgTable(
  "children",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    calendarId: uuid("calendar_id")
      .notNull()
      .references(() => calendars.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    fullName: text("full_name"),
    dateOfBirth: date("date_of_birth", { mode: "string" }),
    schoolName: text("school_name"),
    yearClass: text("year_class"),
    teacherName: text("teacher_name"),
    schoolPhone: text("school_phone"),
    schoolEmail: text("school_email"),
    studentId: text("student_id"),
    careDetails: text("care_details"),
    schoolNotes: text("school_notes"),
    gpName: text("gp_name"),
    dentistName: text("dentist_name"),
    allergies: text("allergies"),
    medications: text("medications"),
    medicalNotes: text("medical_notes"),
    nhiNumber: text("nhi_number"),
    clothingSize: text("clothing_size"),
    shoeSize: text("shoe_size"),
    uniformSize: text("uniform_size"),
    practicalNotes: text("practical_notes"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("children_calendar_idx").on(table.calendarId)],
);

export const childActivities = pgTable(
  "child_activities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    calendarId: uuid("calendar_id")
      .notNull()
      .references(() => calendars.id, { onDelete: "cascade" }),
    childId: uuid("child_id")
      .notNull()
      .references(() => children.id, { onDelete: "cascade" }),
    activityName: text("activity_name").notNull(),
    organisation: text("organisation"),
    contactName: text("contact_name"),
    contactDetails: text("contact_details"),
    location: text("location"),
    scheduleInfo: text("schedule_info"),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => participants.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("child_activities_calendar_child_idx").on(
      table.calendarId,
      table.childId,
      table.createdAt,
    ),
    index("child_activities_child_idx").on(table.childId),
  ],
);

export const accessTokens = pgTable(
  "access_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    calendarId: uuid("calendar_id")
      .notNull()
      .references(() => calendars.id, { onDelete: "cascade" }),
    participantId: uuid("participant_id").references(() => participants.id, {
      onDelete: "cascade",
    }),
    type: accessTokenType("type").notNull(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("access_tokens_hash_unique").on(table.tokenHash),
    index("access_tokens_calendar_idx").on(table.calendarId),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    calendarId: uuid("calendar_id")
      .notNull()
      .references(() => calendars.id, { onDelete: "cascade" }),
    participantId: uuid("participant_id")
      .notNull()
      .references(() => participants.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("sessions_hash_unique").on(table.tokenHash),
    index("sessions_calendar_idx").on(table.calendarId),
    index("sessions_participant_idx").on(table.participantId),
  ],
);

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

export const events = pgTable(
  "events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    calendarId: uuid("calendar_id")
      .notNull()
      .references(() => calendars.id, { onDelete: "cascade" }),
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }),
    title: text("title").notNull(),
    description: text("description"),
    category: eventCategory("category").notNull().default("other"),
    recurrence: eventRecurrence("recurrence").notNull().default("none"),
    recurrenceEndDate: date("recurrence_end_date", { mode: "string" }),
    createdBy: uuid("created_by").references(() => participants.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check(
      "events_end_date_valid",
      sql`${table.endDate} IS NULL OR ${table.endDate} >= ${table.startDate}`,
    ),
    check(
      "events_recurrence_end_valid",
      sql`${table.recurrenceEndDate} IS NULL OR ${table.recurrenceEndDate} >= ${table.startDate}`,
    ),
    index("events_calendar_date_idx").on(table.calendarId, table.startDate),
    index("events_calendar_recurrence_idx").on(
      table.calendarId,
      table.recurrence,
      table.recurrenceEndDate,
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
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check("expense_shares_non_negative", sql`${table.shareCents} >= 0`),
    uniqueIndex("expense_share_participant_unique").on(table.expenseId, table.participantId),
    index("expense_shares_participant_idx").on(table.participantId, table.expenseId),
  ],
);

export const responsibilities = pgTable(
  "responsibilities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    calendarId: uuid("calendar_id")
      .notNull()
      .references(() => calendars.id, { onDelete: "cascade" }),
    seriesId: uuid("series_id").notNull(),
    title: text("title").notNull(),
    responsibleParticipantId: uuid("responsible_participant_id")
      .notNull()
      .references(() => participants.id, { onDelete: "restrict" }),
    dueDate: date("due_date", { mode: "string" }).notNull(),
    dueTime: time("due_time"),
    category: responsibilityCategory("category").notNull().default("other"),
    note: text("note"),
    recurrence: responsibilityRecurrence("recurrence").notNull().default("none"),
    recurrenceEndDate: date("recurrence_end_date", { mode: "string" }),
    linkedEventId: uuid("linked_event_id").references(() => events.id, { onDelete: "set null" }),
    linkedExpenseId: uuid("linked_expense_id").references(() => expenses.id, { onDelete: "set null" }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    completedByParticipantId: uuid("completed_by_participant_id").references(
      () => participants.id,
      { onDelete: "set null" },
    ),
    nextOccurrenceId: uuid("next_occurrence_id"),
    createdBy: uuid("created_by").references(() => participants.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check(
      "responsibility_recurrence_end_valid",
      sql`${table.recurrenceEndDate} IS NULL OR ${table.recurrenceEndDate} >= ${table.dueDate}`,
    ),
    index("responsibilities_calendar_due_idx").on(table.calendarId, table.dueDate),
    index("responsibilities_calendar_completion_idx").on(
      table.calendarId,
      table.completedAt,
      table.dueDate,
    ),
    index("responsibilities_responsible_due_idx").on(
      table.responsibleParticipantId,
      table.completedAt,
      table.dueDate,
    ),
    index("responsibilities_series_idx").on(table.calendarId, table.seriesId, table.dueDate),
    foreignKey({
      name: "responsibilities_next_occurrence_id_fk",
      columns: [table.nextOccurrenceId],
      foreignColumns: [table.id],
    }).onDelete("set null"),
    index("responsibilities_next_occurrence_idx").on(table.nextOccurrenceId),
    index("responsibilities_linked_event_idx").on(table.linkedEventId),
    index("responsibilities_linked_expense_idx").on(table.linkedExpenseId),
  ],
);

export const responsibilityChildren = pgTable(
  "responsibility_children",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    responsibilityId: uuid("responsibility_id")
      .notNull()
      .references(() => responsibilities.id, { onDelete: "cascade" }),
    childId: uuid("child_id")
      .notNull()
      .references(() => children.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("responsibility_child_unique").on(table.responsibilityId, table.childId),
    index("responsibility_children_child_idx").on(table.childId, table.responsibilityId),
  ],
);

export const entityLinks = pgTable(
  "entity_links",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    calendarId: uuid("calendar_id")
      .notNull()
      .references(() => calendars.id, { onDelete: "cascade" }),
    leftType: linkedEntityType("left_type").notNull(),
    leftId: uuid("left_id").notNull(),
    rightType: linkedEntityType("right_type").notNull(),
    rightId: uuid("right_id").notNull(),
    createdBy: uuid("created_by").references(() => participants.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check(
      "entity_link_not_self",
      sql`NOT (${table.leftType} = ${table.rightType} AND ${table.leftId} = ${table.rightId})`,
    ),
    check(
      "entity_link_canonical",
      sql`${table.leftType} < ${table.rightType} OR (${table.leftType} = ${table.rightType} AND ${table.leftId}::text < ${table.rightId}::text)`,
    ),
    uniqueIndex("entity_links_unique").on(
      table.calendarId,
      table.leftType,
      table.leftId,
      table.rightType,
      table.rightId,
    ),
    index("entity_links_left_idx").on(
      table.calendarId,
      table.leftType,
      table.leftId,
    ),
    index("entity_links_right_idx").on(
      table.calendarId,
      table.rightType,
      table.rightId,
    ),
  ],
);

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

export const approvalProposals = pgTable(
  "approval_proposals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    calendarId: uuid("calendar_id")
      .notNull()
      .references(() => calendars.id, { onDelete: "cascade" }),
    entityType: varchar("entity_type", { length: 64 }).notNull(),
    entityId: varchar("entity_id", { length: 255 }).notNull(),
    action: proposalAction("action").notNull(),
    proposedByMembershipId: uuid("proposed_by_membership_id")
      .notNull()
      .references(() => calendarMemberships.id, { onDelete: "restrict" }),
    proposedByParticipantId: uuid("proposed_by_participant_id").references(
      () => participants.id,
      { onDelete: "set null" },
    ),
    approverMembershipId: uuid("approver_membership_id").references(
      () => calendarMemberships.id,
      { onDelete: "restrict" },
    ),
    approverParticipantId: uuid("approver_participant_id").references(
      () => participants.id,
      { onDelete: "set null" },
    ),
    reason: text("reason"),
    previousState: jsonb("previous_state"),
    proposedState: jsonb("proposed_state"),
    status: proposalStatus("status").notNull().default("draft"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    declineReason: text("decline_reason"),
    withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("approval_proposals_calendar_status_idx").on(table.calendarId, table.status),
    index("approval_proposals_entity_idx").on(
      table.calendarId,
      table.entityType,
      table.entityId,
    ),
    index("approval_proposals_approver_idx").on(table.approverMembershipId, table.status),
    uniqueIndex("approval_proposal_waiting_entity_unique")
      .on(table.calendarId, table.entityType, table.entityId)
      .where(sql`${table.status} = 'waiting'`),
  ],
);

export const approvalProposalHistory = pgTable(
  "approval_proposal_history",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    proposalId: uuid("proposal_id")
      .notNull()
      .references(() => approvalProposals.id, { onDelete: "cascade" }),
    calendarId: uuid("calendar_id")
      .notNull()
      .references(() => calendars.id, { onDelete: "cascade" }),
    actorMembershipId: uuid("actor_membership_id").references(
      () => calendarMemberships.id,
      { onDelete: "set null" },
    ),
    actorParticipantId: uuid("actor_participant_id").references(
      () => participants.id,
      { onDelete: "set null" },
    ),
    eventType: varchar("event_type", { length: 64 }).notNull(),
    fromStatus: proposalStatus("from_status"),
    toStatus: proposalStatus("to_status"),
    details: jsonb("details"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("approval_history_proposal_time_idx").on(table.proposalId, table.occurredAt),
    index("approval_history_calendar_time_idx").on(table.calendarId, table.occurredAt),
  ],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    calendarId: uuid("calendar_id")
      .notNull()
      .references(() => calendars.id, { onDelete: "cascade" }),
    actorParticipantId: uuid("actor_participant_id").references(() => participants.id, {
      onDelete: "set null",
    }),
    action: varchar("action", { length: 64 }).notNull(),
    entityType: varchar("entity_type", { length: 64 }).notNull(),
    entityId: uuid("entity_id"),
    beforeState: jsonb("before_state"),
    afterState: jsonb("after_state"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("audit_calendar_time_idx").on(table.calendarId, table.occurredAt),
    index("audit_entity_idx").on(table.entityType, table.entityId),
  ],
);
