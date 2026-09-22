import { notFound, redirect } from "next/navigation";
import { listCalendarNavigationOptions } from "@/lib/calendars/navigation";
import { getCalendarSession } from "@/lib/security/session";
import {
  calendarPathForType,
  getCalendarTemplateBySlug,
  isAdditionalCalendarTemplateSlug,
} from "@/lib/templates/calendar-templates";
import {
  TemplateShell,
  type TemplateSection,
} from "@/components/templates/template-shell";

export async function TemplateRoute({
  template,
  section,
  activeToolKey,
}: {
  template: string;
  section: TemplateSection;
  activeToolKey?: string;
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

  const calendars = await listCalendarNavigationOptions(session.userId);

  return (
    <TemplateShell
      slug={template}
      calendars={calendars}
      currentCalendarId={session.calendarId}
      defaultName={session.userName}
      section={section}
      activeToolKey={activeToolKey}
    />
  );
}
