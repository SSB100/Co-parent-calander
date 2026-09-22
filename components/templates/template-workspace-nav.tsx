"use client";

import {
  Bell,
  CalendarDays,
  ChevronDown,
  LayoutGrid,
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
}: {
  basePath: string;
  organiserItems: readonly TemplateOrganiserNavItem[];
  activeSection: string;
}) {
  const organiserRef = useRef<HTMLDetailsElement>(null);
  useDismissibleDetails(organiserRef);

  const organiserActive = organiserItems.some(
    (item) => item.key === activeSection,
  );

  const destinationClass =
    "flex min-h-12 items-center gap-3 rounded-[10px] px-3 py-2 text-sm font-bold text-[#526168] transition hover:bg-[#F7EFE5] max-lg:flex-1 max-lg:flex-col max-lg:justify-center max-lg:gap-0.5 max-lg:px-2";

  function closeOrganiser() {
    if (organiserRef.current) organiserRef.current.open = false;
  }

  return (
    <nav
      className="fixed z-50 bg-[#FFF9F2] lg:inset-y-0 lg:left-0 lg:w-[252px] lg:border-r-2 lg:border-[#243139] lg:p-4 max-lg:inset-x-0 max-lg:bottom-0 max-lg:border-t-2 max-lg:border-[#243139] max-lg:px-2 max-lg:pt-1 max-lg:pb-[max(8px,env(safe-area-inset-bottom))]"
      aria-label="Calendar navigation"
    >
      <Link href={basePath} className="mb-6 ml-3 hidden lg:block">
        <CovieBrand />
      </Link>

      <div className="flex gap-2 lg:flex-col max-lg:justify-around">
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
          <span>Calendar</span>
        </Link>

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
          <span>Updates</span>
        </Link>

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
              className="ml-auto transition group-open:rotate-180 max-lg:absolute max-lg:right-[calc(50%-24px)] max-lg:top-2"
            />
          </summary>

          <div className="absolute z-[55] flex w-[284px] flex-col gap-1.5 rounded-xl border-2 border-[#243139] bg-[#FFF9F2] p-2 shadow-[5px_5px_0_#F4C64E] lg:left-0 lg:top-[calc(100%+8px)] max-lg:right-0 max-lg:bottom-[calc(100%+10px)] max-lg:max-h-[min(60dvh,420px)] max-lg:w-[min(300px,calc(100vw-16px))] max-lg:overflow-y-auto">
            {organiserItems.map(({ key, label, icon: Icon }) => (
              <Link
                key={key}
                href={`${basePath}/organiser/${key}`}
                onClick={closeOrganiser}
                aria-current={activeSection === key ? "page" : undefined}
                className={`flex min-h-12 items-center gap-2.5 rounded-lg px-2.5 py-2 text-[#243139] hover:bg-[#F7EFE5] ${
                  activeSection === key
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
      </div>
    </nav>
  );
}
