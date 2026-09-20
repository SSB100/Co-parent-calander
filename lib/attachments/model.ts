import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { children, events, expenses, responsibilities } from "@/lib/db/schema";

export const attachmentEntityTypes = [
  "expense",
  "responsibility",
  "event",
  "child",
] as const;

export const attachmentCategories = [
  "receipt",
  "school_form",
  "medical_letter",
  "registration",
  "camp",
  "insurance",
  "profile_photo",
  "other",
] as const;

export const attachmentRoles = ["supporting", "profile_photo"] as const;

export type AttachmentEntityType = (typeof attachmentEntityTypes)[number];
export type AttachmentCategory = (typeof attachmentCategories)[number];
export type AttachmentRole = (typeof attachmentRoles)[number];

export const MAX_ATTACHMENT_SIZE_BYTES = 20 * 1024 * 1024;
export const MAX_PROFILE_PHOTO_SIZE_BYTES = 8 * 1024 * 1024;

export const allowedAttachmentContentTypes = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

export const allowedProfilePhotoContentTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

const extensionsByContentType: Record<string, readonly string[]> = {
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "image/heic": [".heic"],
  "image/heif": [".heif"],
  "application/msword": [".doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
};

function extensionFor(fileName: string) {
  const normalized = fileName.trim().toLocaleLowerCase("en-NZ");
  const index = normalized.lastIndexOf(".");
  return index >= 0 ? normalized.slice(index) : "";
}

const entityIdSchema = z.string().uuid();

export const attachmentTargetSchema = z.object({
  entityType: z.enum(attachmentEntityTypes),
  entityId: entityIdSchema,
  role: z.enum(attachmentRoles).default("supporting"),
});

export const attachmentBeginSchema = attachmentTargetSchema
  .extend({
    originalFileName: z
      .string()
      .trim()
      .min(1, "Choose a file.")
      .max(240, "Keep the file name under 240 characters.")
      .refine(
        (value) => !/[\u0000-\u001F\u007F]/.test(value),
        "Choose a file with a valid name.",
      ),
    contentType: z.string().trim().min(1).max(160),
    sizeBytes: z.number().int().positive(),
    category: z.enum(attachmentCategories),
  })
  .superRefine((value, context) => {
    const isPhoto = value.role === "profile_photo";

    if (isPhoto && value.entityType !== "child") {
      context.addIssue({
        code: "custom",
        message: "Profile photos can only be attached to a child profile.",
      });
    }

    if (isPhoto && value.category !== "profile_photo") {
      context.addIssue({
        code: "custom",
        message: "Profile photos must use the profile photo category.",
      });
    }

    if (!isPhoto && value.category === "profile_photo") {
      context.addIssue({
        code: "custom",
        message: "Use profile photo only for a child profile image.",
      });
    }

    const allowedTypes = isPhoto
      ? allowedProfilePhotoContentTypes
      : allowedAttachmentContentTypes;
    if (!allowedTypes.includes(value.contentType as never)) {
      context.addIssue({
        code: "custom",
        message: isPhoto
          ? "Choose a JPEG, PNG, WebP, HEIC or HEIF image."
          : "Choose a PDF, image, Word or DOCX file.",
      });
    } else {
      const validExtensions = extensionsByContentType[value.contentType] ?? [];
      if (!validExtensions.includes(extensionFor(value.originalFileName))) {
        context.addIssue({
          code: "custom",
          message: "The file extension does not match the selected file type.",
        });
      }
    }

    const limit = isPhoto
      ? MAX_PROFILE_PHOTO_SIZE_BYTES
      : MAX_ATTACHMENT_SIZE_BYTES;
    if (value.sizeBytes > limit) {
      context.addIssue({
        code: "custom",
        message: isPhoto
          ? "Profile photos must be 8 MB or smaller."
          : "Attachments must be 20 MB or smaller.",
      });
    }
  });

export const attachmentFinalizeSchema = attachmentTargetSchema;

export type AttachmentTargetInput = z.infer<typeof attachmentTargetSchema>;
export type AttachmentBeginInput = z.infer<typeof attachmentBeginSchema>;

export const attachmentCategoryLabels: Record<AttachmentCategory, string> = {
  receipt: "Receipt",
  school_form: "School form",
  medical_letter: "Medical letter",
  registration: "Registration",
  camp: "Camp information",
  insurance: "Insurance",
  profile_photo: "Profile photo",
  other: "Other",
};

export function attachmentSizeLabel(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function safeAttachmentFileName(fileName: string) {
  const normalized = fileName
    .normalize("NFKC")
    .replace(/[\\/]+/g, "-")
    .replace(/[^\p{L}\p{N}._()\- ]/gu, "")
    .replace(/\s+/g, " ")
    .trim();

  return (normalized || "attachment").slice(0, 180);
}

export function attachmentStorageKey(input: {
  calendarId: string;
  attachmentId: string;
  originalFileName: string;
}) {
  return `covie/${input.calendarId}/attachments/${input.attachmentId}/${safeAttachmentFileName(
    input.originalFileName,
  )}`;
}

export async function assertAttachmentTarget(
  calendarId: string,
  target: Pick<z.infer<typeof attachmentTargetSchema>, "entityType" | "entityId">,
) {
  const db = getDb();

  if (target.entityType === "expense") {
    const rows = await db
      .select({ id: expenses.id })
      .from(expenses)
      .where(
        and(
          eq(expenses.calendarId, calendarId),
          eq(expenses.id, target.entityId),
        ),
      )
      .limit(1);
    if (!rows[0]) throw new Error("Expense not found.");
    return;
  }

  if (target.entityType === "responsibility") {
    const rows = await db
      .select({ id: responsibilities.id })
      .from(responsibilities)
      .where(
        and(
          eq(responsibilities.calendarId, calendarId),
          eq(responsibilities.id, target.entityId),
        ),
      )
      .limit(1);
    if (!rows[0]) throw new Error("Responsibility not found.");
    return;
  }

  if (target.entityType === "event") {
    const rows = await db
      .select({ id: events.id })
      .from(events)
      .where(
        and(eq(events.calendarId, calendarId), eq(events.id, target.entityId)),
      )
      .limit(1);
    if (!rows[0]) throw new Error("Event not found.");
    return;
  }

  const rows = await db
    .select({ id: children.id })
    .from(children)
    .where(
      and(
        eq(children.calendarId, calendarId),
        eq(children.id, target.entityId),
        eq(children.active, true),
      ),
    )
    .limit(1);
  if (!rows[0]) throw new Error("Child profile not found.");
}
