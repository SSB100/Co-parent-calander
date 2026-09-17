import { and, asc, eq, inArray, lte } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  calendarSyncJobs,
  googleCalendarConnections,
} from "@/lib/db/schema";
import { syncGoogleConnection } from "@/lib/google-calendar/sync";
import { GoogleReconnectRequiredError } from "@/lib/google-calendar/tokens";

const MAX_RETRIES = 6;
const BASE_RETRY_MS = 5 * 60 * 1000;
const MAX_RETRY_MS = 6 * 60 * 60 * 1000;

export function nextGoogleSyncRetryDelayMs(retryCount: number) {
  return Math.min(MAX_RETRY_MS, BASE_RETRY_MS * 2 ** Math.max(0, retryCount - 1));
}

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : "Google Calendar sync failed.";
  return message.replace(/Bearer\s+[^\s]+/gi, "Bearer [redacted]").slice(0, 300);
}

export async function enqueuePeriodicGoogleReconciliations() {
  const db = getDb();
  const connections = await db
    .select({ id: googleCalendarConnections.id, calendarId: googleCalendarConnections.calendarId })
    .from(googleCalendarConnections)
    .where(inArray(googleCalendarConnections.status, ["active", "initial_sync", "error"]));
  if (connections.length === 0) return 0;

  await db.insert(calendarSyncJobs).values(
    connections.map((connection) => ({
      connectionId: connection.id,
      calendarId: connection.calendarId,
      jobType: "reconcile",
      status: "pending" as const,
    })),
  );
  return connections.length;
}

export async function processDueGoogleSyncJobs(
  input: { calendarId?: string; connectionId?: string; limit?: number } = {},
) {
  const db = getDb();
  const conditions = [
    inArray(calendarSyncJobs.status, ["pending", "retry"]),
    lte(calendarSyncJobs.availableAt, new Date()),
  ];
  if (input.calendarId) conditions.push(eq(calendarSyncJobs.calendarId, input.calendarId));
  if (input.connectionId) conditions.push(eq(calendarSyncJobs.connectionId, input.connectionId));

  const jobs = await db
    .select()
    .from(calendarSyncJobs)
    .where(and(...conditions))
    .orderBy(asc(calendarSyncJobs.createdAt))
    .limit(Math.max(1, Math.min(input.limit ?? 8, 25)));

  let succeeded = 0;
  let failed = 0;
  for (const job of jobs) {
    const claimed = await db
      .update(calendarSyncJobs)
      .set({ status: "processing", lastAttemptedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(calendarSyncJobs.id, job.id),
          inArray(calendarSyncJobs.status, ["pending", "retry"]),
        ),
      )
      .returning({ id: calendarSyncJobs.id });
    if (claimed.length === 0) continue;

    try {
      await syncGoogleConnection({
        connectionId: job.connectionId,
        rangeStart: job.rangeStart,
        rangeEnd: job.rangeEnd,
        force: job.jobType === "full" || job.jobType === "reconcile",
      });
      await db
        .update(calendarSyncJobs)
        .set({
          status: "succeeded",
          completedAt: new Date(),
          lastError: null,
          updatedAt: new Date(),
        })
        .where(eq(calendarSyncJobs.id, job.id));
      succeeded += 1;
    } catch (error) {
      const retryCount = job.retryCount + 1;
      const reconnect = error instanceof GoogleReconnectRequiredError;
      const terminal = reconnect || retryCount >= MAX_RETRIES;
      const message = safeError(error);

      await db
        .update(calendarSyncJobs)
        .set({
          status: terminal ? "failed" : "retry",
          retryCount,
          availableAt: terminal
            ? job.availableAt
            : new Date(Date.now() + nextGoogleSyncRetryDelayMs(retryCount)),
          lastError: message,
          updatedAt: new Date(),
        })
        .where(eq(calendarSyncJobs.id, job.id));
      await db
        .update(googleCalendarConnections)
        .set({
          status: reconnect ? "reconnect_required" : "error",
          lastAttemptedSyncAt: new Date(),
          lastError: message,
          updatedAt: new Date(),
        })
        .where(eq(googleCalendarConnections.id, job.connectionId));
      failed += 1;
    }
  }

  return { processed: succeeded + failed, succeeded, failed };
}
