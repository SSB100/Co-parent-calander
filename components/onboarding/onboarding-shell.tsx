"use client";

import { ArrowLeft, CalendarPlus2, KeyRound, UsersRound } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";
import {
  createCalendar,
  joinCalendar,
  type DashboardActionState,
} from "@/app/dashboard/actions";
import { CovieBrand } from "@/components/workspace/covie-brand";

const initialState: DashboardActionState = { error: null };
const inputClass =
  "mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-950 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200";

type Mode = "choose" | "create" | "join";

export function OnboardingShell({
  defaultName,
  initialInviteCode,
  hasExistingCalendar,
}: {
  defaultName: string;
  initialInviteCode: string;
  hasExistingCalendar: boolean;
}) {
  const [mode, setMode] = useState<Mode>(initialInviteCode ? "join" : "choose");
  const [createState, createAction, creating] = useActionState(createCalendar, initialState);
  const [joinState, joinAction, joining] = useActionState(joinCalendar, initialState);

  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-10">
      <header className="flex items-center justify-between gap-4">
        <CovieBrand />
        {hasExistingCalendar ? (
          <Link
            href="/calendar"
            className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-white hover:text-slate-950"
          >
            Back to calendar
          </Link>
        ) : null}
      </header>

      <section className="mx-auto mt-10 max-w-2xl sm:mt-16">
        {mode === "choose" ? (
          <>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
              Welcome to Covie
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
              How would you like to get started?
            </h1>
            <p className="mt-4 max-w-xl text-base leading-7 text-slate-600">
              Start a shared calendar yourself, or join one your co-parent has already created.
            </p>

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setMode("create")}
                className="group rounded-3xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-emerald-200"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                  <CalendarPlus2 className="h-6 w-6" aria-hidden="true" />
                </span>
                <h2 className="mt-5 text-xl font-semibold text-slate-950">Create a Covie calendar</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Start the calendar, add your child or children, then invite your co-parent when you are ready.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setMode("join")}
                className="group rounded-3xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-violet-200"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
                  <KeyRound className="h-6 w-6" aria-hidden="true" />
                </span>
                <h2 className="mt-5 text-xl font-semibold text-slate-950">Join a Covie calendar</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Enter the private code shared with you and open the existing family calendar.
                </p>
              </button>
            </div>
          </>
        ) : null}

        {mode === "create" ? (
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
            <button
              type="button"
              onClick={() => setMode("choose")}
              className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-900"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back
            </button>

            <div className="mt-3 flex items-start gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                <CalendarPlus2 className="h-6 w-6" aria-hidden="true" />
              </span>
              <div>
                <h1 className="text-2xl font-semibold text-slate-950">Create your Covie calendar</h1>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Just the basics. You can change details later.
                </p>
              </div>
            </div>

            <form action={createAction} className="mt-7 space-y-5">
              <input type="hidden" name="flow" value="onboarding" />
              <input type="hidden" name="displayName" value={defaultName} />

              <label className="block">
                <span className="text-sm font-semibold text-slate-800">Calendar name</span>
                <input
                  name="calendarName"
                  placeholder="e.g. Drake"
                  required
                  maxLength={80}
                  className={inputClass}
                />
                <span className="mt-2 block text-xs text-slate-500">
                  A child&apos;s name or simple family name works well.
                </span>
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-slate-800">Child or children</span>
                <textarea
                  name="children"
                  rows={3}
                  required
                  placeholder={"Child 1\nChild 2"}
                  className={`${inputClass} py-3`}
                />
                <span className="mt-2 block text-xs text-slate-500">One name per line.</span>
              </label>

              {createState.error ? (
                <p
                  role="alert"
                  className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
                >
                  {createState.error}
                </p>
              ) : null}

              <button
                disabled={creating}
                className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-emerald-700 px-5 text-sm font-semibold text-white transition hover:bg-emerald-900 disabled:opacity-60"
              >
                {creating ? "Creating your calendar…" : "Create calendar"}
              </button>
            </form>
          </section>
        ) : null}

        {mode === "join" ? (
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
            {!initialInviteCode ? (
              <button
                type="button"
                onClick={() => setMode("choose")}
                className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-900"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back
              </button>
            ) : null}

            <div className="mt-3 flex items-start gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
                <UsersRound className="h-6 w-6" aria-hidden="true" />
              </span>
              <div>
                <h1 className="text-2xl font-semibold text-slate-950">Join a Covie calendar</h1>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Enter the private code from the person who created the calendar.
                </p>
              </div>
            </div>

            <form action={joinAction} className="mt-7 space-y-5">
              <input type="hidden" name="flow" value="onboarding" />
              <input type="hidden" name="displayName" value={defaultName} />

              <label className="block">
                <span className="text-sm font-semibold text-slate-800">Calendar code</span>
                <input
                  name="code"
                  defaultValue={initialInviteCode}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  required
                  maxLength={16}
                  placeholder="ABCD-EFGH-JKLM"
                  className={`${inputClass} font-mono uppercase tracking-[0.12em]`}
                />
              </label>

              {joinState.error ? (
                <p
                  role="alert"
                  className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
                >
                  {joinState.error}
                </p>
              ) : null}

              <button
                disabled={joining}
                className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-violet-700 px-5 text-sm font-semibold text-white transition hover:bg-violet-900 disabled:opacity-60"
              >
                {joining ? "Joining calendar…" : "Join calendar"}
              </button>
            </form>
          </section>
        ) : null}
      </section>
    </main>
  );
}
