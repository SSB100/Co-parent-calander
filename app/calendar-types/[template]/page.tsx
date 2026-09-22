import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { TemplateShell } from "@/components/templates/template-shell";
import { listCalendarNavigationOptions } from "@/lib/calendars/navigation";
import { getCalendarSession } from "@/lib/security/session";
import {
  additionalCalendarTemplateSlugs,
  calendarPathForType,
  getCalendarTemplateBySlug,
  isAdditionalCalendarTemplateSlug,
} from "@/lib/templates/calendar-templates";

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return additionalCalendarTemplateSlugs.map((template) => ({ template }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ template: string }>;
}): Promise<Metadata> {
  const { template } = await params;
  if (!isAdditionalCalendarTemplateSlug(template)) {
    return { title: "Calendar type" };
  }

  return { title: getCalendarTemplateBySlug(template).name };
}

export default async function CalendarTypeShellPage({
  params,
}: {
  params: Promise<{ template: string }>;
}) {
  const { template } = await params;
  if (!isAdditionalCalendarTemplateSlug(template)) notFound();

  const session = await getCalendarSession();
  if (!session) redirect("/onboarding");

  const manifest = getCalendarTemplateBySlug(template);
  if (session.calendarType !== manifest.id) {
    redirect(calendarPathForType(session.calendarType));
  }

  const calendars = await listCalendarNavigationOptions(session.userId);

  return (
    <TemplateShell
      slug={template}
      calendars={calendars}
      currentCalendarId={session.calendarId}
      defaultName={session.userName}
    />
  );
}
