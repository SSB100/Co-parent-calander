"use client";

import {
  ChevronRight,
  CircleDollarSign,
  ListChecks,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { WorkspaceNav } from "./workspace-nav";

const sections = [
  {
    href: "/responsibilities",
    label: "Responsibilities",
    description:
      "Keep practical jobs clearly owned, due and out of the message thread.",
    icon: ListChecks,
    className: "bg-[#BFEDE6]",
    accent: "bg-[#19A897]",
  },
  {
    href: "/expenses",
    label: "Expenses",
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
      <header className="covie-page-header mb-7 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="covie-page-title text-4xl sm:text-5xl">Organiser</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            The practical things around the calendar, kept visible until they are done.
          </p>
        </div>
        <WorkspaceNav active="organiser" />
      </header>

      <section className="rounded-2xl border-2 border-[#243139] bg-[#FF6B5F] p-5 sm:p-6">
        <p className="max-w-3xl text-lg font-bold leading-7 text-[#243139]">
          Open items stay front and centre. Settled expenses and completed responsibilities move into Archive automatically, so this space stays useful instead of becoming a history dump.
        </p>
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-3">
        {sections.map(({ href, label, description, icon: Icon, className, accent }) => (
          <Link
            key={href}
            href={href}
            className={`group relative overflow-hidden rounded-2xl border-2 border-[#243139] p-5 transition hover:-translate-y-0.5 ${className}`}
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
            <h2 className="covie-display mt-8 text-3xl font-semibold tracking-[-0.03em] text-[#243139]">
              {label}
            </h2>
            <p className="mt-3 text-sm leading-6 text-[#3D4A50]">{description}</p>
            <span className="mt-7 inline-flex text-sm font-bold text-[#243139]">
              Open {label.toLowerCase()}
            </span>
          </Link>
        ))}
      </section>
    </main>
  );
}
