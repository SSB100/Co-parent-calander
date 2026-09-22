CREATE TYPE "staff_roster_access_role" AS ENUM (
  'owner',
  'manager',
  'staff'
);

CREATE TYPE "staff_roster_availability_status" AS ENUM (
  'available',
  'unavailable'
);

CREATE TABLE "staff_roster_roles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "calendar_id" uuid NOT NULL,
  "name" varchar(80) NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "staff_roster_roles_calendar_id_fkey"
    FOREIGN KEY ("calendar_id") REFERENCES "public"."calendars"("id")
    ON DELETE CASCADE
);

CREATE UNIQUE INDEX "staff_roster_roles_calendar_name_unique"
  ON "staff_roster_roles" ("calendar_id", "name")
  WHERE "active" = true;
CREATE INDEX "staff_roster_roles_calendar_active_idx"
  ON "staff_roster_roles" ("calendar_id", "active");

CREATE TABLE "staff_roster_locations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "calendar_id" uuid NOT NULL,
  "name" varchar(100) NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "staff_roster_locations_calendar_id_fkey"
    FOREIGN KEY ("calendar_id") REFERENCES "public"."calendars"("id")
    ON DELETE CASCADE
);

CREATE UNIQUE INDEX "staff_roster_locations_calendar_name_unique"
  ON "staff_roster_locations" ("calendar_id", "name")
  WHERE "active" = true;
CREATE INDEX "staff_roster_locations_calendar_active_idx"
  ON "staff_roster_locations" ("calendar_id", "active");

CREATE TABLE "staff_roster_members" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "calendar_id" uuid NOT NULL,
  "membership_id" uuid,
  "display_name" varchar(80) NOT NULL,
  "access_role" staff_roster_access_role DEFAULT 'staff' NOT NULL,
  "default_role_id" uuid,
  "default_location_id" uuid,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "staff_roster_members_calendar_id_fkey"
    FOREIGN KEY ("calendar_id") REFERENCES "public"."calendars"("id")
    ON DELETE CASCADE,
  CONSTRAINT "staff_roster_members_membership_id_fkey"
    FOREIGN KEY ("membership_id") REFERENCES "public"."calendar_memberships"("id")
    ON DELETE SET NULL,
  CONSTRAINT "staff_roster_members_default_role_id_fkey"
    FOREIGN KEY ("default_role_id") REFERENCES "public"."staff_roster_roles"("id")
    ON DELETE SET NULL,
  CONSTRAINT "staff_roster_members_default_location_id_fkey"
    FOREIGN KEY ("default_location_id") REFERENCES "public"."staff_roster_locations"("id")
    ON DELETE SET NULL
);

CREATE UNIQUE INDEX "staff_roster_members_membership_unique"
  ON "staff_roster_members" ("membership_id")
  WHERE "membership_id" IS NOT NULL;
CREATE INDEX "staff_roster_members_calendar_active_idx"
  ON "staff_roster_members" ("calendar_id", "active");
CREATE INDEX "staff_roster_members_calendar_role_idx"
  ON "staff_roster_members" ("calendar_id", "access_role");

CREATE TABLE "staff_roster_availability" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "calendar_id" uuid NOT NULL,
  "member_id" uuid NOT NULL,
  "availability_date" date NOT NULL,
  "start_time" time,
  "end_time" time,
  "status" staff_roster_availability_status NOT NULL,
  "note" text,
  "created_by_membership_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "staff_roster_availability_calendar_id_fkey"
    FOREIGN KEY ("calendar_id") REFERENCES "public"."calendars"("id")
    ON DELETE CASCADE,
  CONSTRAINT "staff_roster_availability_member_id_fkey"
    FOREIGN KEY ("member_id") REFERENCES "public"."staff_roster_members"("id")
    ON DELETE CASCADE,
  CONSTRAINT "staff_roster_availability_created_by_membership_id_fkey"
    FOREIGN KEY ("created_by_membership_id") REFERENCES "public"."calendar_memberships"("id")
    ON DELETE SET NULL,
  CONSTRAINT "staff_roster_availability_time_pair_valid"
    CHECK (
      ("start_time" IS NULL AND "end_time" IS NULL)
      OR
      ("start_time" IS NOT NULL AND "end_time" IS NOT NULL AND "end_time" > "start_time")
    )
);

CREATE INDEX "staff_roster_availability_calendar_date_idx"
  ON "staff_roster_availability" ("calendar_id", "availability_date");
CREATE INDEX "staff_roster_availability_member_date_idx"
  ON "staff_roster_availability" ("member_id", "availability_date");

INSERT INTO "covie_schema_migrations" ("migration_id", "description", "baseline")
VALUES ('0023', 'Staff roster team roles locations and availability foundation', false);
