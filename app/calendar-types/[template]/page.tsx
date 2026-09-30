import { safeSourceDate, safeSourceRecord } from "@/lib/personal/source-navigation";
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
  params, searchParams,
}: {
  params: Promise<{ template: string }>;
  searchParams: Promise<{ date?: string; record?: string; welcome?: string }>;
}) {
  const { template } = await params;
  const query = await searchParams;
  return <TemplateRoute template={template} section="calendar" showSetupGuide={query.welcome === "created"} initialDate={safeSourceDate(query.date)} initialRecord={safeSourceRecord(query.record)} />;
}
