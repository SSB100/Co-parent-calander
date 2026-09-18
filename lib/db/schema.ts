import {
  boolean,
  check,
  date,
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
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("children_calendar_idx").on(table.calendarId)],
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
  (table) => [index("recurring_rules_calendar_idx").on(table.calendarId)],
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
