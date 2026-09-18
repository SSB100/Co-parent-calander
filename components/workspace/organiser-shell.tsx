"use client";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { organiserItems, WorkspaceNav } from "./workspace-nav";
export function OrganiserShell() {
  return <main className="mx-auto min-h-screen w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-9">
    <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
      <div><p className="text-sm text-slate-500">Covie</p><h1 className="text-3xl font-semibold tracking-tight text-slate-950">Organiser</h1></div>
      <WorkspaceNav active="organiser" />
    </header>
    <p className="mb-6 text-slate-600">The details that support your family’s calendar.</p>
    <div className="divide-y divide-slate-200">
      {organiserItems.map(({ href, label, description, icon: Icon }) => (
        <Link key={href} href={href} className="flex min-h-24 items-center gap-4 rounded-lg px-3 py-5 hover:bg-white">
          <Icon size={24} className="shrink-0 text-emerald-800" aria-hidden="true" />
          <div className="flex-1"><h2 className="text-lg font-semibold text-slate-950">{label}</h2><p className="mt-1 text-sm text-slate-600">{description}</p></div>
          <ChevronRight size={20} aria-hidden="true" />
        </Link>
      ))}
    </div>
  </main>;
}
