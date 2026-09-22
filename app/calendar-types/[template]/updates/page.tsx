import type { Metadata } from "next";
import { TemplateShell } from "@/components/templates/template-shell";
import { loadTemplatePage } from "@/lib/templates/load-template-page";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Updates" };

export default async function CalendarTypeUpdatesPage({
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
      activeSection="updates"
    />
  );
}
