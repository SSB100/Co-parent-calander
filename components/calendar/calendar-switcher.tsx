"use client";

import {
  CalendarPlus2,
  Check,
  ChevronDown,
  KeyRound,
  Plus,
} from "lucide-react";
import { useActionState, useRef } from "react";
import { useDismissibleDetails } from "@/lib/client/use-details-dismiss";
import {
  createCalendar,
  joinCalendar,
  openCalendar,
  type CalendarActionState,
} from "@/app/calendar/actions";

type Permission = "owner" | "editor" | "viewer";

export type CalendarOption = {
  id: string;
  name: string;
  permission: Permission;
  displayName: string | null;
};

const initialState: CalendarActionState = { error: null };
const inputClass =
  "mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200";

export function CalendarSwitcher({
  calendars,
  currentCalendarId,
  defaultName,
}: {
  calendars: CalendarOption[];
  currentCalendarId: string;
  defaultName: string;
}) {
  const current =
    calendars.find((calendar) => calendar.id === currentCalendarId) ?? calendars[0];
  const [createState, createAction, creating] = useActionState(
    createCalendar,
    initialState,
  );
  const [joinState, joinAction, joining] = useActionState(
    joinCalendar,
    initialState,
  );
  const detailsRef = useRef<HTMLDetailsElement>(null);
  useDismissibleDetails(detailsRef);

  return (
    <details ref={detailsRef} className="relative z-40 max-w-[calc(100vw-9rem)] sm:max-w-none">
      <summary className="group inline-flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-xl px-1 text-left text-2xl font-semibold tracking-tight text-slate-900 outline-none transition hover:text-emerald-800 focus-visible:ring-2 focus-visible:ring-emerald-200 sm:text-3xl [&::-webkit-details-marker]:hidden">
        <span className="truncate">{current?.name ?? "Covie calendar"}</span>
        <ChevronDown
          className="h-5 w-5 text-slate-400 transition group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>

      <div className="absolute left-0 top-full mt-2 max-h-[72vh] w-[min(92vw,26rem)] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
        <div className="px-2 pb-2">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            Your calendars
          </p>
        </div>

        <div className="space-y-1">
          {calendars.map((calendar) => {
            const active = calendar.id === currentCalendarId;
            return (
              <form action={openCalendar} key={calendar.id}>
                <input type="hidden" name="calendarId" value={calendar.id} />
                <button
                  type="submit"
                  disabled={active}
                  aria-current={active ? "page" : undefined}
                  className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-3 text-left transition hover:bg-slate-50 disabled:cursor-default disabled:bg-emerald-50"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-slate-900">
                      {calendar.name}
                    </span>
                    <span className="block truncate text-xs text-slate-500">
                      {calendar.displayName ?? "View-only access"} · {calendar.permission}
                    </span>
                  </span>
                  {active ? (
                    <Check className="h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />
                  ) : null}
                </button>
              </form>
            );
          })}
        </div>

        <div className="my-3 border-t border-slate-100" />

        <details name="calendar-management" className="group/create">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-xl px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
            <CalendarPlus2 className="h-4 w-4 text-emerald-700" aria-hidden="true" />
            Create another calendar
            <Plus className="ml-auto h-4 w-4 text-slate-400" aria-hidden="true" />
          </summary>

          <form action={createAction} className="mt-2 rounded-xl bg-slate-50 p-3">
            <input type="hidden" name="flow" value="calendar-management" />
            <input type="hidden" name="displayName" value={defaultName} />

            <label className="block">
              <span className="text-xs font-semibold text-slate-700">Calendar name</span>
              <input
                name="calendarName"
                required
                maxLength={80}
                placeholder="e.g. Drake"
                className={inputClass}
              />
            </label>

            <label className="mt-3 block">
              <span className="text-xs font-semibold text-slate-700">
                Child or children
              </span>
              <textarea
                name="children"
                rows={2}
                required
                placeholder={"Child 1\nChild 2"}
                className={`${inputClass} py-2.5`}
              />
              <span className="mt-1 block text-[11px] text-slate-500">
                One name per line.
              </span>
            </label>

            {createState.error ? (
              <p
                role="alert"
                className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800"
              >
                {createState.error}
              </p>
            ) : null}

            <button
              disabled={creating}
              className="covie-action-teal mt-3 min-h-10 w-full rounded-xl px-3 text-sm disabled:opacity-60"
            >
              {creating ? "Creating…" : "Create calendar"}
            </button>
          </form>
        </details>

        <details name="calendar-management" className="group/join mt-1">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-xl px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
            <KeyRound className="h-4 w-4 text-violet-700" aria-hidden="true" />
            Join another calendar
            <Plus className="ml-auto h-4 w-4 text-slate-400" aria-hidden="true" />
          </summary>

          <form action={joinAction} className="mt-2 rounded-xl bg-slate-50 p-3">
            <input type="hidden" name="displayName" value={defaultName} />

            <label className="block">
              <span className="text-xs font-semibold text-slate-700">
                Private calendar code
              </span>
              <input
                name="code"
                required
                maxLength={16}
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                placeholder="ABCD-EFGH-JKLM"
                className={`${inputClass} font-mono uppercase tracking-[0.1em]`}
              />
            </label>

            {joinState.error ? (
              <p
                role="alert"
                className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800"
              >
                {joinState.error}
              </p>
            ) : null}

            <button
              disabled={joining}
              className="covie-action-violet mt-3 min-h-10 w-full rounded-xl px-3 text-sm disabled:opacity-60"
            >
              {joining ? "Joining…" : "Join calendar"}
            </button>
          </form>
        </details>
      </div>
    </details>
  );
}
