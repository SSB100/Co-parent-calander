import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

async function source(file) {
  return readFile(path.join(root, file), "utf8");
}

test("0016 adds a durable private-storage cleanup queue and deletion trigger", async () => {
  const [migration, schema, barrel] = await Promise.all([
    source("drizzle/0016_retention_foundation.sql"),
    source("lib/db/schema/retention.ts"),
    source("lib/db/schema.ts"),
  ]);

  assert.match(migration, /CREATE TABLE "storage_cleanup_jobs"/);
  assert.match(migration, /storage_cleanup_provider_key_unique/);
  assert.match(migration, /storage_cleanup_lease_state_valid/);
  assert.match(migration, /queue_attachment_storage_cleanup_on_delete/);
  assert.match(migration, /BEFORE DELETE ON "attachments"/);
  assert.match(migration, /'0016', 'Privacy retention and durable storage cleanup'/);
  assert.match(schema, /export const storageCleanupJobs = pgTable/);
  assert.match(schema, /storageCleanupStatus/);
  assert.match(barrel, /schema\/retention/);
});

test("attachment deletion processes the durable queue after the response", async () => {
  const [service, dispatch] = await Promise.all([
    source("lib/attachments/service.ts"),
    source("lib/attachments/dispatch.ts"),
  ]);

  assert.match(service, /processStorageCleanupAfterResponse/);
  assert.doesNotMatch(service, /deletePrivateBlobsAfterResponse/);
  assert.match(dispatch, /processDueStorageCleanupJobs/);
  assert.match(dispatch, /after\(async \(\) =>/);
  assert.doesNotMatch(dispatch, /deletePrivateBlob/);
});

test("retention maintenance expires only stale transient or historical records", async () => {
  const [service, policy] = await Promise.all([
    source("lib/retention/service.ts"),
    source("lib/retention/policy.ts"),
  ]);

  assert.match(service, /DELETE FROM attachments[\s\S]*status = 'pending'/);
  assert.match(service, /DELETE FROM approval_proposals[\s\S]*status = 'draft'/);
  assert.match(service, /status IN \('approved', 'declined', 'withdrawn'\)/);
  assert.match(service, /DELETE FROM audit_log/);
  assert.doesNotMatch(service, /DELETE FROM (children|events|expenses|responsibilities)/);
  assert.match(policy, /PENDING_ATTACHMENT_RETENTION_DAYS = 1/);
  assert.match(policy, /DRAFT_PROPOSAL_RETENTION_DAYS = 90/);
  assert.match(policy, /TERMINAL_PROPOSAL_RETENTION_DAYS = 730/);
  assert.match(policy, /AUDIT_RETENTION_DAYS = 730/);
});

test("the existing authenticated daily worker runs retention and storage cleanup", async () => {
  const [worker, vercel] = await Promise.all([
    source("app/api/google-calendar/worker/route.ts"),
    source("vercel.json"),
  ]);

  assert.match(worker, /runRetentionMaintenance/);
  assert.match(worker, /CRON_SECRET/);
  assert.match(worker, /processDueGoogleSyncJobs/);
  assert.match(vercel, /\/api\/google-calendar\/worker/);
  assert.match(vercel, /17 2 \* \* \*/);
});
