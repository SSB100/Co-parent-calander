import type { CalendarTemplateId } from "@/lib/templates/calendar-templates";

type ExampleEntry = {
  day: string;
  date: string;
  title: string;
  detail: string;
  accent: "primary" | "secondary";
};

export type CalendarPurpose = {
  id: CalendarTemplateId;
  name: string;
  audience: string;
  question: string;
  description: string;
  uses: readonly string[];
  primary: string;
  secondary: string;
  primaryText: string;
  exampleName: string;
  exampleEntries: readonly ExampleEntry[];
};

export const calendarPurposes: readonly CalendarPurpose[] = [
  {
    id: "co_parenting",
    name: "Co-parenting",
    audience: "For life between two homes",
    question: "Who has the children, and what is the plan?",
    description:
      "Give parenting days, family events and everyday details a shared home. Start on your own and invite the other parent when you are ready.",
    uses: ["Parenting schedules and handovers", "Shared expenses and responsibilities", "Child information and agreements"],
    primary: "#FF6B5F",
    secondary: "#19A897",
    primaryText: "#243139",
    exampleName: "Our family",
    exampleEntries: [
      { day: "Mon", date: "12", title: "With Alex", detail: "School pickup · 3:15 pm", accent: "primary" },
      { day: "Wed", date: "14", title: "Handover to Sam", detail: "After school · 3:15 pm", accent: "secondary" },
      { day: "Sat", date: "17", title: "Maya’s birthday", detail: "Family event · 2:00 pm", accent: "primary" },
    ],
  },
  {
    id: "staff_rosters",
    name: "Staff Rosters",
    audience: "For teams and the people on shift",
    question: "When am I working?",
    description:
      "Bring the roster and the team together. Owners and managers plan coverage; staff get a focused view of their own working week.",
    uses: ["Published shifts and locations", "Availability and leave", "Clocking, breaks and timesheets"],
    primary: "#19A897",
    secondary: "#F4C64E",
    primaryText: "#243139",
    exampleName: "Corner café",
    exampleEntries: [
      { day: "Mon", date: "12", title: "Opening shift", detail: "Alex · 7:00 am to 1:00 pm", accent: "primary" },
      { day: "Wed", date: "14", title: "Afternoon shift", detail: "Sam · 12:00 pm to 6:00 pm", accent: "secondary" },
      { day: "Sat", date: "17", title: "Weekend shift", detail: "Alex · 9:00 am to 3:00 pm", accent: "primary" },
    ],
  },
  {
    id: "shared_facilities",
    name: "Shared Facilities",
    audience: "For spaces and things you share",
    question: "Is it available, and can I book it?",
    description:
      "Make room for everyone. Coordinate shared rooms, equipment and other resources around availability and clear booking rules.",
    uses: ["Rooms, desks and equipment", "Resource availability and bookings", "Booking rules set by the organiser"],
    primary: "#765ED6",
    secondary: "#19A897",
    primaryText: "#FFFFFF",
    exampleName: "Our shared spaces",
    exampleEntries: [
      { day: "Mon", date: "12", title: "Meeting room", detail: "Project catch-up · 10:00 am", accent: "primary" },
      { day: "Wed", date: "14", title: "Workshop space", detail: "Community session · 4:00 pm", accent: "secondary" },
      { day: "Sat", date: "17", title: "Shared equipment", detail: "Projector booking · 6:00 pm", accent: "primary" },
    ],
  },
  {
    id: "social_groups",
    name: "Social Groups",
    audience: "For friends, clubs and communities",
    question: "What are we doing, and who is coming?",
    description:
      "Give the next get-together a place to take shape. Keep events, meeting details and group plans easy for everyone to find.",
    uses: ["Meet-ups and group activities", "Event details and RSVPs", "A shared calendar for the group"],
    primary: "#FF6B5F",
    secondary: "#765ED6",
    primaryText: "#243139",
    exampleName: "The neighbourhood group",
    exampleEntries: [
      { day: "Mon", date: "12", title: "Book club", detail: "Library café · 6:30 pm", accent: "primary" },
      { day: "Wed", date: "14", title: "Evening walk", detail: "Meet by the park · 5:00 pm", accent: "secondary" },
      { day: "Sat", date: "17", title: "Community lunch", detail: "Bring something to share · 12:00 pm", accent: "primary" },
    ],
  },
];

export const googleCalendarNote =
  "For co-parenting calendars, Google Calendar is optional, one-way output from Covie. Covie stays the source of truth; changes in Google Calendar do not update Covie.";
