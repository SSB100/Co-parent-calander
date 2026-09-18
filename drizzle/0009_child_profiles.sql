ALTER TABLE "children"
  ADD COLUMN "full_name" text,
  ADD COLUMN "date_of_birth" date,
  ADD COLUMN "school_name" text,
  ADD COLUMN "year_class" text,
  ADD COLUMN "teacher_name" text,
  ADD COLUMN "school_phone" text,
  ADD COLUMN "school_email" text,
  ADD COLUMN "student_id" text,
  ADD COLUMN "care_details" text,
  ADD COLUMN "school_notes" text,
  ADD COLUMN "gp_name" text,
  ADD COLUMN "dentist_name" text,
  ADD COLUMN "allergies" text,
  ADD COLUMN "medications" text,
  ADD COLUMN "medical_notes" text,
  ADD COLUMN "nhi_number" text,
  ADD COLUMN "clothing_size" text,
  ADD COLUMN "shoe_size" text,
  ADD COLUMN "uniform_size" text,
  ADD COLUMN "practical_notes" text;

CREATE TABLE "child_activities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "calendar_id" uuid NOT NULL REFERENCES "calendars"("id") ON DELETE CASCADE,
  "child_id" uuid NOT NULL REFERENCES "children"("id") ON DELETE CASCADE,
  "activity_name" text NOT NULL,
  "organisation" text,
  "contact_name" text,
  "contact_details" text,
  "location" text,
  "schedule_info" text,
  "notes" text,
  "created_by" uuid REFERENCES "participants"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX "child_activities_calendar_child_idx"
  ON "child_activities" ("calendar_id", "child_id", "created_at");

CREATE INDEX "child_activities_child_idx"
  ON "child_activities" ("child_id");
