"use client";

import {
  ChevronRight,
  CircleDollarSign,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { WorkspaceNav } from "./workspace-nav";

const sections = [
  {
    href: "/expenses",
    label: "Shared costs",
    description: "Track shared costs, reimbursements and what is still outstanding.",
    icon: CircleDollarSign,
    className: "bg-[#FFF9DF]",
    iconClassName: "bg-[#F7DC86]",
  },
  {
    href: "/kids",
    label: "Children",
    description: "Keep each child’s practical information together and easy to open.",
    icon: UsersRound,
    className: "bg-[#F4F1FF]",
    iconClassName: "bg-[#DDD3FA]",
  },
] as const;

export function OrganiserShell() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
      <header className="covie-page-header">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div
              className="mb-2 h-2 w-16 rounded-full bg-[#FF6B5F]"
              aria-hidden="true"
            />
            <h1 className="covie-page-title text-3xl sm:text-4xl">Organiser</h1>
            <p className="mt-1 max-w-xl text-sm text-slate-500">
              The ongoing family details that do not need to take up space on the calendar.
            </p>
          </div>
          <WorkspaceNav active="organiser" />
        </div>
      </header>

      <section className="mt-5 grid gap-3 md:grid-cols-2">
        {sections.map(
          ({ href, label, description, icon: Icon, className, iconClassName }) => (
            <Link
              key={href}
              href={href}
              className={`group flex min-h-[104px] items-center gap-3 rounded-2xl border-2 border-[#243139] p-3.5 transition hover:-translate-y-0.5 sm:gap-4 sm:p-4 ${className}`}
            >
              <span
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#243139] text-[#243139] sm:h-12 sm:w-12 ${iconClassName}`}
              >
                <Icon className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden="true" />
              </span>

              <span className="min-w-0 flex-1">
                <span className="block text-lg font-bold text-[#243139]">
                  {label}
                </span>
                <span className="mt-1 block text-sm leading-5 text-slate-600">
                  {description}
                </span>
              </span>

              <ChevronRight
                className="h-5 w-5 shrink-0 text-slate-500 transition group-hover:translate-x-1"
                aria-hidden="true"
              />
            </Link>
          ),
        )}
      </section>
    </main>
  );
}
