import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { calendarMemberships, calendars, participants } from "@/lib/db/schema/core";

export const proposalAction = pgEnum("proposal_action", ["create", "edit", "delete"]);

export const proposalStatus = pgEnum("proposal_status", [
  "draft",
  "waiting",
  "approved",
  "declined",
  "withdrawn",
]);

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
