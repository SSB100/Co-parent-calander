import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TemplateShell } from "@/components/templates/template-shell";
import {
  additionalCalendarTemplateSlugs,
  getCalendarTemplateBySlug,
  isAdditionalCalendarTemplateSlug,
} from "@/lib/templates/calendar-templates";

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

  return <TemplateShell slug={template} />;
}
