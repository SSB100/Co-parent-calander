export const calendarTemplateIds = [
  "co_parenting",
  "staff_rosters",
  "shared_facilities",
  "social_groups",
] as const;

export type CalendarTemplateId = (typeof calendarTemplateIds)[number];

export type CalendarTemplateSlug =
  | "co-parenting"
  | "staff-rosters"
  | "shared-facilities"
  | "social-groups";

export type CovieAccent = "coral" | "teal" | "sunshine" | "violet";
export type TemplateIconKey = "people" | "calendar" | "settings" | "grid";

export type CalendarTemplateManifest = {
  id: CalendarTemplateId;
  slug: CalendarTemplateSlug;
  name: string;
  accentPair: readonly [CovieAccent, CovieAccent];
  purpose: string;
  coreQuestion: string;
  primaryScheduledEntity: string;
  identityTypes: readonly string[];
  primaryCreateAction: string;
  organiserTools: readonly {
    key: string;
    label: string;
    description: string;
    icon: TemplateIconKey;
  }[];
  eventCategoryMapping: readonly {
    label: string;
    colour: CovieAccent | "warm-neutral";
    note?: string;
  }[];
  positiveStateMeaning: string;
  attentionStateMeaning: string;
  conflictRule: string;
  approvalModel: string;
  scheduleUnit: string;
  defaultView: string;
  requiredFields: readonly string[];
  optionalFields: readonly string[];
  sharedComponents: readonly string[];
  specialResponsiveConsiderations: readonly string[];
};

export const calendarTemplateManifests: Record<
  CalendarTemplateId,
  CalendarTemplateManifest
> = {
  co_parenting: {
    id: "co_parenting",
    slug: "co-parenting",
    name: "Co-parenting",
    accentPair: ["coral", "teal"],
    purpose:
      "One clear shared place for parenting time, family events, shared costs, proposals and agreed information.",
    coreQuestion:
      "Who has the children, what is happening, what needs paying, and what have both parents agreed to?",
    primaryScheduledEntity: "Parenting day",
    identityTypes: ["Parent", "Child"],
    primaryCreateAction: "Create event",
    organiserTools: [
      {
        key: "tasks",
        label: "Tasks",
        description: "Practical jobs, ownership and due dates.",
        icon: "calendar",
      },
      {
        key: "shared-costs",
        label: "Shared costs",
        description: "Reimbursements, splits and settlement.",
        icon: "grid",
      },
      {
        key: "children",
        label: "Children",
        description: "Profiles, activities and useful information.",
        icon: "people",
      },
    ],
    eventCategoryMapping: [
      { label: "School", colour: "violet" },
      { label: "Sport / Activity", colour: "teal" },
      { label: "Medical", colour: "coral" },
      { label: "Birthday / Holiday", colour: "sunshine" },
      { label: "Other", colour: "warm-neutral" },
    ],
    positiveStateMeaning: "Agreed, complete or confirmed.",
    attentionStateMeaning: "Waiting for agreement or action.",
    conflictRule:
      "Changes that materially affect the other parent require approval.",
    approvalModel:
      "Either parent can propose shared changes; the non-initiating parent approves or declines.",
    scheduleUnit: "Day",
    defaultView: "Monthly parenting calendar",
    requiredFields: ["Parenting assignment or shared event date"],
    optionalFields: ["Handover details", "Notes", "Related items"],
    sharedComponents: [
      "CoviePage",
      "CoviePageHeader",
      "CovieDialog",
      "CovieStatusBadge",
      "CovieNotice",
    ],
    specialResponsiveConsiderations: [
      "Parenting ownership stays visible without opening the day.",
      "Split days preserve both parent identities.",
    ],
  },
  staff_rosters: {
    id: "staff_rosters",
    slug: "staff-rosters",
    name: "Staff Rosters",
    accentPair: ["teal", "sunshine"],
    purpose:
      "Create, publish and share staff schedules without becoming a full HR or payroll platform.",
    coreQuestion: "When am I working?",
    primaryScheduledEntity: "Shift",
    identityTypes: ["Staff member", "Team", "Location"],
    primaryCreateAction: "Create shift",
    organiserTools: [
      {
        key: "team",
        label: "Team",
        description: "Staff, managers and the people included in this roster.",
        icon: "people",
      },
      {
        key: "availability",
        label: "Availability & leave",
        description: "Availability, unavailability and simple leave requests.",
        icon: "calendar",
      },
      {
        key: "roles-locations",
        label: "Roles & locations",
        description: "The roles and places managers can schedule.",
        icon: "grid",
      },
      {
        key: "timesheets",
        label: "Timesheets",
        description: "Worked time, clocking exceptions and correction requests.",
        icon: "settings",
      },
    ],
    eventCategoryMapping: [
      {
        label: "Shift",
        colour: "teal",
        note:
          "Shell baseline only. Detailed shift categories will be reviewed in the Staff Rosters feature pass.",
      },
    ],
    positiveStateMeaning: "Published roster or acknowledged availability.",
    attentionStateMeaning: "Draft roster or a change that needs attention.",
    conflictRule:
      "Warn or prevent overlapping shifts and warn when a shift conflicts with confirmed unavailability; managers may override where policy allows.",
    approvalModel:
      "Owners and managers create and publish rosters. Staff submit availability but cannot roster themselves by default.",
    scheduleUnit: "Shift",
    defaultView:
      "Manager: staff rows across days/time. Staff: clean personal upcoming schedule.",
    requiredFields: ["Staff member", "Date", "Start time", "End time"],
    optionalFields: ["Role", "Location", "Notes", "Repeat pattern"],
    sharedComponents: [
      "CoviePage",
      "CoviePageHeader",
      "CovieCard",
      "CovieDialog",
      "CovieInput",
      "CovieSelect",
      "CovieStatusBadge",
    ],
    specialResponsiveConsiderations: [
      "Manager schedules may intentionally scroll horizontally.",
      "Staff mobile view prioritises today and upcoming shifts.",
    ],
  },
  shared_facilities: {
    id: "shared_facilities",
    slug: "shared-facilities",
    name: "Shared Facilities",
    accentPair: ["violet", "teal"],
    purpose:
      "Let people see availability and reserve rooms, courts, vehicles, desks, equipment or other shared resources.",
    coreQuestion: "Is this available, and can I book it?",
    primaryScheduledEntity: "Booking",
    identityTypes: ["Resource", "Member", "Customer"],
    primaryCreateAction: "Book resource",
    organiserTools: [
      {
        key: "resources",
        label: "Resources",
        description: "Rooms, courts, vehicles, desks, equipment and other bookable things.",
        icon: "grid",
      },
      {
        key: "booking-rules",
        label: "Booking rules",
        description: "Hours, duration, notice, cancellation and approval rules.",
        icon: "calendar",
      },
      {
        key: "members",
        label: "Members",
        description: "People who can view availability and make bookings.",
        icon: "people",
      },
    ],
    eventCategoryMapping: [
      {
        label: "Booking",
        colour: "violet",
        note:
          "Shell baseline only. Resource identity and booking status remain separate from category colour.",
      },
    ],
    positiveStateMeaning: "Available or confirmed.",
    attentionStateMeaning: "Needs approval or is awaiting confirmation.",
    conflictRule:
      "A resource cannot have overlapping confirmed bookings. Booking creation must ultimately be transactional.",
    approvalModel:
      "Members can book within owner rules. Owners may optionally require approval for bookings.",
    scheduleUnit: "Time slot",
    defaultView: "Resource lanes with time slots",
    requiredFields: ["Resource", "Date", "Start time", "End time"],
    optionalFields: [
      "Booking title",
      "Notes",
      "Repeat pattern",
      "Approval requirement",
      "Pricing when paid bookings are enabled",
    ],
    sharedComponents: [
      "CoviePage",
      "CoviePageHeader",
      "CovieCard",
      "CovieDialog",
      "CovieInput",
      "CovieSelect",
      "CovieStatusBadge",
    ],
    specialResponsiveConsiderations: [
      "Resource schedules may intentionally scroll horizontally.",
      "Mobile booking flow keeps resource and selected time visible before confirmation.",
    ],
  },
  social_groups: {
    id: "social_groups",
    slug: "social-groups",
    name: "Social Groups",
    accentPair: ["coral", "violet"],
    purpose:
      "Give friends, clubs and communities one simple shared place to coordinate activities and see what the group is doing.",
    coreQuestion: "What are we doing, and who's coming?",
    primaryScheduledEntity: "Event / activity",
    identityTypes: ["Group", "Member"],
    primaryCreateAction: "Create event",
    organiserTools: [
      {
        key: "members",
        label: "Members",
        description: "The people included in this group.",
        icon: "people",
      },
      {
        key: "availability",
        label: "Availability",
        description: "A lightweight view of when the group is free.",
        icon: "calendar",
      },
      {
        key: "group-settings",
        label: "Group settings",
        description: "Who can create activities and how the group is shared.",
        icon: "settings",
      },
    ],
    eventCategoryMapping: [
      {
        label: "Activity",
        colour: "coral",
        note:
          "Shell baseline only. Detailed activity categories will be reviewed in the Social Groups feature pass.",
      },
    ],
    positiveStateMeaning: "Going or confirmed.",
    attentionStateMeaning: "Maybe or a date that still needs coordinating.",
    conflictRule:
      "Social events may overlap. Covie may warn about an attendee conflict but should not block event creation.",
    approvalModel:
      "Open groups allow members to create activities; admin-organised groups limit creation to admins while members still RSVP.",
    scheduleUnit: "Event",
    defaultView: "Shared event calendar",
    requiredFields: ["Title", "Date", "Time"],
    optionalFields: ["Location", "Notes", "Capacity", "Repeat pattern"],
    sharedComponents: [
      "CoviePage",
      "CoviePageHeader",
      "CovieCard",
      "CovieDialog",
      "CovieInput",
      "CovieSelect",
      "CovieStatusBadge",
    ],
    specialResponsiveConsiderations: [
      "Mobile cards prioritise event, time and RSVP state.",
      "Shared availability stays lighter than dedicated polling software.",
    ],
  },
};

export const additionalCalendarTemplateSlugs = [
  "staff-rosters",
  "shared-facilities",
  "social-groups",
] as const;

export type AdditionalCalendarTemplateSlug =
  (typeof additionalCalendarTemplateSlugs)[number];

export function isAdditionalCalendarTemplateSlug(
  value: string,
): value is AdditionalCalendarTemplateSlug {
  return additionalCalendarTemplateSlugs.includes(
    value as AdditionalCalendarTemplateSlug,
  );
}

export function getCalendarTemplateBySlug(
  slug: CalendarTemplateSlug,
): CalendarTemplateManifest {
  const match = Object.values(calendarTemplateManifests).find(
    (template) => template.slug === slug,
  );

  if (!match) {
    throw new Error(`Unknown calendar template: ${slug}`);
  }

  return match;
}


export function isCalendarTemplateId(value: string): value is CalendarTemplateId {
  return calendarTemplateIds.includes(value as CalendarTemplateId);
}

export function getCalendarTemplateById(
  id: CalendarTemplateId,
): CalendarTemplateManifest {
  return calendarTemplateManifests[id];
}

export function calendarPathForType(id: CalendarTemplateId): string {
  if (id === "co_parenting") return "/calendar";
  return `/calendar-types/${calendarTemplateManifests[id].slug}`;
}
