"use client";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { organiserItems, WorkspaceNav } from "./workspace-nav";
export function OrganiserShell() {
  return <main className="mx-auto min-h-screen w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-9">
    <header className="covie-page-header mb-6 flex flex-wrap items-center justify-between gap-4">
      <div><h1 className="covie-page-title text-4xl">Organiser</h1><p className="mt-1 text-sm text-slate-500">The details that support your family calendar.</p></div>
      <WorkspaceNav active="organiser" />
    </header>
    <div className="divide-y divide-slate-200">
      {organiserItems.map(({ href, label, description, icon: Icon }) => (
        <Link key={href} href={href} className="flex min-h-24 items-center gap-4 rounded-xl border-b border-slate-200 px-3 py-5 transition hover:bg-white">
          <Icon size={24} className="shrink-0 text-emerald-800" aria-hidden="true" />
          <div className="flex-1"><h2 className="text-lg font-semibold text-slate-950">{label}</h2><p className="mt-1 text-sm text-slate-600">{description}</p></div>
          <ChevronRight size={20} aria-hidden="true" />
        </Link>
      ))}
    </div>
  </main>;
}
