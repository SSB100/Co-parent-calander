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
  params: Promise<{ template: string; tool: string }>;
}): Promise<Metadata> {
  const { template, tool } = await params;
  if (!isAdditionalCalendarTemplateSlug(template)) {
    return { title: "Organiser" };
  }

  const manifest = getCalendarTemplateBySlug(template);
  const item = manifest.organiserTools.find((candidate) => candidate.key === tool);

  return {
    title: item
      ? `${item.label} · ${manifest.name}`
      : `Organiser · ${manifest.name}`,
  };
}

export default async function TemplateOrganiserToolPage({
  params,
}: {
  params: Promise<{ template: string; tool: string }>;
}) {
  const { template, tool } = await params;
  return (
    <TemplateRoute
      template={template}
      section="organiser"
      activeToolKey={tool}
    />
  );
}
