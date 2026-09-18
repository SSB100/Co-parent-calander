export const PENDING_ATTACHMENT_RETENTION_DAYS = 1;
export const DRAFT_PROPOSAL_RETENTION_DAYS = 90;
export const TERMINAL_PROPOSAL_RETENTION_DAYS = 730;
export const AUDIT_RETENTION_DAYS = 730;

const STORAGE_CLEANUP_BASE_RETRY_MS = 5 * 60 * 1000;
const STORAGE_CLEANUP_MAX_RETRY_MS = 24 * 60 * 60 * 1000;

export function nextStorageCleanupRetryDelayMs(attemptCount: number) {
  const exponent = Math.min(20, Math.max(0, attemptCount - 1));
  return Math.min(
    STORAGE_CLEANUP_MAX_RETRY_MS,
    STORAGE_CLEANUP_BASE_RETRY_MS * 2 ** exponent,
  );
}

export function storageCleanupErrorMessage(error: unknown) {
  const message =
    error instanceof Error ? error.message : "Private storage cleanup failed.";

  return message
    .replace(/Bearer\s+[^\s]+/gi, "Bearer [redacted]")
    .replace(/(token|secret|password)=([^\s&]+)/gi, "$1=[redacted]")
    .slice(0, 300);
}
