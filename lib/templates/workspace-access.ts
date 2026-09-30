import { getTemplateAccess, type TemplateSession } from "@/lib/calendar-sharing/access";
import { getSalonWorkspaceRole } from "@/lib/salon/service";
import type { WorkspaceRole } from "./workspace-navigation";

/** Reuse domain authority; generic editor permission alone never means manager. */
export async function getNonStaffWorkspaceRole(session: TemplateSession): Promise<WorkspaceRole> {
  if (session.calendarType === "shared_facilities" || session.calendarType === "social_groups") return (await getTemplateAccess(session)).role;
  if (session.calendarType === "salon_bookings") return getSalonWorkspaceRole(session);
  return "unavailable";
}
