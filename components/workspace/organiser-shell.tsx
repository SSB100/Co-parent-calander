"use client";

import {
  ChevronRight,
  CircleDollarSign,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { CoviePage, CoviePageHeader } from "@/components/ui/covie";
import { WorkspaceNav } from "./workspace-nav";

const sections = [
  {
    href: "/expenses",
    label: "Shared costs",
    description: "Costs, reimbursements and anything still outstanding.",
    icon: CircleDollarSign,
    iconClassName: "bg-[#FFF1B7]",
  },
  {
    href: "/kids",
    label: "Children",
    description: "Practical information for each child, kept in one place.",
    icon: UsersRound,
    iconClassName: "bg-[#E9E3FF]",
  },
] as const;

export function OrganiserShell() {
  return (
    <CoviePage>
      <CoviePageHeader
        accent="coral"
        title="Organiser"
        context="Shared family information that sits alongside the calendar."
        actions={<WorkspaceNav active="organiser" />}
      />

      <section className="mt-4 max-w-3xl" aria-label="Organiser sections">
        <div className="overflow-hidden rounded-2xl border border-[#E6DBCF] bg-white">
          {sections.map(
            ({ href, label, description, icon: Icon, iconClassName }, index) => (
              <Link
                key={href}
                href={href}
                className={`group flex min-h-[68px] items-center gap-3 px-3 py-2.5 transition-colors hover:bg-[#FFF9F2] sm:min-h-[72px] sm:px-4 ${
                  index > 0 ? "border-t border-[#E6DBCF]" : ""
                }`}
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#E6DBCF] text-[#243139] ${iconClassName}`}
                >
                  <Icon className="h-4.5 w-4.5" aria-hidden="true" />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-extrabold leading-5 text-[#243139]">
                    {label}
                  </span>
                  <span className="mt-0.5 block text-xs leading-4 text-slate-600">
                    {description}
                  </span>
                </span>

                <ChevronRight
                  className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-[#243139]"
                  aria-hidden="true"
                />
              </Link>
            ),
          )}
        </div>
      </section>
    </CoviePage>
  );
}
