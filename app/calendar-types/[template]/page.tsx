import type { Metadata } from "next";
import { TemplateShell } from "@/components/templates/template-shell";
import { loadTemplatePage } from "@/lib/templates/load-template-page";
import {
  getCalendarTemplateBySlug,
  isAdditionalCalendarTemplateSlug,
} from "@/lib/templates/calendar-templates";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ template: string }>;
}): Promise<Metadata> {
  const { template } = await params;
  if (!isAdditionalCalendarTemplateSlug(template)) {
    return { title: "Calendar" };
  }

  return { title: getCalendarTemplateBySlug(template).name };
}

export default async function CalendarTypePage({
  params,
}: {
  params: Promise<{ template: string }>;
}) {
  const { template } = await params;
  const { slug, session, calendars } = await loadTemplatePage(template);

  return (
    <TemplateShell
      slug={slug}
      calendars={calendars}
      currentCalendarId={session.calendarId}
      defaultName={session.userName}
      activeSection="calendar"
    />
  );
}
