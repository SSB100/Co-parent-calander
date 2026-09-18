import { after } from "next/server";
import { processDueGoogleSyncJobs } from "@/lib/google-calendar/queue";

export function kickGoogleCalendarSync(calendarId: string, limit = 8) {
  after(async () => {
    try {
      await processDueGoogleSyncJobs({ calendarId, limit });
    } catch (error) {
      console.error("Google Calendar sync kick failed.", {
        calendarId,
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
    }
  });
}
