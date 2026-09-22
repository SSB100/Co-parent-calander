import { notFound, redirect } from "next/navigation";
import { listCalendarNavigationOptions } from "@/lib/calendars/navigation";
import { getCalendarSession } from "@/lib/security/session";
import {
  calendarPathForType,
  getCalendarTemplateBySlug,
  isAdditionalCalendarTemplateSlug,
  type AdditionalCalendarTemplateSlug,
} from "@/lib/templates/calendar-templates";

export async function loadTemplatePage(slug: string) {
  if (!isAdditionalCalendarTemplateSlug(slug)) notFound();

  const session = await getCalendarSession();
  if (!session) redirect("/onboarding");

  const manifest = getCalendarTemplateBySlug(slug);
  if (session.calendarType !== manifest.id) {
    redirect(calendarPathForType(session.calendarType));
  }

  const calendars = await listCalendarNavigationOptions(session.userId);

  return {
    slug: slug as AdditionalCalendarTemplateSlug,
    session,
    manifest,
    calendars,
  };
}
