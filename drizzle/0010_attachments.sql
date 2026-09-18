CREATE TYPE "attachment_status" AS ENUM (
  'pending',
  'ready'
);

CREATE TYPE "attachment_category" AS ENUM (
  'receipt',
  'school_form',
  'medical_letter',
  'registration',
  'camp',
  'insurance',
  'profile_photo',
  'other'
);

CREATE TYPE "attachment_entity_type" AS ENUM (
  'expense',
  'responsibility',
  'event',
  'child'
);

CREATE TYPE "attachment_role" AS ENUM (
  'supporting',
  'profile_photo'
);

CREATE TABLE "attachments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "calendar_id" uuid NOT NULL REFERENCES "calendars"("id") ON DELETE CASCADE,
  "storage_provider" varchar(32) NOT NULL DEFAULT 'vercel_blob',
  "storage_key" text NOT NULL,
  "original_file_name" text NOT NULL,
  "content_type" varchar(160) NOT NULL,
  "size_bytes" integer NOT NULL,
  "category" "attachment_category" NOT NULL DEFAULT 'other',
  "status" "attachment_status" NOT NULL DEFAULT 'pending',
  "uploaded_by" uuid REFERENCES "participants"("id") ON DELETE SET NULL,
  "ready_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "attachment_size_positive" CHECK ("size_bytes" > 0)
);

CREATE UNIQUE INDEX "attachments_storage_key_unique"
  ON "attachments" ("storage_key");

CREATE INDEX "attachments_calendar_status_idx"
  ON "attachments" ("calendar_id", "status", "created_at");

CREATE TABLE "attachment_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "calendar_id" uuid NOT NULL REFERENCES "calendars"("id") ON DELETE CASCADE,
  "attachment_id" uuid NOT NULL REFERENCES "attachments"("id") ON DELETE CASCADE,
  "entity_type" "attachment_entity_type" NOT NULL,
  "entity_id" uuid NOT NULL,
  "role" "attachment_role" NOT NULL DEFAULT 'supporting',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX "attachment_link_unique"
  ON "attachment_links" ("attachment_id", "entity_type", "entity_id", "role");

CREATE INDEX "attachment_links_target_idx"
  ON "attachment_links" ("calendar_id", "entity_type", "entity_id", "role");

CREATE UNIQUE INDEX "child_profile_photo_unique"
  ON "attachment_links" ("calendar_id", "entity_type", "entity_id", "role")
  WHERE "entity_type" = 'child' AND "role" = 'profile_photo';
