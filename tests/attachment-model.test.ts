import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_ATTACHMENT_SIZE_BYTES,
  MAX_PROFILE_PHOTO_SIZE_BYTES,
  attachmentBeginSchema,
  attachmentSizeLabel,
  attachmentStorageKey,
  safeAttachmentFileName,
} from "@/lib/attachments/model";

const expenseId = "11111111-1111-4111-8111-111111111111";
const childId = "22222222-2222-4222-8222-222222222222";

test("supporting attachments accept planned document types within 20 MB", () => {
  const parsed = attachmentBeginSchema.safeParse({
    entityType: "expense",
    entityId: expenseId,
    role: "supporting",
    category: "receipt",
    originalFileName: "School shoes receipt.pdf",
    contentType: "application/pdf",
    sizeBytes: MAX_ATTACHMENT_SIZE_BYTES,
  });
  assert.equal(parsed.success, true);
});

test("supporting attachments reject executables and oversize files", () => {
  assert.equal(
    attachmentBeginSchema.safeParse({
      entityType: "expense",
      entityId: expenseId,
      role: "supporting",
      category: "other",
      originalFileName: "unsafe.exe",
      contentType: "application/x-msdownload",
      sizeBytes: 1000,
    }).success,
    false,
  );

  assert.equal(
    attachmentBeginSchema.safeParse({
      entityType: "expense",
      entityId: expenseId,
      role: "supporting",
      category: "receipt",
      originalFileName: "big.pdf",
      contentType: "application/pdf",
      sizeBytes: MAX_ATTACHMENT_SIZE_BYTES + 1,
    }).success,
    false,
  );
});

test("profile photo role is restricted to child images and 8 MB", () => {
  assert.equal(
    attachmentBeginSchema.safeParse({
      entityType: "child",
      entityId: childId,
      role: "profile_photo",
      category: "profile_photo",
      originalFileName: "profile.webp",
      contentType: "image/webp",
      sizeBytes: MAX_PROFILE_PHOTO_SIZE_BYTES,
    }).success,
    true,
  );

  assert.equal(
    attachmentBeginSchema.safeParse({
      entityType: "expense",
      entityId: expenseId,
      role: "profile_photo",
      category: "profile_photo",
      originalFileName: "profile.jpg",
      contentType: "image/jpeg",
      sizeBytes: 1000,
    }).success,
    false,
  );

  assert.equal(
    attachmentBeginSchema.safeParse({
      entityType: "child",
      entityId: childId,
      role: "profile_photo",
      category: "profile_photo",
      originalFileName: "profile.pdf",
      contentType: "application/pdf",
      sizeBytes: 1000,
    }).success,
    false,
  );
});

test("storage path sanitizes user filenames and remains calendar scoped", () => {
  assert.equal(
    safeAttachmentFileName("../../school / form?.pdf"),
    "..-..-school - form.pdf",
  );

  const path = attachmentStorageKey({
    calendarId: "calendar-123",
    attachmentId: "attachment-456",
    originalFileName: "../../school / form?.pdf",
  });
  assert.equal(
    path,
    "covie/calendar-123/attachments/attachment-456/..-..-school - form.pdf",
  );
});

test("file-size labels remain human readable", () => {
  assert.equal(attachmentSizeLabel(500), "500 B");
  assert.equal(attachmentSizeLabel(2048), "2.0 KB");
  assert.equal(attachmentSizeLabel(2 * 1024 * 1024), "2.0 MB");
});
