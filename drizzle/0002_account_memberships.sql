CREATE TYPE "calendar_permission" AS ENUM ('owner', 'editor', 'viewer');

CREATE TABLE "calendar_memberships" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "calendar_id" uuid NOT NULL REFERENCES "calendars"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL,
  "participant_id" uuid REFERENCES "participants"("id") ON DELETE SET NULL,
  "permission" "calendar_permission" DEFAULT 'editor' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX "calendar_membership_user_unique" ON "calendar_memberships" ("calendar_id", "user_id");
CREATE UNIQUE INDEX "calendar_membership_participant_unique" ON "calendar_memberships" ("participant_id");
CREATE UNIQUE INDEX "calendar_single_owner_unique" ON "calendar_memberships" ("calendar_id") WHERE "permission" = 'owner';
CREATE INDEX "calendar_membership_user_idx" ON "calendar_memberships" ("user_id");
CREATE INDEX "calendar_membership_calendar_idx" ON "calendar_memberships" ("calendar_id");

CREATE TABLE "calendar_invites" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "calendar_id" uuid NOT NULL REFERENCES "calendars"("id") ON DELETE CASCADE,
  "code_hash" varchar(64) NOT NULL,
  "code_hint" varchar(8) NOT NULL,
  "permission" "calendar_permission" DEFAULT 'editor' NOT NULL,
  "created_by_user_id" uuid NOT NULL,
  "max_uses" integer DEFAULT 1 NOT NULL,
  "use_count" integer DEFAULT 0 NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "revoked_at" timestamp with time zone,
  "redeemed_by_user_id" uuid,
  "redeemed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX "calendar_invites_code_hash_unique" ON "calendar_invites" ("code_hash");
CREATE INDEX "calendar_invites_calendar_idx" ON "calendar_invites" ("calendar_id");
