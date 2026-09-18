import {
  index,
  jsonb,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { calendars, participants } from "@/lib/db/schema/core";

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
