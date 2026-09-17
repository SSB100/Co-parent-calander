import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CalendarShell } from "@/components/calendar/calendar-shell";
import { getCalendarSession } from "@/lib/security/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Calendar" };

export default async function CalendarPage() {
  const session = await getCalendarSession();
  if (!session) redirect("/dashboard");
  return <CalendarShell />;
}
