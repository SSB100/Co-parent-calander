import {
  boolean,
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

export const participantRole = pgEnum("participant_role", ["parent"]);

export const parentProfileSlot = pgEnum("parent_profile_slot", [
  "parent_one",
  "parent_two",
]);

export const calendarPermission = pgEnum("calendar_permission", [
  "owner",
  "editor",
  "viewer",
]);

export const calendarType = pgEnum("calendar_type", [
  "co_parenting",
  "staff_rosters",
  "shared_facilities",
  "social_groups",
]);

export const calendars = pgTable(
  "calendars",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    type: calendarType("calendar_type").notNull().default("co_parenting"),
    timezone: text("timezone").notNull().default("Pacific/Auckland"),
    shareEnabled: boolean("share_enabled").notNull().default(false),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("calendars_archived_at_idx").on(table.archivedAt)],
);

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
    profileSlot: parentProfileSlot("profile_slot"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("participants_calendar_idx").on(table.calendarId),
    uniqueIndex("participants_calendar_profile_slot_unique")
      .on(table.calendarId, table.profileSlot)
      .where(sql`${table.profileSlot} IS NOT NULL`),
  ],
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
