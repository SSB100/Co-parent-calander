CREATE TYPE "staff_roster_correction_status" AS ENUM ('pending', 'approved', 'declined', 'cancelled');
CREATE TYPE "staff_roster_leave_status" AS ENUM ('pending', 'approved', 'declined', 'cancelled');

CREATE TABLE "staff_roster_clock_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "calendar_id" uuid NOT NULL,
  "member_id" uuid NOT NULL,
  "published_shift_id" uuid,
  "scheduled_date" date,
  "scheduled_start_time" time,
  "scheduled_end_time" time,
  "clock_in_at" timestamp with time zone NOT NULL,
  "clock_out_at" timestamp with time zone,
  "unrostered" boolean DEFAULT false NOT NULL,
  "corrected_at" timestamp with time zone,
  "corrected_by_membership_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "staff_roster_clock_sessions_calendar_id_fkey"
    FOREIGN KEY ("calendar_id") REFERENCES "public"."calendars"("id") ON DELETE CASCADE,
  CONSTRAINT "staff_roster_clock_sessions_member_id_fkey"
    FOREIGN KEY ("member_id") REFERENCES "public"."staff_roster_members"("id") ON DELETE RESTRICT,
  CONSTRAINT "staff_roster_clock_sessions_published_shift_id_fkey"
    FOREIGN KEY ("published_shift_id") REFERENCES "public"."staff_roster_published_shifts"("id") ON DELETE SET NULL,
  CONSTRAINT "staff_roster_clock_sessions_corrected_by_membership_id_fkey"
    FOREIGN KEY ("corrected_by_membership_id") REFERENCES "public"."calendar_memberships"("id") ON DELETE SET NULL,
  CONSTRAINT "staff_roster_clock_sessions_time_valid"
    CHECK ("clock_out_at" IS NULL OR "clock_out_at" > "clock_in_at"),
  CONSTRAINT "staff_roster_clock_sessions_schedule_pair_valid"
    CHECK (
      ("scheduled_start_time" IS NULL AND "scheduled_end_time" IS NULL)
      OR
      ("scheduled_start_time" IS NOT NULL AND "scheduled_end_time" IS NOT NULL AND "scheduled_end_time" > "scheduled_start_time")
    )
);

CREATE UNIQUE INDEX "staff_roster_clock_sessions_member_active_unique"
  ON "staff_roster_clock_sessions" ("member_id")
  WHERE "clock_out_at" IS NULL;
CREATE INDEX "staff_roster_clock_sessions_calendar_clock_in_idx"
  ON "staff_roster_clock_sessions" ("calendar_id", "clock_in_at");
CREATE INDEX "staff_roster_clock_sessions_member_clock_in_idx"
  ON "staff_roster_clock_sessions" ("member_id", "clock_in_at");

CREATE TABLE "staff_roster_timesheet_corrections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "calendar_id" uuid NOT NULL,
  "member_id" uuid NOT NULL,
  "clock_session_id" uuid NOT NULL,
  "requested_clock_in_at" timestamp with time zone,
  "requested_clock_out_at" timestamp with time zone,
  "reason" text NOT NULL,
  "status" "staff_roster_correction_status" DEFAULT 'pending' NOT NULL,
  "reviewed_by_membership_id" uuid,
  "reviewed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "staff_roster_timesheet_corrections_calendar_id_fkey"
    FOREIGN KEY ("calendar_id") REFERENCES "public"."calendars"("id") ON DELETE CASCADE,
  CONSTRAINT "staff_roster_timesheet_corrections_member_id_fkey"
    FOREIGN KEY ("member_id") REFERENCES "public"."staff_roster_members"("id") ON DELETE RESTRICT,
  CONSTRAINT "staff_roster_timesheet_corrections_clock_session_id_fkey"
    FOREIGN KEY ("clock_session_id") REFERENCES "public"."staff_roster_clock_sessions"("id") ON DELETE CASCADE,
  CONSTRAINT "staff_roster_timesheet_corrections_reviewed_by_membership_id_fkey"
    FOREIGN KEY ("reviewed_by_membership_id") REFERENCES "public"."calendar_memberships"("id") ON DELETE SET NULL,
  CONSTRAINT "staff_roster_timesheet_corrections_requested_time_valid"
    CHECK ("requested_clock_in_at" IS NOT NULL OR "requested_clock_out_at" IS NOT NULL)
);

CREATE INDEX "staff_roster_timesheet_corrections_calendar_status_idx"
  ON "staff_roster_timesheet_corrections" ("calendar_id", "status");
CREATE INDEX "staff_roster_timesheet_corrections_member_created_idx"
  ON "staff_roster_timesheet_corrections" ("member_id", "created_at");

CREATE TABLE "staff_roster_leave_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "calendar_id" uuid NOT NULL,
  "member_id" uuid NOT NULL,
  "start_date" date NOT NULL,
  "end_date" date NOT NULL,
  "all_day" boolean DEFAULT true NOT NULL,
  "start_time" time,
  "end_time" time,
  "note" text,
  "status" "staff_roster_leave_status" DEFAULT 'pending' NOT NULL,
  "reviewed_by_membership_id" uuid,
  "reviewed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "staff_roster_leave_requests_calendar_id_fkey"
    FOREIGN KEY ("calendar_id") REFERENCES "public"."calendars"("id") ON DELETE CASCADE,
  CONSTRAINT "staff_roster_leave_requests_member_id_fkey"
    FOREIGN KEY ("member_id") REFERENCES "public"."staff_roster_members"("id") ON DELETE RESTRICT,
  CONSTRAINT "staff_roster_leave_requests_reviewed_by_membership_id_fkey"
    FOREIGN KEY ("reviewed_by_membership_id") REFERENCES "public"."calendar_memberships"("id") ON DELETE SET NULL,
  CONSTRAINT "staff_roster_leave_requests_date_valid"
    CHECK ("end_date" >= "start_date"),
  CONSTRAINT "staff_roster_leave_requests_time_valid"
    CHECK (
      ("all_day" = true AND "start_time" IS NULL AND "end_time" IS NULL)
      OR
      ("all_day" = false AND "start_time" IS NOT NULL AND "end_time" IS NOT NULL AND "end_time" > "start_time")
    )
);

CREATE INDEX "staff_roster_leave_requests_calendar_status_idx"
  ON "staff_roster_leave_requests" ("calendar_id", "status");
CREATE INDEX "staff_roster_leave_requests_member_date_idx"
  ON "staff_roster_leave_requests" ("member_id", "start_date", "end_date");

INSERT INTO "covie_schema_migrations" ("migration_id", "description", "baseline")
VALUES ('0026', 'Staff roster attendance corrections and leave', false);
