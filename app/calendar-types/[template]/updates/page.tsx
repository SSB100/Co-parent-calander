import type { Metadata } from "next";
import { TemplateRoute } from "@/components/templates/template-route";
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
    return { title: "Updates" };
  }

  return {
    title: `Updates · ${getCalendarTemplateBySlug(template).name}`,
  };
}

export default async function TemplateUpdatesPage({
  params,
}: {
  params: Promise<{ template: string }>;
}) {
  const { template } = await params;
  return <TemplateRoute template={template} section="updates" />;
}
