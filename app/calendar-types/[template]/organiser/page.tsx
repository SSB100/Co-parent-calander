import { notFound, redirect } from "next/navigation";
import {
  getCalendarTemplateBySlug,
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

  const firstTool = getCalendarTemplateBySlug(template).organiserTools[0];
  if (!firstTool) notFound();

  redirect(`/calendar-types/${template}/organiser/${firstTool.key}`);
}
