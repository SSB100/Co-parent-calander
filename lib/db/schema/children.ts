import {
  boolean,
  date,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { calendars, participants } from "@/lib/db/schema/core";

export const children = pgTable(
  "children",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    calendarId: uuid("calendar_id")
      .notNull()
      .references(() => calendars.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    fullName: text("full_name"),
    dateOfBirth: date("date_of_birth", { mode: "string" }),
    schoolName: text("school_name"),
    yearClass: text("year_class"),
    teacherName: text("teacher_name"),
    schoolPhone: text("school_phone"),
    schoolEmail: text("school_email"),
    studentId: text("student_id"),
    careDetails: text("care_details"),
    schoolNotes: text("school_notes"),
    gpName: text("gp_name"),
    dentistName: text("dentist_name"),
    allergies: text("allergies"),
    medications: text("medications"),
    medicalNotes: text("medical_notes"),
    nhiNumber: text("nhi_number"),
    clothingSize: text("clothing_size"),
    shoeSize: text("shoe_size"),
    uniformSize: text("uniform_size"),
    practicalNotes: text("practical_notes"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("children_calendar_idx").on(table.calendarId)],
);

export const childActivities = pgTable(
  "child_activities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    calendarId: uuid("calendar_id")
      .notNull()
      .references(() => calendars.id, { onDelete: "cascade" }),
    childId: uuid("child_id")
      .notNull()
      .references(() => children.id, { onDelete: "cascade" }),
    activityName: text("activity_name").notNull(),
    organisation: text("organisation"),
    contactName: text("contact_name"),
    contactDetails: text("contact_details"),
    location: text("location"),
    scheduleInfo: text("schedule_info"),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => participants.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("child_activities_calendar_child_idx").on(
      table.calendarId,
      table.childId,
      table.createdAt,
    ),
    index("child_activities_child_idx").on(table.childId),
  ],
);
