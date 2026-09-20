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
    description:
      "Track shared costs and reimbursements, then archive them once settled.",
    icon: CircleDollarSign,
    className: "bg-[#F7DC86]",
    accent: "bg-[#F4C64E]",
  },
  {
    href: "/kids",
    label: "Children",
    description:
      "Keep school, profile and practical child information easy to find.",
    icon: UsersRound,
    className: "bg-[#DDD3FA]",
    accent: "bg-[#765ED6]",
  },
] as const;

export function OrganiserShell() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-3 py-4 sm:px-6 sm:py-7 lg:px-8">
      <header className="covie-page-header mb-4 flex flex-wrap items-center justify-between gap-3 sm:mb-7 sm:gap-4">
        <div>
          <h1 className="covie-page-title text-4xl sm:text-5xl">Organiser</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Shared costs and child information, without duplicating the dated things already handled by Calendar.
          </p>
        </div>
        <WorkspaceNav active="organiser" />
      </header>

      <section className="rounded-2xl border-2 border-[#243139] bg-[#FF6B5F] p-4 sm:p-6">
        <p className="max-w-3xl text-base font-bold leading-6 text-[#243139] sm:text-lg sm:leading-7">
          Shared costs stay visible until they are settled. Tasks now live with Calendar, where events, due dates and who is responsible can be understood together.
        </p>
      </section>

      <section className="mt-4 grid gap-3 sm:mt-6 sm:gap-4 lg:grid-cols-2">
        {sections.map(({ href, label, description, icon: Icon, className, accent }) => (
          <Link
            key={href}
            href={href}
            className={`group relative overflow-hidden rounded-2xl border-2 border-[#243139] p-4 transition hover:-translate-y-0.5 sm:p-5 ${className}`}
          >
            <span
              className={`absolute inset-x-0 top-0 h-2 ${accent}`}
              aria-hidden="true"
            />
            <div className="flex items-start justify-between gap-4 pt-2">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-[#243139] bg-white">
                <Icon className="h-6 w-6" aria-hidden="true" />
              </span>
              <ChevronRight
                className="mt-2 h-5 w-5 transition group-hover:translate-x-1"
                aria-hidden="true"
              />
            </div>
            <h2 className="covie-display mt-4 text-2xl font-semibold tracking-[-0.03em] text-[#243139] sm:mt-8 sm:text-3xl">
              {label}
            </h2>
            <p className="mt-3 text-sm leading-6 text-[#3D4A50]">{description}</p>
            <span className="mt-4 inline-flex text-sm font-bold text-[#243139] sm:mt-7">
              Open {label.toLowerCase()}
            </span>
          </Link>
        ))}
      </section>
    </main>
  );
}
