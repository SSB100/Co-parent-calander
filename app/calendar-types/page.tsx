import Link from "next/link";
import type { Metadata } from "next";
import {
  CovieCard,
  CoviePage,
  CoviePageHeader,
  CovieStatusBadge,
} from "@/components/ui/covie";
import {
  additionalCalendarTemplateSlugs,
  getCalendarTemplateBySlug,
} from "@/lib/templates/calendar-templates";

export const metadata: Metadata = { title: "Calendar type shells" };

export default function CalendarTypesPage() {
  const templates = additionalCalendarTemplateSlugs.map((slug) =>
    getCalendarTemplateBySlug(slug),
  );

  return (
    <CoviePage>
      <CoviePageHeader
        accent="violet"
        title="Calendar type shells"
        context="Three purpose-built calendars, all using the same Covie rules underneath."
        actions={
          <Link
            href="/calendar"
            className="min-h-11 rounded-[10px] border border-[#7A8981] bg-[#FFF9F2] px-3 py-2.5 text-sm font-bold text-[#243139] hover:bg-[#F7EFE5]"
          >
            Back to Covie
          </Link>
        }
      />

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {templates.map((template) => (
          <CovieCard key={template.id} className="flex min-h-[280px] flex-col">
            <div className="flex gap-2" aria-hidden="true">
              <span
                className="h-2 w-14 rounded-full"
                data-accent={template.accentPair[0]}
                style={{
                  background:
                    template.accentPair[0] === "teal"
                      ? "#19A897"
                      : template.accentPair[0] === "violet"
                        ? "#765ED6"
                        : "#FF6B5F",
                }}
              />
              <span
                className="h-2 w-14 rounded-full"
                data-accent={template.accentPair[1]}
                style={{
                  background:
                    template.accentPair[1] === "sunshine"
                      ? "#F4C64E"
                      : template.accentPair[1] === "teal"
                        ? "#19A897"
                        : "#765ED6",
                }}
              />
            </div>

            <div className="mt-5">
              <CovieStatusBadge tone={template.accentPair[0]}>
                {template.primaryScheduledEntity}
              </CovieStatusBadge>
              <h2 className="covie-display mt-3 text-2xl font-semibold tracking-[-0.035em] text-[#243139]">
                {template.name}
              </h2>
              <p className="mt-2 text-sm leading-6 text-[#526168]">
                {template.purpose}
              </p>
            </div>

            <div className="mt-auto pt-6">
              <p className="mb-3 text-sm font-extrabold text-[#243139]">
                {template.coreQuestion}
              </p>
              <Link
                href={`/calendar-types/${template.slug}`}
                className="inline-flex min-h-11 items-center justify-center rounded-[10px] bg-[#FF6B5F] px-4 py-2.5 text-sm font-extrabold text-[#243139] hover:bg-[#F35F54]"
              >
                Open shell
              </Link>
            </div>
          </CovieCard>
        ))}
      </div>
    </CoviePage>
  );
}
