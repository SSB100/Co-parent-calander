"use client";

import {
  Bell,
  CalendarDays,
  ChevronDown,
  LayoutGrid,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
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
}: {
  basePath: string;
  organiserItems: readonly TemplateOrganiserNavItem[];
}) {
  const organiserRef = useRef<HTMLDetailsElement>(null);
  const [activeHash, setActiveHash] = useState("");
  useDismissibleDetails(organiserRef);

  useEffect(() => {
    function syncHash() {
      setActiveHash(window.location.hash.replace(/^#/, ""));
    }

    syncHash();
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, []);

  const organiserActive = organiserItems.some(
    (item) => item.key === activeHash,
  );

  function selectHash(hash: string) {
    setActiveHash(hash);
    if (organiserRef.current) organiserRef.current.open = false;
  }

  const destinationClass =
    "flex min-h-12 items-center gap-3 rounded-[10px] px-3 py-2 text-sm font-bold text-[#526168] transition hover:bg-[#F7EFE5] max-lg:flex-1 max-lg:flex-col max-lg:justify-center max-lg:gap-0.5 max-lg:px-2";

  return (
    <nav
      className="fixed z-50 bg-[#FFF9F2] lg:inset-y-0 lg:left-0 lg:w-[252px] lg:border-r-2 lg:border-[#243139] lg:p-4 max-lg:inset-x-0 max-lg:bottom-0 max-lg:border-t-2 max-lg:border-[#243139] max-lg:px-2 max-lg:pt-1 max-lg:pb-[max(8px,env(safe-area-inset-bottom))]"
      aria-label="Calendar type navigation"
    >
      <Link href="/calendar-types" className="mb-6 ml-3 hidden lg:block">
        <CovieBrand />
      </Link>

      <div className="flex gap-2 lg:flex-col max-lg:justify-around">
        <Link
          href={basePath}
          onClick={() => selectHash("")}
          aria-current={!activeHash ? "page" : undefined}
          className={`${destinationClass} ${
            !activeHash ? "bg-[#FF6B5F] text-[#243139]" : ""
          }`}
        >
          <CalendarDays size={20} aria-hidden="true" />
          <span>Calendar</span>
        </Link>

        <Link
          href={`${basePath}#updates`}
          onClick={() => selectHash("updates")}
          aria-current={activeHash === "updates" ? "page" : undefined}
          className={`${destinationClass} ${
            activeHash === "updates" ? "bg-[#FF6B5F] text-[#243139]" : ""
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
            {organiserItems.map(
              ({ key, label, description, icon: Icon }) => (
                <Link
                  key={key}
                  href={`${basePath}#${key}`}
                  onClick={() => selectHash(key)}
                  aria-current={activeHash === key ? "page" : undefined}
                  className={`flex min-h-14 items-center gap-2.5 rounded-lg px-2.5 py-2 text-[#243139] hover:bg-[#F7EFE5] ${
                    activeHash === key
                      ? "outline-2 outline-offset-[-2px] outline-[#765ED6]"
                      : ""
                  }`}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] border border-[#E6DBCF] bg-white">
                    <Icon size={18} aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <strong className="block text-sm font-extrabold">
                      {label}
                    </strong>
                    <span className="mt-px block text-[11px] leading-[1.35] text-[#66747A]">
                      {description}
                    </span>
                  </span>
                </Link>
              ),
            )}
          </div>
        </details>
      </div>
    </nav>
  );
}
