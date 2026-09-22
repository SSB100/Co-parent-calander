CREATE TABLE "staff_roster_week_publications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "calendar_id" uuid NOT NULL,
  "week_start" date NOT NULL,
  "revision" integer DEFAULT 1 NOT NULL,
  "published_at" timestamp with time zone DEFAULT now() NOT NULL,
  "published_by_membership_id" uuid,
  "last_sent_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_sent_by_membership_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "staff_roster_week_publications_calendar_id_fkey"
    FOREIGN KEY ("calendar_id") REFERENCES "public"."calendars"("id")
    ON DELETE CASCADE,
  CONSTRAINT "staff_roster_week_publications_published_by_membership_id_fkey"
    FOREIGN KEY ("published_by_membership_id") REFERENCES "public"."calendar_memberships"("id")
    ON DELETE SET NULL,
  CONSTRAINT "staff_roster_week_publications_last_sent_by_membership_id_fkey"
    FOREIGN KEY ("last_sent_by_membership_id") REFERENCES "public"."calendar_memberships"("id")
    ON DELETE SET NULL
);

CREATE UNIQUE INDEX "staff_roster_week_publications_calendar_week_unique"
  ON "staff_roster_week_publications" ("calendar_id", "week_start");
CREATE INDEX "staff_roster_week_publications_calendar_idx"
  ON "staff_roster_week_publications" ("calendar_id");

CREATE TABLE "staff_roster_published_shifts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "publication_id" uuid NOT NULL,
  "source_shift_id" uuid,
  "member_id" uuid NOT NULL,
  "role_id" uuid,
  "location_id" uuid,
  "shift_date" date NOT NULL,
  "start_time" time NOT NULL,
  "end_time" time NOT NULL,
  "note" text,
  "availability_override" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "staff_roster_published_shifts_publication_id_fkey"
    FOREIGN KEY ("publication_id") REFERENCES "public"."staff_roster_week_publications"("id")
    ON DELETE CASCADE,
  CONSTRAINT "staff_roster_published_shifts_member_id_fkey"
    FOREIGN KEY ("member_id") REFERENCES "public"."staff_roster_members"("id")
    ON DELETE RESTRICT,
  CONSTRAINT "staff_roster_published_shifts_role_id_fkey"
    FOREIGN KEY ("role_id") REFERENCES "public"."staff_roster_roles"("id")
    ON DELETE SET NULL,
  CONSTRAINT "staff_roster_published_shifts_location_id_fkey"
    FOREIGN KEY ("location_id") REFERENCES "public"."staff_roster_locations"("id")
    ON DELETE SET NULL,
  CONSTRAINT "staff_roster_published_shifts_time_valid"
    CHECK ("end_time" > "start_time")
);

CREATE UNIQUE INDEX "staff_roster_published_shifts_source_unique"
  ON "staff_roster_published_shifts" ("publication_id", "source_shift_id")
  WHERE "source_shift_id" IS NOT NULL;
CREATE INDEX "staff_roster_published_shifts_publication_date_idx"
  ON "staff_roster_published_shifts" ("publication_id", "shift_date");
CREATE INDEX "staff_roster_published_shifts_member_date_idx"
  ON "staff_roster_published_shifts" ("member_id", "shift_date", "start_time");

INSERT INTO "covie_schema_migrations" ("migration_id", "description", "baseline")
VALUES ('0025', 'Staff roster published week snapshots', false);
