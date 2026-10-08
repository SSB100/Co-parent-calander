import type { CalendarTemplateId } from "@/lib/templates/calendar-templates";

type CalendarGuide = { example: string; purpose: string; steps: readonly [string, string, string]; startLabel: string; startPath: string };
export const calendarGuides: Record<CalendarTemplateId, CalendarGuide> = {
  timesheets: {
    example: "For teams tracking work, clients, projects and billable time.",
    purpose: "Record exact work blocks and give managers oversight of their assigned team.",
    steps: ["Set your organisation timezone and time increment.", "Add staff, clients and projects. Assign managers when needed.", "Create a work block, then share personal staff invitation links."],
    startLabel: "Set up timesheets", startPath: "/calendar-types/timesheets/organiser/settings",
  },
  staff_rosters: {
    example: "For cafe teams, shops and other shift-based work.",
    purpose: "Build a roster, then share published shifts with the people working them.",
    steps: ["Check your team, roles and locations.", "Choose days and add your first shifts.", "Publish when ready so staff can see their roster."],
    startLabel: "Check your team", startPath: "/calendar-types/staff-rosters/organiser/team",
  },
  salon_bookings: {
    example: "For salons, hairdressers and independent practitioners.",
    purpose: "Connect services, practitioners and available appointment times.",
    steps: ["Add your profile or invite your practitioners.", "Add services, assign them and set working hours.", "Try an internal booking. Enable client booking only when ready."],
    startLabel: "Set up your team", startPath: "/calendar-types/salon-bookings/organiser/team",
  },
  shared_facilities: {
    example: "For shared rooms, courts, desks or equipment.",
    purpose: "See what is available and book it without double-booking a resource.",
    steps: ["Add the first room, space or piece of equipment.", "Check opening hours and booking rules.", "Book a time yourself, or invite members when ready."],
    startLabel: "Add your first resource", startPath: "/calendar-types/shared-facilities/organiser/resources",
  },
  social_groups: {
    example: "For clubs, friends and regular group activities.",
    purpose: "Plan an activity and see who is going, maybe coming or unavailable.",
    steps: ["Choose a day and create your first activity.", "Decide whether members can create events too.", "Invite your group when ready so they can respond."],
    startLabel: "Plan your first activity", startPath: "/calendar-types/social-groups",
  },
  co_parenting: {
    example: "For parents coordinating care and shared responsibilities.",
    purpose: "Keep care arrangements, activities and shared responsibilities together.",
    steps: ["Add the children this calendar is for.", "Set up the care schedule that works for your family.", "Invite your co-parent when you are ready."],
    startLabel: "Open your calendar", startPath: "/calendar",
  },
};
