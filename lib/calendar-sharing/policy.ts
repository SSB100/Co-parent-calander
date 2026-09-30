import type { CalendarTemplateId } from "@/lib/templates/calendar-templates";
export function usesMemberInvitations(type: CalendarTemplateId) { return type === "shared_facilities" || type === "social_groups"; }
export function invitationRoleLabel(permission: "owner" | "editor" | "viewer") {
  return permission === "owner" ? "Organiser" : permission === "editor" ? "Member" : "View only";
}

export function matchesExpectedCalendar(expectedCalendarId: string | null, selectedCalendarId: string) { return expectedCalendarId === selectedCalendarId; }
