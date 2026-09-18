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

export const storageCleanupStatus = pgEnum("storage_cleanup_status", [
  "pending",
  "processing",
  "retry",
]);

export const storageCleanupJobs = pgTable(
  "storage_cleanup_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    storageProvider: varchar("storage_provider", { length: 32 })
      .notNull()
      .default("vercel_blob"),
    storageKey: text("storage_key").notNull(),
    status: storageCleanupStatus("status").notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    availableAt: timestamp("available_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    lastAttemptedAt: timestamp("last_attempted_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check("storage_cleanup_attempt_count_valid", sql`${table.attemptCount} >= 0`),
    check(
      "storage_cleanup_lease_state_valid",
      sql`(${table.status} = 'processing' AND ${table.leaseExpiresAt} IS NOT NULL) OR (${table.status} <> 'processing' AND ${table.leaseExpiresAt} IS NULL)`,
    ),
    uniqueIndex("storage_cleanup_provider_key_unique").on(
      table.storageProvider,
      table.storageKey,
    ),
    index("storage_cleanup_due_idx").on(
      table.status,
      table.availableAt,
      table.createdAt,
    ),
  ],
);
