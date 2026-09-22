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
import {
  getCalendarTemplateBySlug,
  type AdditionalCalendarTemplateSlug,
  type CalendarTemplateId,
  type TemplateIconKey,
} from "@/lib/templates/calendar-templates";

const organiserIconByKey = {
  people: UsersRound,
  calendar: CalendarDays,
  settings: Settings,
  grid: LayoutGrid,
} satisfies Record<TemplateIconKey, typeof UsersRound>;

const calendarViewByType: Record<
  Exclude<CalendarTemplateId, "co_parenting">,
  {
    title: string;
    context: string;
    emptyTitle: string;
    emptyDescription: string;
    icon: LucideIcon;
    iconClassName: string;
  }
> = {
  staff_rosters: {
    title: "Roster",
    context: "Shifts and availability for your team.",
    emptyTitle: "No shifts yet",
    emptyDescription: "Shifts will appear here when the roster is built.",
    icon: BriefcaseBusiness,
    iconClassName: "text-[#19A897]",
  },
  shared_facilities: {
    title: "Bookings",
    context: "Resource availability and bookings.",
    emptyTitle: "No bookings yet",
    emptyDescription: "Bookings will appear here when a resource is reserved.",
    icon: Building2,
    iconClassName: "text-[#765ED6]",
  },
  social_groups: {
    title: "Events",
    context: "Group events and attendance.",
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
  currentCalendarId,
  defaultName,
  activeSection = "calendar",
}: {
  slug: AdditionalCalendarTemplateSlug;
  calendars: CalendarOption[];
  currentCalendarId: string;
  defaultName: string;
  activeSection?: string;
}) {
  const template = getCalendarTemplateBySlug(slug);
  const currentPath = `/calendar-types/${slug}`;
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

  const activeTool = organiserItems.find(
    (item) => item.key === activeSection,
  );

  let title = calendarView.title;
  let context = calendarView.context;
  let emptyTitle = calendarView.emptyTitle;
  let emptyDescription = calendarView.emptyDescription;
  let EmptyIcon = calendarView.icon;
  let emptyIconClassName = calendarView.iconClassName;

  if (activeSection === "updates") {
    title = "Updates";
    context = "Changes to this calendar will appear here.";
    emptyTitle = "No updates yet";
    emptyDescription = "There are no calendar changes to show.";
    EmptyIcon = Bell;
    emptyIconClassName = "text-[#765ED6]";
  } else if (activeTool) {
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
        activeSection={activeSection}
      />

      <CoviePage
        width="wide"
        className="pb-[calc(104px+env(safe-area-inset-bottom))] lg:pb-6"
      >
        <div className="mb-3">
          <CalendarSwitcher
            calendars={calendars}
            currentCalendarId={currentCalendarId}
            defaultName={defaultName}
          />
        </div>

        <CoviePageHeader
          accent={template.accentPair[0]}
          title={title}
          context={context}
        />

        <section className="mt-6">
          <CovieEmptyState
            icon={<EmptyIcon className={emptyIconClassName} aria-hidden="true" />}
            title={emptyTitle}
            description={emptyDescription}
          />
        </section>
      </CoviePage>
    </div>
  );
}
