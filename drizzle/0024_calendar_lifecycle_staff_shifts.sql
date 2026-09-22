ALTER TABLE "calendars"
  ADD COLUMN "archived_at" timestamp with time zone;

CREATE INDEX "calendars_archived_at_idx"
  ON "calendars" ("archived_at");

CREATE TABLE "staff_roster_settings" (
  "calendar_id" uuid PRIMARY KEY NOT NULL,
  "setup_completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "staff_roster_settings_calendar_id_fkey"
    FOREIGN KEY ("calendar_id") REFERENCES "public"."calendars"("id")
    ON DELETE CASCADE
);

CREATE TABLE "staff_roster_shifts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "calendar_id" uuid NOT NULL,
  "member_id" uuid NOT NULL,
  "role_id" uuid,
  "location_id" uuid,
  "shift_date" date NOT NULL,
  "start_time" time NOT NULL,
  "end_time" time NOT NULL,
  "note" text,
  "availability_override" boolean DEFAULT false NOT NULL,
  "created_by_membership_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "staff_roster_shifts_calendar_id_fkey"
    FOREIGN KEY ("calendar_id") REFERENCES "public"."calendars"("id")
    ON DELETE CASCADE,
  CONSTRAINT "staff_roster_shifts_member_id_fkey"
    FOREIGN KEY ("member_id") REFERENCES "public"."staff_roster_members"("id")
    ON DELETE RESTRICT,
  CONSTRAINT "staff_roster_shifts_role_id_fkey"
    FOREIGN KEY ("role_id") REFERENCES "public"."staff_roster_roles"("id")
    ON DELETE SET NULL,
  CONSTRAINT "staff_roster_shifts_location_id_fkey"
    FOREIGN KEY ("location_id") REFERENCES "public"."staff_roster_locations"("id")
    ON DELETE SET NULL,
  CONSTRAINT "staff_roster_shifts_created_by_membership_id_fkey"
    FOREIGN KEY ("created_by_membership_id") REFERENCES "public"."calendar_memberships"("id")
    ON DELETE SET NULL,
  CONSTRAINT "staff_roster_shifts_time_valid"
    CHECK ("end_time" > "start_time")
);

CREATE INDEX "staff_roster_shifts_calendar_date_idx"
  ON "staff_roster_shifts" ("calendar_id", "shift_date");
CREATE INDEX "staff_roster_shifts_member_date_idx"
  ON "staff_roster_shifts" ("member_id", "shift_date", "start_time");

INSERT INTO "covie_schema_migrations" ("migration_id", "description", "baseline")
VALUES ('0024', 'Calendar lifecycle and Staff roster setup and shifts', false);
