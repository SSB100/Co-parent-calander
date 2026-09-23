import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCalendarSession } from "@/lib/security/session";
import { ensureStaffRosterMember } from "@/lib/staff-rosters/service";
import { calendarPathForType } from "@/lib/templates/calendar-templates";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Roster setup" };

export default async function StaffRosterSetupRoute() {
  const session = await getCalendarSession();
  if (!session) redirect("/onboarding");

  if (session.calendarType !== "staff_rosters") {
    redirect(calendarPathForType(session.calendarType));
  }

  const staffMember = await ensureStaffRosterMember(session);
  if (staffMember.accessRole === "staff") {
    redirect("/calendar-types/staff-rosters");
  }

  redirect("/calendar-types/staff-rosters/organiser/team");
}
