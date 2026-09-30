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
import { getNonStaffWorkspaceRole } from "@/lib/templates/workspace-access";
import { workspaceOrganiserTools, type WorkspaceRole } from "@/lib/templates/workspace-navigation";
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
  showSetupGuide = false,
}: {
  template: string;
  section: TemplateSection;
  activeToolKey?: string;
  initialDate?: string;
  initialRecord?: string;
  showSetupGuide?: boolean;
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
  let workspaceRole: WorkspaceRole;
  if (manifest.id === "staff_rosters") {
    const staffMember = await ensureStaffRosterMember(session);
    staffAccessRole = staffMember.accessRole;
    workspaceRole = staffAccessRole;

    if (
      staffAccessRole === "staff" &&
      section === "organiser" &&
      activeToolKey !== "availability" &&
      activeToolKey !== "timesheets"
    ) {
      redirect("/calendar-types/staff-rosters");
    }
  } else {
    workspaceRole = await getNonStaffWorkspaceRole(session);
    if (section === "organiser" && !workspaceOrganiserTools(manifest.id, workspaceRole).some((tool) => tool.key === activeToolKey)) redirect(calendarPathForType(session.calendarType));
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
      workspaceRole={workspaceRole}
      setupGuideAccount={showSetupGuide && workspaceRole === "owner" ? session.userId : undefined}
    />
  );
}
