CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE "access_token_type" AS ENUM ('editor', 'viewer');
CREATE TYPE "assignment_source" AS ENUM ('manual', 'recurring');
CREATE TYPE "participant_role" AS ENUM ('parent');
CREATE TYPE "event_category" AS ENUM ('school', 'sport', 'medical', 'birthday', 'holiday', 'activity', 'other');

CREATE TABLE "calendars" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "timezone" text DEFAULT 'Pacific/Auckland' NOT NULL,
  "share_enabled" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "participants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "calendar_id" uuid NOT NULL REFERENCES "calendars"("id") ON DELETE CASCADE,
  "display_name" text NOT NULL,
  "role" "participant_role" DEFAULT 'parent' NOT NULL,
  "color_key" varchar(32) NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX "participants_calendar_idx" ON "participants" ("calendar_id");

CREATE TABLE "children" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "calendar_id" uuid NOT NULL REFERENCES "calendars"("id") ON DELETE CASCADE,
  "display_name" text NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX "children_calendar_idx" ON "children" ("calendar_id");

CREATE TABLE "access_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "calendar_id" uuid NOT NULL REFERENCES "calendars"("id") ON DELETE CASCADE,
  "participant_id" uuid REFERENCES "participants"("id") ON DELETE CASCADE,
  "type" "access_token_type" NOT NULL,
  "token_hash" varchar(64) NOT NULL,
  "expires_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "last_used_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX "access_tokens_hash_unique" ON "access_tokens" ("token_hash");
CREATE INDEX "access_tokens_calendar_idx" ON "access_tokens" ("calendar_id");

CREATE TABLE "sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "calendar_id" uuid NOT NULL REFERENCES "calendars"("id") ON DELETE CASCADE,
  "participant_id" uuid NOT NULL REFERENCES "participants"("id") ON DELETE CASCADE,
  "token_hash" varchar(64) NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "revoked_at" timestamp with time zone,
  "last_used_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX "sessions_hash_unique" ON "sessions" ("token_hash");
CREATE INDEX "sessions_calendar_idx" ON "sessions" ("calendar_id");
CREATE INDEX "sessions_participant_idx" ON "sessions" ("participant_id");

CREATE TABLE "recurring_rules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "calendar_id" uuid NOT NULL REFERENCES "calendars"("id") ON DELETE CASCADE,
  "parent_id" uuid NOT NULL REFERENCES "participants"("id") ON DELETE CASCADE,
  "rrule" text NOT NULL,
  "start_date" date NOT NULL,
  "end_date" date,
  "active" boolean DEFAULT true NOT NULL,
  "created_by" uuid REFERENCES "participants"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX "recurring_rules_calendar_idx" ON "recurring_rules" ("calendar_id");

CREATE TABLE "recurring_rule_children" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "recurring_rule_id" uuid NOT NULL REFERENCES "recurring_rules"("id") ON DELETE CASCADE,
  "child_id" uuid NOT NULL REFERENCES "children"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "recurring_rule_child_unique" ON "recurring_rule_children" ("recurring_rule_id", "child_id");

CREATE TABLE "parenting_assignments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "calendar_id" uuid NOT NULL REFERENCES "calendars"("id") ON DELETE CASCADE,
  "child_id" uuid NOT NULL REFERENCES "children"("id") ON DELETE CASCADE,
  "assignment_date" date NOT NULL,
  "parent_id" uuid NOT NULL REFERENCES "participants"("id") ON DELETE RESTRICT,
  "source" "assignment_source" DEFAULT 'manual' NOT NULL,
  "recurring_rule_id" uuid REFERENCES "recurring_rules"("id") ON DELETE SET NULL,
  "handover_time" time,
  "handover_location" text,
  "note" text,
  "created_by" uuid REFERENCES "participants"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX "assignment_child_date_unique" ON "parenting_assignments" ("calendar_id", "child_id", "assignment_date");
CREATE INDEX "assignment_calendar_date_idx" ON "parenting_assignments" ("calendar_id", "assignment_date");
CREATE INDEX "assignment_parent_idx" ON "parenting_assignments" ("parent_id");

CREATE TABLE "events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "calendar_id" uuid NOT NULL REFERENCES "calendars"("id") ON DELETE CASCADE,
  "start_date" date NOT NULL,
  "end_date" date,
  "title" text NOT NULL,
  "description" text,
  "category" "event_category" DEFAULT 'other' NOT NULL,
  "created_by" uuid REFERENCES "participants"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX "events_calendar_date_idx" ON "events" ("calendar_id", "start_date");

CREATE TABLE "audit_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "calendar_id" uuid NOT NULL REFERENCES "calendars"("id") ON DELETE CASCADE,
  "actor_participant_id" uuid REFERENCES "participants"("id") ON DELETE SET NULL,
  "action" varchar(64) NOT NULL,
  "entity_type" varchar(64) NOT NULL,
  "entity_id" uuid,
  "before_state" jsonb,
  "after_state" jsonb,
  "occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX "audit_calendar_time_idx" ON "audit_log" ("calendar_id", "occurred_at");
CREATE INDEX "audit_entity_idx" ON "audit_log" ("entity_type", "entity_id");
