# Privacy and retention

> **Release status — 18 September 2026:** the retention foundation is staged in migration `0016_retention_foundation.sql`. Production remains at `0012`; no retention deletion or durable Blob cleanup processing begins until migrations `0013`–`0016` are deliberately validated and applied in order and the matching application is explicitly deployed.

Covie keeps active family records until a user changes or deletes them. The daily maintenance policy applies only to incomplete uploads, abandoned drafts and old operational history.

## Retention windows

- Pending attachment uploads that were never finalized: **24 hours**.
- Draft approval proposals that were never submitted: **90 days**.
- Approved, declined and withdrawn proposals, including their history: **730 days**.
- Audit log entries: **730 days**.
- Waiting proposals: retained until they are resolved or withdrawn.
- Ready attachments and active children, events, expenses, responsibilities and parenting schedules: no automatic age-based deletion.

These limits keep operational accountability while preventing proposal snapshots and audit metadata from becoming an indefinite family-information archive. Covie is an organiser, not a legal evidence repository.

## Durable private-storage cleanup

Migration `0016` adds `storage_cleanup_jobs`. A database trigger queues the provider and private object key in the same transaction whenever an attachment metadata row is deleted, including profile-photo replacement, explicit attachment deletion, stale pending-upload cleanup and cascade deletion.

The queue deliberately does not copy filenames, child identifiers, proposal payloads or other family data.

After a user-triggered deletion, Covie makes a prompt post-response attempt to process the queued object. Failures remain durable in Postgres and retry with capped exponential backoff. The daily authenticated worker reclaims expired processing leases and retries all due jobs. A queue row is removed only after the private Blob deletion succeeds.

## Daily maintenance

The existing `CRON_SECRET`-protected worker runs once daily. Retention maintenance runs before Google Calendar reconciliation so storage cleanup and privacy expiry are not skipped by a later Google failure.

The worker:

1. removes stale Pending attachment metadata; the deletion trigger queues its private object key
2. removes abandoned Draft proposals
3. removes expired terminal proposals and their cascading proposal history
4. removes expired audit entries
5. processes due private-storage cleanup jobs
6. continues with the existing Google Calendar reconciliation work

## Safety boundaries

- No permanent private Blob URL is stored.
- Cleanup errors are length-limited and credentials are redacted before persistence.
- A processing lease lets a later worker recover a job if an invocation stops unexpectedly.
- The unique provider/object-key index prevents duplicate deletion jobs.
- No active domain records are selected by retention age.
- Migration `0016` must be tested after `0013`, `0014` and `0015`; it is not safe to apply out of order.
