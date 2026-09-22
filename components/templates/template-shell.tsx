"use client";

import {
  Bell,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  CalendarHeart,
  LayoutGrid,
  Settings,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import {
  CalendarSwitcher,
  type CalendarOption,
} from "@/components/calendars/calendar-switcher";
import {
  CovieEmptyState,
  CoviePage,
  CoviePageHeader,
} from "@/components/ui/covie";
import {
  TemplateWorkspaceNav,
  type TemplateOrganiserNavItem,
} from "@/components/templates/template-workspace-nav";
import { StaffRosterTeamPage } from "@/components/staff-rosters/team-page";
import { StaffRosterAvailabilityPage } from "@/components/staff-rosters/availability-page";
import { StaffRosterRolesLocationsPage } from "@/components/staff-rosters/roles-locations-page";
import { StaffRosterCalendarPage } from "@/components/staff-rosters/roster-calendar-page";
import { StaffMyRosterPage } from "@/components/staff-rosters/my-roster-page";
import { StaffRosterTimesheetsPage } from "@/components/staff-rosters/timesheets-page";
import { StaffRosterUpdatesPage } from "@/components/staff-rosters/updates-page";
import {
  getCalendarTemplateBySlug,
  type AdditionalCalendarTemplateSlug,
  type CalendarTemplateId,
  type TemplateIconKey,
} from "@/lib/templates/calendar-templates";

export type TemplateSection = "calendar" | "updates" | "organiser";

const organiserIconByKey = {
  people: UsersRound,
  calendar: CalendarDays,
  settings: Settings,
  grid: LayoutGrid,
} satisfies Record<TemplateIconKey, typeof UsersRound>;

const calendarViewByType: Record<
  Exclude<CalendarTemplateId, "co_parenting">,
  {
    emptyTitle: string;
    emptyDescription: string;
    icon: LucideIcon;
    iconClassName: string;
  }
> = {
  staff_rosters: {
    emptyTitle: "No shifts yet",
    emptyDescription: "Shifts will appear here when the roster is built.",
    icon: BriefcaseBusiness,
    iconClassName: "text-[#19A897]",
  },
  shared_facilities: {
    emptyTitle: "No bookings yet",
    emptyDescription: "Bookings will appear here when a resource is reserved.",
    icon: Building2,
    iconClassName: "text-[#765ED6]",
  },
  social_groups: {
    emptyTitle: "No events yet",
    emptyDescription: "Events will appear here when the group starts planning.",
    icon: CalendarHeart,
    iconClassName: "text-[#FF6B5F]",
  },
};

const organiserEmptyCopy: Record<
  string,
  { title: string; description: string }
> = {
  team: {
    title: "No team members yet",
    description: "People added to this roster will appear here.",
  },
  availability: {
    title: "No availability yet",
    description: "Availability shared with this calendar will appear here.",
  },
  "roles-locations": {
    title: "No roles or locations yet",
    description: "Roster roles and work locations will appear here.",
  },
  timesheets: {
    title: "No timesheets yet",
    description: "Clocked work and timesheet exceptions will appear here.",
  },
  resources: {
    title: "No resources yet",
    description: "Rooms, courts, equipment and other resources will appear here.",
  },
  "booking-rules": {
    title: "No booking rules yet",
    description: "Booking rules for this calendar will appear here.",
  },
  members: {
    title: "No members yet",
    description: "People added to this calendar will appear here.",
  },
  "group-settings": {
    title: "No group settings yet",
    description: "Group settings for this calendar will appear here.",
  },
};

export function TemplateShell({
  slug,
  calendars,
  archivedCalendars,
  currentCalendarId,
  defaultName,
  section,
  activeToolKey,
  staffAccessRole,
}: {
  slug: AdditionalCalendarTemplateSlug;
  calendars: CalendarOption[];
  archivedCalendars: CalendarOption[];
  currentCalendarId: string;
  defaultName: string;
  section: TemplateSection;
  activeToolKey?: string;
  staffAccessRole?: "owner" | "manager" | "staff" | null;
}) {
  const template = getCalendarTemplateBySlug(slug);
  const currentPath = `/calendar-types/${slug}`;
  const staffMode =
    template.id === "staff_rosters" && staffAccessRole === "staff";
  const compactStaffRosterCalendar =
    template.id === "staff_rosters" && section === "calendar" && !staffMode;

  const organiserItems: readonly TemplateOrganiserNavItem[] =
    template.organiserTools.map((tool) => ({
      key: tool.key,
      label: tool.label,
      description: tool.description,
      icon: organiserIconByKey[tool.icon],
    }));

  const calendarView =
    calendarViewByType[
      template.id as Exclude<CalendarTemplateId, "co_parenting">
    ];
  const activeTool = organiserItems.find((item) => item.key === activeToolKey);

  let title = "";
  let context = "";
  let emptyTitle = calendarView.emptyTitle;
  let emptyDescription = calendarView.emptyDescription;
  let EmptyIcon = calendarView.icon;
  let emptyIconClassName = calendarView.iconClassName;

  if (section === "updates") {
    title = "Updates";
    context = "Changes to this calendar will appear here.";
    emptyTitle = "No updates yet";
    emptyDescription = "There are no calendar changes to show.";
    EmptyIcon = Bell;
    emptyIconClassName = "text-[#765ED6]";
  } else if (section === "organiser" && activeTool) {
    const copy = organiserEmptyCopy[activeTool.key] ?? {
      title: `No ${activeTool.label.toLowerCase()} yet`,
      description: `${activeTool.label} for this calendar will appear here.`,
    };
    title = activeTool.label;
    context = activeTool.description;
    emptyTitle = copy.title;
    emptyDescription = copy.description;
    EmptyIcon = activeTool.icon;
    emptyIconClassName = calendarView.iconClassName;
  }

  return (
    <div className="min-h-screen bg-[#FFF9F2] lg:pl-[252px]">
      <TemplateWorkspaceNav
        basePath={currentPath}
        organiserItems={organiserItems}
        activeSection={section}
        activeToolKey={activeToolKey}
        staffMode={staffMode}
        showStaffRosterGuide={compactStaffRosterCalendar}
      />

      <CoviePage
        width="wide"
        className="pb-[calc(104px+env(safe-area-inset-bottom))] lg:pb-6"
      >
        <div
          className={
            section === "calendar"
              ? compactStaffRosterCalendar
                ? "mb-2"
                : "mb-5"
              : "mb-3"
          }
        >
          <CalendarSwitcher
            calendars={calendars}
            archivedCalendars={archivedCalendars}
            currentCalendarId={currentCalendarId}
            defaultName={defaultName}
          />
        </div>

        {section === "calendar" ? null : (
          <CoviePageHeader
            accent={template.accentPair[0]}
            title={title}
            context={context}
          />
        )}

        <section
          className={
            section === "calendar"
              ? compactStaffRosterCalendar
                ? "mt-1"
                : "mt-3"
              : "mt-6"
          }
        >
          {template.id === "staff_rosters" && section === "calendar" ? (
            staffMode ? <StaffMyRosterPage /> : <StaffRosterCalendarPage />
          ) : template.id === "staff_rosters" && section === "updates" ? (
            <StaffRosterUpdatesPage />
          ) : template.id === "staff_rosters" &&
          section === "organiser" &&
          activeToolKey === "team" ? (
            <StaffRosterTeamPage />
          ) : template.id === "staff_rosters" &&
            section === "organiser" &&
            activeToolKey === "availability" ? (
            <StaffRosterAvailabilityPage />
          ) : template.id === "staff_rosters" &&
            section === "organiser" &&
            activeToolKey === "roles-locations" ? (
            <StaffRosterRolesLocationsPage />
          ) : template.id === "staff_rosters" &&
            section === "organiser" &&
            activeToolKey === "timesheets" ? (
            <StaffRosterTimesheetsPage />
          ) : (
            <CovieEmptyState
              icon={
                <EmptyIcon
                  className={emptyIconClassName}
                  aria-hidden="true"
                />
              }
              title={emptyTitle}
              description={emptyDescription}
            />
          )}
        </section>
      </CoviePage>
    </div>
  );
}
