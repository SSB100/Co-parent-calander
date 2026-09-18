import { and, asc, eq, inArray, lte, or, sql as drizzleSql } from "drizzle-orm";
import { deletePrivateBlob } from "@/lib/attachments/blob";
import { getDb, getSql } from "@/lib/db";
import { storageCleanupJobs } from "@/lib/db/schema";
import {
  AUDIT_RETENTION_DAYS,
  DRAFT_PROPOSAL_RETENTION_DAYS,
  nextStorageCleanupRetryDelayMs,
  PENDING_ATTACHMENT_RETENTION_DAYS,
  storageCleanupErrorMessage,
  TERMINAL_PROPOSAL_RETENTION_DAYS,
} from "@/lib/retention/policy";

const STORAGE_CLEANUP_LEASE_MS = 10 * 60 * 1000;

type StorageCleanupResult = {
  processed: number;
  succeeded: number;
  retrying: number;
};

export async function processDueStorageCleanupJobs(
  input: { limit?: number; storageKeys?: string[] } = {},
): Promise<StorageCleanupResult> {
  const storageKeys = input.storageKeys
    ? [...new Set(input.storageKeys.filter(Boolean))]
    : undefined;
  if (storageKeys?.length === 0) {
    return { processed: 0, succeeded: 0, retrying: 0 };
  }

  const db = getDb();
  const now = new Date();
  const dueCondition = or(
    and(
      inArray(storageCleanupJobs.status, ["pending", "retry"]),
      lte(storageCleanupJobs.availableAt, now),
    ),
    and(
      eq(storageCleanupJobs.status, "processing"),
      lte(storageCleanupJobs.leaseExpiresAt, now),
    ),
  )!;

  const jobs = await db
    .select({
      id: storageCleanupJobs.id,
      storageKey: storageCleanupJobs.storageKey,
    })
    .from(storageCleanupJobs)
    .where(
      storageKeys
        ? and(dueCondition, inArray(storageCleanupJobs.storageKey, storageKeys))
        : dueCondition,
    )
    .orderBy(asc(storageCleanupJobs.availableAt), asc(storageCleanupJobs.createdAt))
    .limit(Math.max(1, Math.min(input.limit ?? 50, 100)));

  let succeeded = 0;
  let retrying = 0;

  for (const job of jobs) {
    const claimedAt = new Date();
    const claimableCondition = or(
      and(
        inArray(storageCleanupJobs.status, ["pending", "retry"]),
        lte(storageCleanupJobs.availableAt, claimedAt),
      ),
      and(
        eq(storageCleanupJobs.status, "processing"),
        lte(storageCleanupJobs.leaseExpiresAt, claimedAt),
      ),
    )!;
    const claimed = await db
      .update(storageCleanupJobs)
      .set({
        status: "processing",
        attemptCount: drizzleSql`${storageCleanupJobs.attemptCount} + 1`,
        lastAttemptedAt: claimedAt,
        leaseExpiresAt: new Date(claimedAt.getTime() + STORAGE_CLEANUP_LEASE_MS),
        updatedAt: claimedAt,
      })
      .where(and(eq(storageCleanupJobs.id, job.id), claimableCondition))
      .returning({
        id: storageCleanupJobs.id,
        storageKey: storageCleanupJobs.storageKey,
        attemptCount: storageCleanupJobs.attemptCount,
      });

    const claimedJob = claimed[0];
    if (!claimedJob) continue;

    try {
      await deletePrivateBlob(claimedJob.storageKey);
      await db
        .delete(storageCleanupJobs)
        .where(
          and(
            eq(storageCleanupJobs.id, claimedJob.id),
            eq(storageCleanupJobs.status, "processing"),
            eq(storageCleanupJobs.lastAttemptedAt, claimedAt),
          ),
        );
      succeeded += 1;
    } catch (error) {
      const failedAt = new Date();
      await db
        .update(storageCleanupJobs)
        .set({
          status: "retry",
          availableAt: new Date(
            failedAt.getTime() +
              nextStorageCleanupRetryDelayMs(claimedJob.attemptCount),
          ),
          leaseExpiresAt: null,
          lastError: storageCleanupErrorMessage(error),
          updatedAt: failedAt,
        })
        .where(
          and(
            eq(storageCleanupJobs.id, claimedJob.id),
            eq(storageCleanupJobs.status, "processing"),
            eq(storageCleanupJobs.lastAttemptedAt, claimedAt),
          ),
        );
      retrying += 1;
    }
  }

  return { processed: succeeded + retrying, succeeded, retrying };
}

export async function runRetentionMaintenance() {
  const sql = getSql();

  const stalePendingAttachments = await sql`
    DELETE FROM attachments
    WHERE status = 'pending'
      AND created_at < now() - (${PENDING_ATTACHMENT_RETENTION_DAYS}::integer * interval '1 day')
    RETURNING id
  `;

  const expiredDraftProposals = await sql`
    DELETE FROM approval_proposals
    WHERE status = 'draft'
      AND updated_at < now() - (${DRAFT_PROPOSAL_RETENTION_DAYS}::integer * interval '1 day')
    RETURNING id
  `;

  const expiredTerminalProposals = await sql`
    DELETE FROM approval_proposals
    WHERE status IN ('approved', 'declined', 'withdrawn')
      AND updated_at < now() - (${TERMINAL_PROPOSAL_RETENTION_DAYS}::integer * interval '1 day')
    RETURNING id
  `;

  const expiredAuditEntries = await sql`
    DELETE FROM audit_log
    WHERE occurred_at < now() - (${AUDIT_RETENTION_DAYS}::integer * interval '1 day')
    RETURNING id
  `;

  const storageCleanup = await processDueStorageCleanupJobs({ limit: 50 });

  return {
    stalePendingAttachments: stalePendingAttachments.length,
    expiredDraftProposals: expiredDraftProposals.length,
    expiredTerminalProposals: expiredTerminalProposals.length,
    expiredAuditEntries: expiredAuditEntries.length,
    storageCleanup,
  };
}
