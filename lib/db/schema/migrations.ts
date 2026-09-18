import {
  boolean,
  pgTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

export const schemaMigrations = pgTable("covie_schema_migrations", {
  migrationId: varchar("migration_id", { length: 64 }).primaryKey(),
  description: text("description").notNull(),
  baseline: boolean("baseline").notNull().default(false),
  appliedAt: timestamp("applied_at", { withTimezone: true }).defaultNow().notNull(),
});
