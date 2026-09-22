import type { Metadata } from "next";
import { TemplateRoute } from "@/components/templates/template-route";
import {
  additionalCalendarTemplateSlugs,
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
  return <TemplateRoute template={template} section="calendar" />;
}
