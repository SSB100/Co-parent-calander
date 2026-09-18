import { after } from "next/server";
import { processDueStorageCleanupJobs } from "@/lib/retention/service";

export function processStorageCleanupAfterResponse(pathnames: string[]) {
  const unique = [...new Set(pathnames.filter(Boolean))];
  if (unique.length === 0) return;

  after(async () => {
    try {
      await processDueStorageCleanupJobs({
        storageKeys: unique,
        limit: unique.length,
      });
    } catch {}
  });
}
