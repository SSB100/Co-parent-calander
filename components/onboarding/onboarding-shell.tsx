"use client";

import { ArrowLeft, CalendarPlus2, KeyRound, LogOut, UsersRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import {
  createCalendar,
  joinCalendar,
  restoreCalendar,
  type CalendarActionState,
} from "@/app/calendar/actions";
import { CalendarTypeChoiceGrid } from "@/components/calendars/calendar-type-choice-grid";
import { CovieBrand } from "@/components/workspace/covie-brand";
import { calendarGuides } from "@/lib/onboarding/calendar-guides";
import { authClient } from "@/lib/auth/client";
import {
  calendarTemplateManifests,
  type CalendarTemplateId,
} from "@/lib/templates/calendar-templates";
import type { CalendarNavigationOption } from "@/lib/calendars/navigation";

const initialState: CalendarActionState = { error: null };
const inputClass =
  "mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-950 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200";

type Mode = "choose" | "create" | "join";

function calendarNamePlaceholder(type: CalendarTemplateId) {
  switch (type) {
    case "co_parenting":
      return "e.g. Our family";
    case "staff_rosters":
      return "e.g. Harbour Cafe";
    case "shared_facilities":
      return "e.g. Community Courts";
    case "social_groups":
      return "e.g. Sunday Football";
    case "salon_bookings":
      return "e.g. Harbour Salon";
  }
}

export function OnboardingShell({
  defaultName,
  initialInviteCode,
  hasExistingCalendar,
  archivedCalendars,
}: {
  defaultName: string;
  initialInviteCode: string;
  hasExistingCalendar: boolean;
  archivedCalendars: CalendarNavigationOption[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initialInviteCode ? "join" : "choose");
  const [selectedType, setSelectedType] = useState<CalendarTemplateId | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState(false);
  const [createState, createAction, creating] = useActionState(createCalendar, initialState);
  const [joinState, joinAction, joining] = useActionState(joinCalendar, initialState);

  async function signOut() {
    setSigningOut(true);
    setSignOutError(false);
    try {
      const result = await authClient.signOut();
      if (result?.error) throw new Error("Sign out failed");
      router.push("/");
    } catch {
      setSignOutError(true);
      setSigningOut(false);
    }
  }

  function leaveCreate() {
    if (selectedType) {
      setSelectedType(null);
      return;
    }
    setMode("choose");
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-10">
      <header className="flex items-center justify-between gap-4">
        <CovieBrand />
        <div className="flex flex-wrap justify-end gap-2">
          <Link href="/personal" prefetch={false} className="covie-button covie-action-secondary">Back to Personal</Link>
          {hasExistingCalendar ? (
          <Link
            href="/calendar"
            className="covie-button covie-action-secondary"
          >
            Back to calendar
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => void signOut()}
            disabled={signingOut}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-slate-600 hover:bg-white hover:text-slate-950 disabled:opacity-60"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            {signingOut ? "Logging out…" : "Log out"}
          </button>
          )}
        </div>
      </header>

      {signOutError ? (
        <p
          role="alert"
          className="mx-auto mt-6 max-w-2xl rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
        >
          Could not log out. Please try again.
        </p>
      ) : null}

      <section className="mx-auto mt-10 max-w-2xl sm:mt-16">
        {mode === "choose" ? (
          <>
            <h1 className="covie-display text-[30px] font-[650] tracking-tight text-slate-950 sm:text-4xl">
              Add a calendar when you need one
            </h1>
            <p className="mt-4 max-w-xl text-base leading-7 text-slate-600">
              Create a shared calendar or join with an invitation code. Your own commitments will appear in Personal.
            </p>

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => {
                  setSelectedType(null);
                  setMode("create");
                }}
                className="group rounded-xl border-2 border-[#243139] bg-[#BFEDE6] p-6 text-left shadow-[5px_5px_0_#19A897] transition hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-[#19A897]"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#243139] bg-white text-[#0D7A6D]">
                  <CalendarPlus2 className="h-6 w-6" aria-hidden="true" />
                </span>
                <h2 className="mt-5 text-xl font-semibold text-slate-950">
                  Create a Covie calendar
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Choose the kind of calendar you need, then add just the basics.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setMode("join")}
                className="group rounded-xl border-2 border-[#243139] bg-[#DDD3FA] p-6 text-left shadow-[5px_5px_0_#765ED6] transition hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-[#765ED6]"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#243139] bg-white text-[#6651B7]">
                  <KeyRound className="h-6 w-6" aria-hidden="true" />
                </span>
                <h2 className="mt-5 text-xl font-semibold text-slate-950">
                  Join a Covie calendar
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Enter the private code shared with you and open the existing calendar.
                </p>
              </button>
            </div>

            {archivedCalendars.length > 0 ? (
              <section className="mt-8 rounded-xl border border-[#E6DBCF] bg-white p-4">
                <h2 className="text-base font-extrabold text-[#243139]">
                  Archived calendars
                </h2>
                <p className="mt-1 text-sm text-[#526168]">
                  Restore a calendar to put it back into your normal navigation.
                </p>
                <div className="mt-3 space-y-2">
                  {archivedCalendars.map((calendar) => (
                    <form
                      key={calendar.id}
                      action={restoreCalendar}
                      className="flex items-center justify-between gap-3 rounded-xl border border-[#E6DBCF] bg-[#FFF9F2] p-3"
                    >
                      <input
                        type="hidden"
                        name="calendarId"
                        value={calendar.id}
                      />
                      <span className="min-w-0">
                        <strong className="block truncate text-sm text-[#243139]">
                          {calendar.name}
                        </strong>
                        <span className="block truncate text-xs text-[#66747A]">
                          {calendarTemplateManifests[calendar.calendarType].name}
                        </span>
                      </span>
                      <button
                        type="submit"
                        className="min-h-11 rounded-[10px] border border-[#E6DBCF] bg-white px-3 text-sm font-extrabold text-[#243139]"
                      >
                        Restore
                      </button>
                    </form>
                  ))}
                </div>
              </section>
            ) : null}
          </>
        ) : null}

        {mode === "create" ? (
          <section className="rounded-xl border-2 border-[#19A897] bg-[#FFF9F2] p-5 shadow-[5px_5px_0_#BFEDE6] sm:p-7">
            <button
              type="button"
              onClick={leaveCreate}
              className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-900"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back
            </button>

            {!selectedType ? (
              <>
                <div className="mt-3">
                  <h1 className="covie-display text-3xl font-semibold tracking-[-0.035em] text-[#243139]">
                    What kind of calendar do you need?
                  </h1>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Pick only what you need. Each calendar has its own tools and invitations; your commitments come together in Personal.
                  </p>
                </div>
                <div className="mt-6">
                  <CalendarTypeChoiceGrid
                    selected={selectedType}
                    onSelect={setSelectedType}
                    showExamples
                  />
                </div>
              </>
            ) : (
              <>
                <div className="mt-3 flex items-start gap-4">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                    <CalendarPlus2 className="h-6 w-6" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-[#66747A]">
                      {calendarTemplateManifests[selectedType].name}
                    </p>
                    <h1 className="covie-display mt-1 text-3xl font-semibold tracking-[-0.035em] text-slate-950">
                      Create your Covie calendar
                    </h1>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      Just the basics. You can build out the details inside the calendar.
                    </p>
                  </div>
                </div>

                <div className="mt-5 rounded-xl border border-[#E6DBCF] bg-white p-4">
                  <p className="text-sm leading-6 text-[#243139]">{calendarGuides[selectedType].purpose}</p>
                  <details className="mt-2">
                    <summary className="min-h-11 cursor-pointer py-3 text-sm font-bold text-[#243139]">What happens next</summary>
                    <ol className="list-decimal space-y-2 pl-5 text-sm leading-6 text-[#526168]">{calendarGuides[selectedType].steps.map(step => <li key={step}>{step}</li>)}</ol>
                  </details>
                </div>

                <form action={createAction} className="mt-7 space-y-5">
                  <input type="hidden" name="flow" value="onboarding" />
                  <input type="hidden" name="displayName" value={defaultName} />
                  <input type="hidden" name="calendarType" value={selectedType} />

                  <label className="block">
                    <span className="text-sm font-semibold text-slate-800">
                      Calendar name
                    </span>
                    <input
                      name="calendarName"
                      placeholder={calendarNamePlaceholder(selectedType)}
                      required
                      maxLength={80}
                      className={inputClass}
                    />
                  </label>

                  {selectedType === "co_parenting" ? (
                    <label className="block">
                      <span className="text-sm font-semibold text-slate-800">
                        Child or children
                      </span>
                      <textarea
                        name="children"
                        rows={3}
                        required
                        placeholder={"Child 1\nChild 2"}
                        className={`${inputClass} py-3`}
                      />
                      <span className="mt-2 block text-xs text-slate-500">
                        One name per line.
                      </span>
                    </label>
                  ) : (
                    <input type="hidden" name="children" value="" />
                  )}

                  {selectedType === "staff_rosters" ? (
                    <label className="block">
                      <span className="text-sm font-semibold text-slate-800">Your first staff members</span>
                      <textarea name="staffNames" rows={4} required placeholder={"Alex\nSam\nTaylor"} className={`${inputClass} py-3`} />
                      <span className="mt-2 block text-xs text-slate-500">One name per line. You can add more people later.</span>
                    </label>
                  ) : null}

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
                    className="inline-flex min-h-12 w-full items-center justify-center rounded-[10px] bg-[#FF6B5F] px-5 text-sm font-bold text-[#243139] transition hover:bg-[#F35F54] disabled:opacity-60"
                  >
                    {creating
                      ? "Creating your calendar…"
                      : `Create ${calendarTemplateManifests[selectedType].name.toLowerCase()} calendar`}
                  </button>
                </form>
              </>
            )}
          </section>
        ) : null}

        {mode === "join" ? (
          <section className="rounded-xl border-2 border-[#765ED6] bg-[#FFF9F2] p-5 shadow-[5px_5px_0_#DDD3FA] sm:p-7">
            {!initialInviteCode ? (
              <button
                type="button"
                onClick={() => setMode("choose")}
                className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-900"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back
              </button>
            ) : null}

            <div className="mt-3 flex items-start gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
                <UsersRound className="h-6 w-6" aria-hidden="true" />
              </span>
              <div>
                <h1 className="covie-display text-3xl font-semibold tracking-[-0.035em] text-slate-950">
                  Join a Covie calendar
                </h1>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Enter the private code from the person who created the calendar.
                </p>
              </div>
            </div>

            <form action={joinAction} className="mt-7 space-y-5">
              <input type="hidden" name="flow" value="onboarding" />
              <input type="hidden" name="displayName" value={defaultName} />

              <label className="block">
                <span className="text-sm font-semibold text-slate-800">
                  Calendar code
                </span>
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
                className="inline-flex min-h-12 w-full items-center justify-center rounded-[10px] bg-[#765ED6] px-5 text-sm font-bold text-white transition hover:bg-[#6651B7] disabled:opacity-60"
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
