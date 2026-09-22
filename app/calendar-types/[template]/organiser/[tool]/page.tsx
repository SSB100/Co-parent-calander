import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TemplateShell } from "@/components/templates/template-shell";
import { loadTemplatePage } from "@/lib/templates/load-template-page";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ template: string; tool: string }>;
}): Promise<Metadata> {
  const { template, tool } = await params;
  const { manifest } = await loadTemplatePage(template);
  const item = manifest.organiserTools.find((entry) => entry.key === tool);
  if (!item) return { title: "Organiser" };
  return { title: item.label };
}

export default async function CalendarTypeOrganiserPage({
  params,
}: {
  params: Promise<{ template: string; tool: string }>;
}) {
  const { template, tool } = await params;
  const { slug, session, calendars, manifest } =
    await loadTemplatePage(template);

  const item = manifest.organiserTools.find((entry) => entry.key === tool);
  if (!item) notFound();

  return (
    <TemplateShell
      slug={slug}
      calendars={calendars}
      currentCalendarId={session.calendarId}
      defaultName={session.userName}
      activeSection={item.key}
    />
  );
}
