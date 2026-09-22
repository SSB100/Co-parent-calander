import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCalendarSession } from "@/lib/security/session";
import { calendarPathForType } from "@/lib/templates/calendar-templates";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Calendar" };

export default async function CalendarTypesPage() {
  const session = await getCalendarSession();
  if (!session) redirect("/onboarding");

  redirect(calendarPathForType(session.calendarType));
}
