import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

async function source(file) {
  return readFile(path.join(root, file), "utf8");
}

test("Phase 7 metadata schema stores private-object references rather than bytes", async () => {
  const [migration, schema] = await Promise.all([
    source("drizzle/0010_attachments.sql"),
    source("lib/db/schema/attachments.ts"),
  ]);

  assert.match(migration, /CREATE TABLE "attachments"/);
  assert.match(migration, /CREATE TABLE "attachment_links"/);
  assert.match(migration, /storage_key/);
  assert.match(migration, /primary_entity_type/);
  assert.match(migration, /primary_entity_id/);
  assert.match(migration, /primary_role/);
  assert.match(migration, /child_profile_photo_unique/);
  assert.match(schema, /export const attachments = pgTable/);
  assert.match(schema, /export const attachmentLinks = pgTable/);
  assert.doesNotMatch(migration, /bytea|file_bytes|base64/i);
});

test("pending uploads are bound to the exact authorized target before Blob signing", async () => {
  const [route, service] = await Promise.all([
    source("app/api/attachments/route.ts"),
    source("lib/attachments/service.ts"),
  ]);

  assert.match(route, /prepareAttachmentUpload/);
  assert.match(service, /assertAttachmentTarget/);
  assert.match(service, /primary_entity_type/);
  assert.match(service, /primary_entity_id/);
  assert.match(service, /primary_role/);
  assert.match(service, /createPrivateUploadUrl/);
  assert.match(service, /status, uploaded_by/);
});

test("private Blob uses short-lived signed PUT and GET URLs", async () => {
  const blob = await source("lib/attachments/blob.ts");

  assert.match(blob, /issueSignedToken/);
  assert.match(blob, /presignUrl/);
  assert.match(blob, /operations: \["put"\]/);
  assert.match(blob, /operation: "put"/);
  assert.match(blob, /access: "private"/);
  assert.match(blob, /operations: \["get"\]/);
  assert.match(blob, /operation: "get"/);
  assert.match(blob, /UPLOAD_URL_TTL_MS = 10 \* 60 \* 1000/);
  assert.match(blob, /DOWNLOAD_URL_TTL_MS = 5 \* 60 \* 1000/);
});

test("finalization verifies private storage metadata before exposing an attachment", async () => {
  const [route, service] = await Promise.all([
    source("app/api/attachments/[id]/route.ts"),
    source("lib/attachments/service.ts"),
  ]);

  assert.match(route, /finalizeAttachment/);
  assert.match(service, /privateBlobMetadata/);
  assert.match(service, /metadata\.pathname !== attachment\.storageKey/);
  assert.match(service, /metadata\.size !== attachment\.sizeBytes/);
  assert.match(service, /metadata\.contentType/);
  assert.match(service, /SET status = 'ready'/);
  assert.match(service, /INSERT INTO attachment_links/);
});

test("profile photos replace the old private photo through the same attachment layer", async () => {
  const [service, dispatch, photo] = await Promise.all([
    source("lib/attachments/service.ts"),
    source("lib/attachments/dispatch.ts"),
    source("components/attachments/profile-photo.tsx"),
  ]);

  assert.match(service, /eq\(attachmentLinks\.role, "profile_photo"\)/);
  assert.match(service, /DELETE FROM attachments/);
  assert.match(service, /deletePrivateBlobsAfterResponse/);
  assert.match(dispatch, /after\(async \(\) =>/);
  assert.match(photo, /role: "profile_photo"/);
  assert.match(photo, /category: "profile_photo"/);
  assert.match(photo, /\/api\/attachments/);
  assert.doesNotMatch(photo, /base64|data:image/);
});

test("viewers may list and download but all attachment mutations require editor access", async () => {
  const [listRoute, mutateRoute, downloadRoute] = await Promise.all([
    source("app/api/attachments/route.ts"),
    source("app/api/attachments/[id]/route.ts"),
    source("app/api/attachments/[id]/download/route.ts"),
  ]);

  assert.match(listRoute, /getCalendarSession/);
  assert.match(downloadRoute, /getCalendarSession/);
  assert.match(listRoute, /getEditorSession/);
  assert.match(mutateRoute, /getEditorSession/);
  assert.match(listRoute, /Editor access is required/);
  assert.match(mutateRoute, /Editor access is required/);
});

test("attachment routes delegate storage and persistence orchestration to the feature service", async () => {
  const [listRoute, mutateRoute, downloadRoute, service] = await Promise.all([
    source("app/api/attachments/route.ts"),
    source("app/api/attachments/[id]/route.ts"),
    source("app/api/attachments/[id]/download/route.ts"),
    source("lib/attachments/service.ts"),
  ]);

  assert.match(listRoute, /listAttachments/);
  assert.match(listRoute, /prepareAttachmentUpload/);
  assert.match(mutateRoute, /finalizeAttachment/);
  assert.match(mutateRoute, /deleteAttachment/);
  assert.match(downloadRoute, /getAttachmentDownload/);

  for (const route of [listRoute, mutateRoute, downloadRoute]) {
    assert.doesNotMatch(route, /getDb|getSql|INSERT INTO attachments|UPDATE attachments|DELETE FROM attachments/);
  }

  assert.match(service, /INSERT INTO attachments/);
  assert.match(service, /UPDATE attachments/);
  assert.match(service, /DELETE FROM attachments/);
});

test("documents are attached to agreed feature records instead of pending proposals", async () => {
  const [expense, responsibility, dayDetails, panel] = await Promise.all([
    source("components/expenses/expenses-shell.tsx"),
    source("components/responsibilities/responsibilities-shell.tsx"),
    source("components/calendar/day-details-panel.tsx"),
    source("components/attachments/attachment-panel.tsx"),
  ]);

  assert.match(expense, /entityType="expense"[\s\S]{0,120}entityId=\{expense\.id\}/);
  assert.match(
    responsibility,
    /entityType="responsibility"[\s\S]{0,120}entityId=\{item\.id\}/,
  );
  assert.match(dayDetails, /entityType="event"[\s\S]{0,120}entityId=\{event\.id\}/);
  assert.match(panel, /entityId/);

  assert.ok(expense.indexOf("Waiting for agreement") < expense.indexOf("Agreed expenses"));
  assert.ok(
    expense.indexOf("Agreed expenses") < expense.indexOf('entityType="expense"'),
  );
  assert.ok(
    responsibility.indexOf("Waiting for agreement") <
      responsibility.indexOf("Agreed responsibilities"),
  );
  assert.ok(
    responsibility.indexOf("Agreed responsibilities") <
      responsibility.indexOf('entityType="responsibility"'),
  );
});

test("child profile supports both supporting documents and private profile photos", async () => {
  const child = await source("components/children/child-profile-shell.tsx");

  assert.match(child, /ProfilePhoto/);
  assert.match(child, /entityType="child"/);
  assert.match(child, /title="Documents"/);
  assert.match(child, /Private school, medical, registration/);
});

test("supporting file types and size boundaries are intentionally narrow", async () => {
  const model = await source("lib/attachments/model.ts");

  assert.match(model, /application\/pdf/);
  assert.match(model, /image\/jpeg/);
  assert.match(model, /image\/png/);
  assert.match(model, /image\/webp/);
  assert.match(model, /application\/msword/);
  assert.match(model, /wordprocessingml\.document/);
  assert.match(model, /MAX_ATTACHMENT_SIZE_BYTES = 20 \* 1024 \* 1024/);
  assert.match(model, /MAX_PROFILE_PHOTO_SIZE_BYTES = 8 \* 1024 \* 1024/);
  assert.doesNotMatch(model, /zip|javascript|x-msdownload/);
});

test("attachment changes are audited without storing permanent private URLs", async () => {
  const [service, migration] = await Promise.all([
    source("lib/attachments/service.ts"),
    source("drizzle/0010_attachments.sql"),
  ]);

  assert.match(service, /'attachment\.upload'/);
  assert.match(service, /'attachment\.delete'/);
  assert.match(service, /child_profile\.photo_update/);
  assert.match(service, /child_profile\.document_add/);
  assert.doesNotMatch(migration, /download_url|public_url|signed_url/i);
});

test("attachment workflows create no Google Calendar sync jobs or approval proposals", async () => {
  const files = await Promise.all([
    source("app/api/attachments/route.ts"),
    source("app/api/attachments/[id]/route.ts"),
    source("app/api/attachments/[id]/download/route.ts"),
    source("lib/attachments/service.ts"),
    source("lib/attachments/model.ts"),
    source("lib/attachments/blob.ts"),
  ]);

  for (const text of files) {
    assert.doesNotMatch(text, /google-calendar|buildCalendarSyncJobStatement/);
    assert.doesNotMatch(text, /createApprovalProposal|getSharedApprovalTarget/);
  }
});
