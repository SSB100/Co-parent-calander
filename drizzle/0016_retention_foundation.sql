CREATE TYPE "storage_cleanup_status" AS ENUM ('pending', 'processing', 'retry');

CREATE TABLE "storage_cleanup_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "storage_provider" varchar(32) DEFAULT 'vercel_blob' NOT NULL,
  "storage_key" text NOT NULL,
  "status" "storage_cleanup_status" DEFAULT 'pending' NOT NULL,
  "attempt_count" integer DEFAULT 0 NOT NULL,
  "available_at" timestamp with time zone DEFAULT now() NOT NULL,
  "lease_expires_at" timestamp with time zone,
  "last_attempted_at" timestamp with time zone,
  "last_error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "storage_cleanup_attempt_count_valid"
    CHECK ("attempt_count" >= 0),
  CONSTRAINT "storage_cleanup_lease_state_valid"
    CHECK (
      ("status" = 'processing' AND "lease_expires_at" IS NOT NULL)
      OR
      ("status" <> 'processing' AND "lease_expires_at" IS NULL)
    )
);

CREATE UNIQUE INDEX "storage_cleanup_provider_key_unique"
  ON "storage_cleanup_jobs" ("storage_provider", "storage_key");

CREATE INDEX "storage_cleanup_due_idx"
  ON "storage_cleanup_jobs" ("status", "available_at", "created_at");

CREATE FUNCTION "queue_attachment_storage_cleanup"()
RETURNS trigger
LANGUAGE plpgsql
AS '
BEGIN
  INSERT INTO "storage_cleanup_jobs" ("storage_provider", "storage_key")
  VALUES (OLD."storage_provider", OLD."storage_key")
  ON CONFLICT ("storage_provider", "storage_key") DO NOTHING;

  RETURN OLD;
END;
';

CREATE TRIGGER "queue_attachment_storage_cleanup_on_delete"
  BEFORE DELETE ON "attachments"
  FOR EACH ROW EXECUTE FUNCTION "queue_attachment_storage_cleanup"();

INSERT INTO "covie_schema_migrations" ("migration_id", "description", "baseline")
VALUES ('0016', 'Privacy retention and durable storage cleanup', false);
