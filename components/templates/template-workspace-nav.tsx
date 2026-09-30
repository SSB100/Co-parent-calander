"use client";

import {
  Bell,
  CalendarCheck2,
  CalendarDays,
  Building2,
  ChevronDown,
  Clock3,
  LayoutGrid,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRef } from "react";
import { useDismissibleDetails } from "@/lib/client/use-details-dismiss";
import { CovieBrand } from "@/components/workspace/covie-brand";

export type TemplateOrganiserNavItem = {
  key: string;
  label: string;
  description: string;
  icon: LucideIcon;
};

export function TemplateWorkspaceNav({
  basePath,
  organiserItems,
  activeSection,
  activeToolKey,
  staffMode = false,
  staffRosterMode = false,
}: {
  basePath: string;
  organiserItems: readonly TemplateOrganiserNavItem[];
  activeSection: "calendar" | "updates" | "organiser";
  activeToolKey?: string;
  staffMode?: boolean;
  staffRosterMode?: boolean;
}) {
  const organiserRef = useRef<HTMLDetailsElement>(null);
  useDismissibleDetails(organiserRef);

  const organiserActive = activeSection === "organiser";

  const destinationClass =
    "flex min-h-12 min-w-0 items-center gap-3 rounded-[10px] px-3 py-2 text-sm font-bold text-[#526168] transition hover:bg-[#F7EFE5] max-lg:flex-1 max-lg:flex-col max-lg:justify-center max-lg:gap-0.5 max-lg:px-2";

  return (
    <nav
      className="fixed z-50 bg-[#FFF9F2] lg:inset-y-0 lg:left-0 lg:w-[252px] lg:border-r-2 lg:border-[#243139] lg:p-4 max-lg:inset-x-0 max-lg:bottom-0 max-lg:border-t-2 max-lg:border-[#243139] max-lg:px-2 max-lg:pt-1 max-lg:pb-[max(8px,env(safe-area-inset-bottom))]"
      aria-label="Main navigation"
    >
      <Link href="/personal" prefetch={false} aria-label="Covie Personal" className="mb-6 ml-3 hidden min-h-11 lg:flex lg:items-center">
        <CovieBrand />
      </Link>

      <div className={staffRosterMode ? `grid ${staffMode ? "grid-cols-4" : "grid-cols-3"} gap-1 lg:flex lg:flex-col lg:gap-2` : "flex gap-2 lg:flex-col max-lg:justify-around"}>
        <Link
          href={basePath}
          aria-current={activeSection === "calendar" ? "page" : undefined}
          className={`${destinationClass} ${
            activeSection === "calendar"
              ? "bg-[#FF6B5F] text-[#243139]"
              : ""
          }`}
        >
          <CalendarDays size={20} aria-hidden="true" />
          <span>{staffMode ? "My roster" : "Calendar"}</span>
        </Link>

        {staffRosterMode && staffMode ? (
          <>
            <Link
              href={`${basePath}/organiser/timesheets`}
              aria-current={
                activeSection === "organiser" && activeToolKey === "timesheets"
                  ? "page"
                  : undefined
              }
              className={`${destinationClass} ${
                activeSection === "organiser" && activeToolKey === "timesheets"
                  ? "bg-[#FF6B5F] text-[#243139]"
                  : ""
              }`}
            >
              <Clock3 size={20} aria-hidden="true" />
              <span>Timesheet</span>
            </Link>
            <Link
              href={`${basePath}/organiser/availability`}
              aria-current={
                activeSection === "organiser" && activeToolKey === "availability"
                  ? "page"
                  : undefined
              }
              className={`${destinationClass} ${
                activeSection === "organiser" && activeToolKey === "availability"
                  ? "bg-[#FF6B5F] text-[#243139]"
                  : ""
              }`}
            >
              <CalendarCheck2 size={20} aria-hidden="true" />
              <span>Leave</span>
            </Link>
          </>
        ) : null}

        <Link
          href={`${basePath}/updates`}
          aria-current={activeSection === "updates" ? "page" : undefined}
          className={`${destinationClass} ${
            activeSection === "updates"
              ? "bg-[#FF6B5F] text-[#243139]"
              : ""
          }`}
        >
          <Bell size={20} aria-hidden="true" />
          <span>{staffRosterMode && !staffMode ? "Approvals" : "Updates"}</span>
        </Link>

        {staffRosterMode && !staffMode ? (
          <>
            {([
              { key: "team", label: "Team", icon: UsersRound },
              { key: "availability", label: "Leave", icon: CalendarCheck2 },
              { key: "roles-locations", label: "Locations", icon: Building2 },
              { key: "timesheets", label: "Time & attendance", icon: Clock3 },
            ] as const).map(({ key, label, icon: Icon }) => (
              <Link
                key={key}
                href={`${basePath}/organiser/${key}`}
                aria-current={activeSection === "organiser" && activeToolKey === key ? "page" : undefined}
                className={`${destinationClass} ${activeSection === "organiser" && activeToolKey === key ? "bg-[#FF6B5F] text-[#243139]" : ""}`}
              >
                <Icon size={20} aria-hidden="true" />
                <span className="min-w-0 break-words text-center text-[11px] leading-3 lg:text-left lg:text-sm lg:leading-normal">{label}</span>
              </Link>
            ))}
          </>
        ) : null}

        {!staffRosterMode && !staffMode ? (
          <details
          ref={organiserRef}
          className="relative flex-1 lg:flex-none"
        >
          <summary
            aria-current={organiserActive ? "page" : undefined}
            className={`${destinationClass} w-full cursor-pointer list-none [&::-webkit-details-marker]:hidden ${
              organiserActive ? "bg-[#FF6B5F] text-[#243139]" : ""
            }`}
          >
            <LayoutGrid size={20} aria-hidden="true" />
            <span>Organiser</span>
            <ChevronDown
              size={15}
              aria-hidden="true"
              className="ml-auto max-lg:absolute max-lg:right-[calc(50%-24px)] max-lg:top-2"
            />
          </summary>

          <div className="absolute z-[55] flex w-[284px] flex-col gap-1.5 rounded-xl border-2 border-[#243139] bg-[#FFF9F2] p-2 shadow-[5px_5px_0_#F4C64E] lg:left-0 lg:top-[calc(100%+8px)] max-lg:right-0 max-lg:bottom-[calc(100%+10px)] max-lg:max-h-[min(60dvh,420px)] max-lg:w-[min(300px,calc(100vw-16px))] max-lg:overflow-y-auto">
            {organiserItems.map(({ key, label, icon: Icon }) => (
              <Link
                key={key}
                href={`${basePath}/organiser/${key}`}
                aria-current={activeToolKey === key ? "page" : undefined}
                className={`flex min-h-12 items-center gap-2.5 rounded-lg px-2.5 py-2 text-[#243139] hover:bg-[#F7EFE5] ${
                  activeToolKey === key
                    ? "outline-2 outline-offset-[-2px] outline-[#765ED6]"
                    : ""
                }`}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] border border-[#E6DBCF] bg-white">
                  <Icon size={18} aria-hidden="true" />
                </span>
                <strong className="min-w-0 truncate text-sm font-extrabold">
                  {label}
                </strong>
              </Link>
            ))}
          </div>
        </details>
        ) : null}
      </div>

    </nav>
  );
}
