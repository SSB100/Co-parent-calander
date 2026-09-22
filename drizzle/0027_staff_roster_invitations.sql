CREATE TABLE "staff_roster_invites" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "calendar_id" uuid NOT NULL,
  "member_id" uuid NOT NULL,
  "code_hash" varchar(64) NOT NULL,
  "code_hint" varchar(8) NOT NULL,
  "created_by_membership_id" uuid,
  "expires_at" timestamp with time zone NOT NULL,
  "revoked_at" timestamp with time zone,
  "redeemed_by_membership_id" uuid,
  "redeemed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "staff_roster_invites_calendar_id_fkey"
    FOREIGN KEY ("calendar_id") REFERENCES "public"."calendars"("id") ON DELETE CASCADE,
  CONSTRAINT "staff_roster_invites_member_id_fkey"
    FOREIGN KEY ("member_id") REFERENCES "public"."staff_roster_members"("id") ON DELETE CASCADE,
  CONSTRAINT "staff_roster_invites_created_by_membership_id_fkey"
    FOREIGN KEY ("created_by_membership_id") REFERENCES "public"."calendar_memberships"("id") ON DELETE SET NULL,
  CONSTRAINT "staff_roster_invites_redeemed_by_membership_id_fkey"
    FOREIGN KEY ("redeemed_by_membership_id") REFERENCES "public"."calendar_memberships"("id") ON DELETE SET NULL
);

CREATE UNIQUE INDEX "staff_roster_invites_code_hash_unique"
  ON "staff_roster_invites" ("code_hash");
CREATE INDEX "staff_roster_invites_calendar_member_idx"
  ON "staff_roster_invites" ("calendar_id", "member_id");
CREATE INDEX "staff_roster_invites_calendar_active_idx"
  ON "staff_roster_invites" ("calendar_id", "revoked_at", "redeemed_at");

INSERT INTO "covie_schema_migrations" ("migration_id", "description", "baseline")
VALUES ('0027', 'Staff roster account invitations', false);
