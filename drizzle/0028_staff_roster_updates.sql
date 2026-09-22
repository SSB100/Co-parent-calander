CREATE TABLE "staff_roster_updates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "calendar_id" uuid NOT NULL,
  "member_id" uuid NOT NULL,
  "publication_id" uuid NOT NULL,
  "kind" varchar(32) NOT NULL,
  "title" varchar(160) NOT NULL,
  "before_summary" text,
  "after_summary" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "staff_roster_updates_calendar_id_fkey"
    FOREIGN KEY ("calendar_id") REFERENCES "public"."calendars"("id") ON DELETE CASCADE,
  CONSTRAINT "staff_roster_updates_member_id_fkey"
    FOREIGN KEY ("member_id") REFERENCES "public"."staff_roster_members"("id") ON DELETE CASCADE,
  CONSTRAINT "staff_roster_updates_publication_id_fkey"
    FOREIGN KEY ("publication_id") REFERENCES "public"."staff_roster_week_publications"("id") ON DELETE CASCADE
);

CREATE INDEX "staff_roster_updates_calendar_created_idx"
  ON "staff_roster_updates" ("calendar_id", "created_at");
CREATE INDEX "staff_roster_updates_member_created_idx"
  ON "staff_roster_updates" ("member_id", "created_at");

INSERT INTO "covie_schema_migrations" ("migration_id", "description", "baseline")
VALUES ('0028', 'Staff roster publication updates', false);
