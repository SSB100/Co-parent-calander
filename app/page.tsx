import { CalendarShell } from "@/components/calendar/calendar-shell";
import { SharePanel } from "@/components/calendar/share-panel";
import { getEditorSession } from "@/lib/security/session";

export default async function Home() {
  const session = await getEditorSession();

  return (
    <>
      <CalendarShell />
      {session ? <SharePanel /> : null}
    </>
  );
}
