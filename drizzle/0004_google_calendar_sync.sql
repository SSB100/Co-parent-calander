CREATE TYPE "google_parent_label_mode" AS ENUM ('names', 'neutral');
CREATE TYPE "google_connection_status" AS ENUM ('initial_sync', 'active', 'reconnect_required', 'error');
CREATE TYPE "google_event_kind" AS ENUM ('parenting', 'handover', 'shared_event');
CREATE TYPE "google_sync_job_status" AS ENUM ('pending', 'processing', 'retry', 'failed', 'succeeded');

CREATE TABLE "google_calendar_connections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "calendar_id" uuid NOT NULL REFERENCES "calendars"("id") ON DELETE CASCADE,
  "membership_id" uuid NOT NULL REFERENCES "calendar_memberships"("id") ON DELETE CASCADE,
  "google_calendar_id" text,
  "google_calendar_name" text,
  "access_token_encrypted" text,
  "refresh_token_encrypted" text,
  "token_expires_at" timestamp with time zone,
  "scope" text,
  "status" "google_connection_status" DEFAULT 'initial_sync' NOT NULL,
  "sync_parenting" boolean DEFAULT true NOT NULL,
  "sync_handovers" boolean DEFAULT true NOT NULL,
  "sync_shared_events" boolean DEFAULT true NOT NULL,
  "sync_locations" boolean DEFAULT false NOT NULL,
  "sync_shared_notes" boolean DEFAULT false NOT NULL,
  "parent_label_mode" "google_parent_label_mode" DEFAULT 'names' NOT NULL,
  "last_successful_sync_at" timestamp with time zone,
  "last_attempted_sync_at" timestamp with time zone,
  "last_error" text,
  "connected_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX "google_connection_membership_unique" ON "google_calendar_connections" ("membership_id");
CREATE INDEX "google_connection_calendar_idx" ON "google_calendar_connections" ("calendar_id");

CREATE TABLE "google_event_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "connection_id" uuid NOT NULL REFERENCES "google_calendar_connections"("id") ON DELETE CASCADE,
  "local_key" text NOT NULL,
  "google_event_id" varchar(128) NOT NULL,
  "event_kind" "google_event_kind" NOT NULL,
  "local_entity_id" uuid,
  "range_start" date NOT NULL,
  "range_end" date NOT NULL,
  "content_hash" varchar(64) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX "google_event_link_local_unique" ON "google_event_links" ("connection_id", "local_key");
CREATE UNIQUE INDEX "google_event_link_google_unique" ON "google_event_links" ("connection_id", "google_event_id");
CREATE INDEX "google_event_link_range_idx" ON "google_event_links" ("connection_id", "range_start", "range_end");

CREATE TABLE "calendar_sync_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "connection_id" uuid NOT NULL REFERENCES "google_calendar_connections"("id") ON DELETE CASCADE,
  "calendar_id" uuid NOT NULL REFERENCES "calendars"("id") ON DELETE CASCADE,
  "job_type" varchar(32) DEFAULT 'range' NOT NULL,
  "range_start" date,
  "range_end" date,
  "status" "google_sync_job_status" DEFAULT 'pending' NOT NULL,
  "retry_count" integer DEFAULT 0 NOT NULL,
  "available_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_attempted_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "last_error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX "calendar_sync_jobs_due_idx" ON "calendar_sync_jobs" ("status", "available_at");
CREATE INDEX "calendar_sync_jobs_connection_idx" ON "calendar_sync_jobs" ("connection_id", "created_at");
CREATE INDEX "calendar_sync_jobs_calendar_idx" ON "calendar_sync_jobs" ("calendar_id", "created_at");
