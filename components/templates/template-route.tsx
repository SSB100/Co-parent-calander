import { notFound, redirect } from "next/navigation";
import {
  listArchivedCalendarNavigationOptions,
  listCalendarNavigationOptions,
} from "@/lib/calendars/navigation";
import { getCalendarSession } from "@/lib/security/session";
import {
  calendarPathForType,
  getCalendarTemplateBySlug,
  isAdditionalCalendarTemplateSlug,
} from "@/lib/templates/calendar-templates";
import { ensureStaffRosterMember } from "@/lib/staff-rosters/service";
import {
  TemplateShell,
  type TemplateSection,
} from "@/components/templates/template-shell";

export async function TemplateRoute({
  template,
  section,
  activeToolKey,
  initialDate,
  initialRecord,
}: {
  template: string;
  section: TemplateSection;
  activeToolKey?: string;
  initialDate?: string;
  initialRecord?: string;
}) {
  if (!isAdditionalCalendarTemplateSlug(template)) notFound();

  const session = await getCalendarSession();
  if (!session) redirect("/onboarding");

  const manifest = getCalendarTemplateBySlug(template);
  if (session.calendarType !== manifest.id) {
    redirect(calendarPathForType(session.calendarType));
  }

  if (
    section === "organiser" &&
    (!activeToolKey ||
      !manifest.organiserTools.some((tool) => tool.key === activeToolKey))
  ) {
    notFound();
  }

  let staffAccessRole: "owner" | "manager" | "staff" | null = null;
  if (manifest.id === "staff_rosters") {
    const staffMember = await ensureStaffRosterMember(session);
    staffAccessRole = staffMember.accessRole;

    if (
      staffAccessRole === "staff" &&
      section === "organiser" &&
      activeToolKey !== "availability" &&
      activeToolKey !== "timesheets"
    ) {
      redirect("/calendar-types/staff-rosters");
    }
  }

  const [calendars, archivedCalendars] = await Promise.all([
    listCalendarNavigationOptions(session.userId),
    listArchivedCalendarNavigationOptions(session.userId),
  ]);

  return (
    <TemplateShell
      slug={template}
      calendars={calendars}
      archivedCalendars={archivedCalendars}
      currentCalendarId={session.calendarId}
      defaultName={session.userName}
      section={section}
      activeToolKey={activeToolKey}
      initialDate={initialDate}
      initialRecord={initialRecord}
      staffAccessRole={staffAccessRole}
    />
  );
}
