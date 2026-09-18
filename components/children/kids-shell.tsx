"use client";

import {
  CalendarDays,
  ChevronRight,
  GraduationCap,
  Home,
  LoaderCircle,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

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
    .split(/\s+/)
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

  useEffect(() => {
    let cancelled = false;

    fetch("/api/children", { cache: "no-store" })
      .then(async (response) => ({
        response,
        body: (await response.json().catch(() => null)) as Payload | { error?: string } | null,
      }))
      .then(({ response, body }) => {
        if (cancelled) return;
        if (!response.ok || !body || !("children" in body)) {
          setError(
            body && "error" in body && body.error
              ? body.error
              : "Child profiles could not be loaded.",
          );
          return;
        }
        setData(body);
        setError(null);
      })
      .catch(() => {
        if (!cancelled) setError("Child profiles could not be loaded.");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-3 py-4 sm:px-6 sm:py-7 lg:px-8">
      <header className="rounded-3xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              <UsersRound className="h-4 w-4" aria-hidden="true" />
              Covie kids
            </div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
              Child profiles
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              Shared practical information for each child, kept in one calm place.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/home"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Home className="h-4 w-4" aria-hidden="true" /> Home
            </Link>
            <Link
              href="/calendar"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <CalendarDays className="h-4 w-4" aria-hidden="true" /> Calendar
            </Link>
          </div>
        </div>
      </header>

      {error ? (
        <div role="alert" className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {error}
        </div>
      ) : null}

      {!data && !error ? (
        <div className="mt-5 flex min-h-48 items-center justify-center rounded-2xl border border-slate-200 bg-white text-sm text-slate-500">
          <LoaderCircle className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
          Loading child profiles…
        </div>
      ) : null}

      {data ? (
        <section className="mt-5">
          {data.children.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-8 text-center">
              <UsersRound className="mx-auto h-7 w-7 text-slate-400" aria-hidden="true" />
              <p className="mt-2 font-semibold text-slate-800">No child profiles yet</p>
              <p className="mt-1 text-sm text-slate-500">
                Child profiles are created as part of the family calendar setup.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {data.children.map((child) => (
                <Link
                  key={child.id}
                  href={`/kids/${child.id}`}
                  className="group rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="flex items-start gap-4">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-base font-bold text-white">
                      {initials(child.displayName) || "C"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h2 className="truncate text-lg font-semibold text-slate-950">
                            {child.displayName}
                          </h2>
                          {child.fullName && child.fullName !== child.displayName ? (
                            <p className="mt-0.5 truncate text-sm text-slate-500">{child.fullName}</p>
                          ) : null}
                        </div>
                        <ChevronRight
                          className="mt-1 h-5 w-5 shrink-0 text-slate-400 transition group-hover:translate-x-0.5"
                          aria-hidden="true"
                        />
                      </div>

                      <div className="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                            School
                          </p>
                          <p className="mt-1 font-medium text-slate-700">
                            {child.schoolName ?? "Not added"}
                          </p>
                          {child.yearClass ? (
                            <p className="text-xs text-slate-500">{child.yearClass}</p>
                          ) : null}
                        </div>
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                            Date of birth
                          </p>
                          <p className="mt-1 font-medium text-slate-700">
                            {child.dateOfBirth ? dateLabel(child.dateOfBirth) : "Not added"}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 flex items-center gap-2 text-xs font-semibold text-slate-500">
                        <GraduationCap className="h-4 w-4" aria-hidden="true" />
                        Open profile
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      ) : null}
    </main>
  );
}
