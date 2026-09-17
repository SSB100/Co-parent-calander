import { CalendarShell } from "@/components/calendar/calendar-shell";
import { RecurringSchedulePanel } from "@/components/calendar/recurring-schedule-panel";
import { SharePanel } from "@/components/calendar/share-panel";
import { getEditorSession } from "@/lib/security/session";

export default async function Home() {
  const session = await getEditorSession();

  return (
    <>
      <CalendarShell />
      {session ? <RecurringSchedulePanel /> : null}
      {session ? <SharePanel /> : null}
    </>
  );
}
