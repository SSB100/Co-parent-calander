CREATE TABLE "staff_roster_member_roles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "calendar_id" uuid NOT NULL,
  "member_id" uuid NOT NULL,
  "role_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "staff_roster_member_roles_calendar_id_fkey"
    FOREIGN KEY ("calendar_id") REFERENCES "public"."calendars"("id") ON DELETE CASCADE,
  CONSTRAINT "staff_roster_member_roles_member_id_fkey"
    FOREIGN KEY ("member_id") REFERENCES "public"."staff_roster_members"("id") ON DELETE CASCADE,
  CONSTRAINT "staff_roster_member_roles_role_id_fkey"
    FOREIGN KEY ("role_id") REFERENCES "public"."staff_roster_roles"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "staff_roster_member_roles_member_role_unique"
  ON "staff_roster_member_roles" ("member_id", "role_id");
CREATE INDEX "staff_roster_member_roles_calendar_idx"
  ON "staff_roster_member_roles" ("calendar_id");
CREATE INDEX "staff_roster_member_roles_member_idx"
  ON "staff_roster_member_roles" ("member_id");

INSERT INTO "staff_roster_member_roles" (
  "calendar_id", "member_id", "role_id"
)
SELECT
  member."calendar_id", member."id", member."default_role_id"
FROM "staff_roster_members" member
WHERE member."default_role_id" IS NOT NULL
ON CONFLICT ("member_id", "role_id") DO NOTHING;

INSERT INTO "covie_schema_migrations" ("migration_id", "description", "baseline")
VALUES ('0029', 'Staff roster member multi-role assignments', false);
