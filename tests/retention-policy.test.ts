import assert from "node:assert/strict";
import test from "node:test";
import {
  AUDIT_RETENTION_DAYS,
  DRAFT_PROPOSAL_RETENTION_DAYS,
  nextStorageCleanupRetryDelayMs,
  PENDING_ATTACHMENT_RETENTION_DAYS,
  storageCleanupErrorMessage,
  TERMINAL_PROPOSAL_RETENTION_DAYS,
} from "@/lib/retention/policy";

test("retention windows are explicit and preserve active shared records", () => {
  assert.equal(PENDING_ATTACHMENT_RETENTION_DAYS, 1);
  assert.equal(DRAFT_PROPOSAL_RETENTION_DAYS, 90);
  assert.equal(TERMINAL_PROPOSAL_RETENTION_DAYS, 730);
  assert.equal(AUDIT_RETENTION_DAYS, 730);
});

test("storage cleanup retry delay backs off and caps at one day", () => {
  assert.equal(nextStorageCleanupRetryDelayMs(1), 5 * 60 * 1000);
  assert.equal(nextStorageCleanupRetryDelayMs(2), 10 * 60 * 1000);
  assert.equal(nextStorageCleanupRetryDelayMs(100), 24 * 60 * 60 * 1000);
});

test("storage cleanup errors are bounded and redact credentials", () => {
  const message = storageCleanupErrorMessage(
    new Error(`Bearer private-token token=also-private ${"x".repeat(400)}`),
  );

  assert.doesNotMatch(message, /private-token|also-private/);
  assert.match(message, /Bearer \[redacted\]/);
  assert.match(message, /token=\[redacted\]/);
  assert.equal(message.length, 300);
});
