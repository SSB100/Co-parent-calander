import { notFound, redirect } from "next/navigation";
import { getCalendarSession } from "@/lib/security/session";
import { getNonStaffWorkspaceRole } from "@/lib/templates/workspace-access";
import { workspaceOrganiserTools } from "@/lib/templates/workspace-navigation";
import {
  getCalendarTemplateBySlug,
  calendarPathForType,
  isAdditionalCalendarTemplateSlug,
} from "@/lib/templates/calendar-templates";

export const dynamic = "force-dynamic";

export default async function TemplateOrganiserPage({
  params,
}: {
  params: Promise<{ template: string }>;
}) {
  const { template } = await params;
  if (!isAdditionalCalendarTemplateSlug(template)) notFound();
  if (template === "staff-rosters") redirect(`/calendar-types/${template}`);

  const session = await getCalendarSession();
  if (!session) redirect("/onboarding");
  const manifest = getCalendarTemplateBySlug(template);
  if (session.calendarType !== manifest.id) redirect(calendarPathForType(session.calendarType));
  const role = await getNonStaffWorkspaceRole(session);
  const firstTool = workspaceOrganiserTools(manifest.id, role)[0];
  if (!firstTool) redirect(calendarPathForType(session.calendarType));

  redirect(`/calendar-types/${template}/organiser/${firstTool.key}`);
}
