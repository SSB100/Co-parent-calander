import { calendarTemplateManifests, type CalendarTemplateId } from "./calendar-templates";

export type WorkspaceRole = "owner" | "manager" | "staff" | "admin" | "member" | "viewer" | "practitioner" | "unavailable";

/** Presentation uses the same resolved roles as each domain's server authority. */
export function workspaceOrganiserTools(type: CalendarTemplateId, role: WorkspaceRole) {
  const tools = calendarTemplateManifests[type].organiserTools;
  let keys: readonly string[] = [];
  if (type === "staff_rosters") {
    keys = role === "owner" || role === "manager" ? tools.map((tool) => tool.key) : role === "staff" ? ["availability", "timesheets"] : [];
  } else if (type === "shared_facilities") {
    keys = role === "owner" ? ["resources", "booking-rules", "members"] : role === "manager" ? ["resources"] : [];
  } else if (type === "social_groups") {
    keys = role === "owner" || role === "admin" ? ["members", "availability", "group-settings"] : role === "member" || role === "viewer" ? ["availability"] : [];
  } else if (type === "salon_bookings") {
    keys = role === "owner" ? ["team", "services", "booking-settings"] : role === "manager" || role === "practitioner" ? ["team", "services"] : [];
  }
  return tools.filter((tool) => keys.includes(tool.key)).map((tool) => {
    if (type === "salon_bookings" && role === "practitioner") {
      if (tool.key === "team") return { ...tool, label: "My profile & hours", description: "Your profile, working hours and time off." };
      if (tool.key === "services") return { ...tool, label: "My services", description: "The services you can provide." };
    }
    return tool;
  });
}
