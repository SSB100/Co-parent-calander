import { z } from "zod";

const nullableText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .nullable()
    .transform((value) => (value ? value : null));

const optionalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid date.")
  .nullable()
  .refine(
    (value) => value === null || !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime()),
    "Choose a valid date.",
  );

const optionalEmail = z
  .string()
  .trim()
  .max(160, "Keep the school email under 160 characters.")
  .nullable()
  .refine(
    (value) => value === null || value === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
    "Enter a valid school email.",
  )
  .transform((value) => (value ? value : null));

export const childProfileSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, "Add the child's preferred name.")
    .max(50, "Keep the preferred name under 50 characters."),
  fullName: nullableText(120, "Keep the full name under 120 characters."),
  dateOfBirth: optionalDate,
  schoolName: nullableText(120, "Keep the school name under 120 characters."),
  yearClass: nullableText(80, "Keep the year/class under 80 characters."),
  teacherName: nullableText(120, "Keep the teacher name under 120 characters."),
  schoolPhone: nullableText(60, "Keep the school phone under 60 characters."),
  schoolEmail: optionalEmail,
  studentId: nullableText(80, "Keep the student ID under 80 characters."),
  careDetails: nullableText(500, "Keep before/after-school care details under 500 characters."),
  schoolNotes: nullableText(1000, "Keep school notes under 1000 characters."),
  gpName: nullableText(120, "Keep the GP name under 120 characters."),
  dentistName: nullableText(120, "Keep the dentist name under 120 characters."),
  allergies: nullableText(1000, "Keep allergy information under 1000 characters."),
  medications: nullableText(1000, "Keep medication information under 1000 characters."),
  medicalNotes: nullableText(1500, "Keep medical notes under 1500 characters."),
  nhiNumber: nullableText(40, "Keep the NHI field under 40 characters."),
  clothingSize: nullableText(60, "Keep the clothing size under 60 characters."),
  shoeSize: nullableText(60, "Keep the shoe size under 60 characters."),
  uniformSize: nullableText(80, "Keep the uniform size under 80 characters."),
  practicalNotes: nullableText(1000, "Keep practical notes under 1000 characters."),
});

export const childActivitySchema = z.object({
  activityName: z
    .string()
    .trim()
    .min(1, "Add an activity or team name.")
    .max(120, "Keep the activity name under 120 characters."),
  organisation: nullableText(120, "Keep the organisation under 120 characters."),
  contactName: nullableText(120, "Keep the coach/contact name under 120 characters."),
  contactDetails: nullableText(240, "Keep contact details under 240 characters."),
  location: nullableText(240, "Keep the location under 240 characters."),
  scheduleInfo: nullableText(500, "Keep schedule information under 500 characters."),
  notes: nullableText(1000, "Keep activity notes under 1000 characters."),
});

export type ChildProfileInput = z.infer<typeof childProfileSchema>;
export type ChildActivityInput = z.infer<typeof childActivitySchema>;

export const childProfileFieldLabels: Record<keyof ChildProfileInput, string> = {
  displayName: "Preferred name",
  fullName: "Full name",
  dateOfBirth: "Date of birth",
  schoolName: "School",
  yearClass: "Year / class",
  teacherName: "Teacher",
  schoolPhone: "School phone",
  schoolEmail: "School email",
  studentId: "Student ID",
  careDetails: "Before / after-school care",
  schoolNotes: "School notes",
  gpName: "GP",
  dentistName: "Dentist",
  allergies: "Allergies",
  medications: "Medications",
  medicalNotes: "Medical notes",
  nhiNumber: "NHI / health identifier",
  clothingSize: "Clothing size",
  shoeSize: "Shoe size",
  uniformSize: "Uniform size",
  practicalNotes: "Practical notes",
};

export const childProfileFieldSections: Record<
  keyof ChildProfileInput,
  "Basic" | "School" | "Health" | "Practical"
> = {
  displayName: "Basic",
  fullName: "Basic",
  dateOfBirth: "Basic",
  schoolName: "School",
  yearClass: "School",
  teacherName: "School",
  schoolPhone: "School",
  schoolEmail: "School",
  studentId: "School",
  careDetails: "School",
  schoolNotes: "School",
  gpName: "Health",
  dentistName: "Health",
  allergies: "Health",
  medications: "Health",
  medicalNotes: "Health",
  nhiNumber: "Health",
  clothingSize: "Practical",
  shoeSize: "Practical",
  uniformSize: "Practical",
  practicalNotes: "Practical",
};

export function changedProfileFields(
  before: ChildProfileInput,
  after: ChildProfileInput,
) {
  return (Object.keys(childProfileFieldLabels) as Array<keyof ChildProfileInput>).filter(
    (field) => (before[field] ?? null) !== (after[field] ?? null),
  );
}

export function changedActivityFields(
  before: ChildActivityInput,
  after: ChildActivityInput,
) {
  return (Object.keys(childActivitySchema.shape) as Array<keyof ChildActivityInput>).filter(
    (field) => (before[field] ?? null) !== (after[field] ?? null),
  );
}

export function historySummary(input: {
  action: string;
  details: unknown;
}) {
  const details =
    input.details && typeof input.details === "object"
      ? (input.details as Record<string, unknown>)
      : {};

  if (input.action === "child_profile.update") {
    const fields = Array.isArray(details.changedFields)
      ? details.changedFields.filter((field): field is string => typeof field === "string")
      : [];
    const labels = fields
      .map((field) => childProfileFieldLabels[field as keyof ChildProfileInput])
      .filter(Boolean);
    return labels.length
      ? `Updated ${labels.join(", ")}`
      : "Updated child profile";
  }

  const activityName =
    typeof details.activityName === "string" && details.activityName
      ? details.activityName
      : "activity";

  if (input.action === "child_profile.photo_update") return "Updated profile photo";
  if (input.action === "child_profile.photo_remove") return "Removed profile photo";
  if (input.action === "child_profile.document_add") {
    return typeof details.fileName === "string" && details.fileName
      ? `Added document ${details.fileName}`
      : "Added a child document";
  }
  if (input.action === "child_profile.document_remove") {
    return typeof details.fileName === "string" && details.fileName
      ? `Removed document ${details.fileName}`
      : "Removed a child document";
  }

  if (input.action === "child_activity.create") return `Added ${activityName}`;
  if (input.action === "child_activity.update") return `Updated ${activityName}`;
  if (input.action === "child_activity.delete") return `Removed ${activityName}`;
  return "Updated child information";
}
