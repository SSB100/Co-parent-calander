"use client";

import {
  ChevronRight,
  GraduationCap,
  LoaderCircle,
  UserRound,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AddChildPanel } from "@/components/children/add-child-panel";
import { CovieEmptyState, CovieNotice, CoviePage, CoviePageHeader } from "@/components/ui/covie";
import { WorkspaceNav } from "@/components/workspace/workspace-nav";

type ChildSummary = {
  id: string;
  displayName: string;
  fullName: string | null;
  dateOfBirth: string | null;
  schoolName: string | null;
  yearClass: string | null;
  updatedAt: string;
};

type Payload = {
  permission: "owner" | "editor" | "viewer";
  children: ChildSummary[];
};

function initials(name: string) {
  return name
    .split(/s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-NZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

export function KidsShell() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/children", { cache: "no-store" });
    const body = (await response.json().catch(() => null)) as
      | Payload
      | { error?: string }
      | null;
    if (!response.ok || !body || !("children" in body)) {
      throw new Error(
        body && "error" in body && body.error
          ? body.error
          : "Child profiles could not be loaded.",
      );
    }
    setData(body);
    setError(null);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh().catch((caught) =>
        setError(
          caught instanceof Error
            ? caught.message
            : "Child profiles could not be loaded.",
        ),
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const editable = data?.permission === "owner" || data?.permission === "editor";

  return (
    <CoviePage>
      <CoviePageHeader
        accent="violet"
        title="Children"
        context="Start with the basics. Open a profile only when you need the extra detail."
        actions={
          <WorkspaceNav
            active="kids"
            actions={
              editable ? (
                <AddChildPanel onChanged={() => void refresh()} />
              ) : null
            }
          />
        }
      />

      {error ? (
        <CovieNotice tone="danger" role="alert" className="mt-4">
          {error}
        </CovieNotice>
      ) : null}

      {!data && !error ? (
        <div className="mt-5 flex min-h-40 items-center justify-center rounded-2xl border border-[#E6DBCF] bg-white text-sm text-slate-500">
          <LoaderCircle className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
          Loading child profiles…
        </div>
      ) : null}

      {data ? (
        <section className="mt-5">
          {data.children.length === 0 ? (
            <CovieEmptyState
              icon={<UsersRound className="h-8 w-8 text-[#765ED6]" aria-hidden="true" />}
              title="Add your first child"
              description="You only need a name to begin. School, activities, health notes and documents can all be added later."
              action={
                editable ? (
                  <AddChildPanel onChanged={() => void refresh()} buttonLabel="Add child" />
                ) : null
              }
            />
          ) : (
            <>
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-slate-700">
                  {data.children.length} {data.children.length === 1 ? "child" : "children"}
                </p>
                <p className="hidden text-xs text-slate-500 sm:block">
                  Select a child to view school, care, activities and documents.
                </p>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {data.children.map((child) => (
                  <Link
                    key={child.id}
                    href={`/kids/${child.id}`}
                    className="group flex items-center gap-4 rounded-2xl border border-[#E6DBCF] bg-white p-4 transition hover:-translate-y-0.5 hover:border-[#765ED6] focus-visible:border-[#765ED6]"
                  >
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-[#C9BDF1] bg-[#F4F1FF] text-base font-black text-[#243139]">
                      {initials(child.displayName) || "C"}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <h2 className="truncate text-lg font-bold text-slate-950">
                            {child.displayName}
                          </h2>
                          {child.fullName && child.fullName !== child.displayName ? (
                            <p className="truncate text-xs text-slate-500">{child.fullName}</p>
                          ) : null}
                        </div>
                        <ChevronRight
                          className="h-5 w-5 shrink-0 text-slate-500 transition group-hover:translate-x-1"
                          aria-hidden="true"
                        />
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2 text-xs">
                        {child.schoolName ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#E6DBCF] bg-white px-2.5 py-1 font-semibold text-slate-700">
                            <GraduationCap className="h-3.5 w-3.5" aria-hidden="true" />
                            {child.schoolName}
                            {child.yearClass ? ` · ${child.yearClass}` : ""}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#E6DBCF] bg-white px-2.5 py-1 font-semibold text-slate-500">
                            <GraduationCap className="h-3.5 w-3.5" aria-hidden="true" />
                            Add school
                          </span>
                        )}

                        {child.dateOfBirth ? (
                          <span className="rounded-full border border-[#E6DBCF] bg-white px-2.5 py-1 font-semibold text-slate-600">
                            {dateLabel(child.dateOfBirth)}
                          </span>
                        ) : null}
                      </div>

                      <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-[#6651B7]">
                        <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
                        Open profile
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </>
          )}
        </section>
      ) : null}
    </CoviePage>
  );
}
