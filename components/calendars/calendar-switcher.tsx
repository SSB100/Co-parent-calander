"use client";

import {
  CalendarPlus2,
  Check,
  ChevronDown,
  KeyRound,
  Plus,
} from "lucide-react";
import { useActionState, useRef, useState } from "react";
import { useDismissibleDetails } from "@/lib/client/use-details-dismiss";
import {
  createCalendar,
  joinCalendar,
  openCalendar,
  type CalendarActionState,
} from "@/app/calendar/actions";
import { CalendarTypeChoiceGrid } from "@/components/calendars/calendar-type-choice-grid";
import {
  calendarTemplateManifests,
  type CalendarTemplateId,
} from "@/lib/templates/calendar-templates";

type Permission = "owner" | "editor" | "viewer";

export type CalendarOption = {
  id: string;
  name: string;
  calendarType: CalendarTemplateId;
  permission: Permission;
  displayName: string | null;
};

const initialState: CalendarActionState = { error: null };
const inputClass = "covie-input mt-2";
const textareaClass = "covie-textarea mt-2";

function calendarNamePlaceholder(type: CalendarTemplateId) {
  switch (type) {
    case "co_parenting":
      return "e.g. Drake";
    case "staff_rosters":
      return "e.g. Harbour Cafe";
    case "shared_facilities":
      return "e.g. Community Courts";
    case "social_groups":
      return "e.g. Sunday Football";
  }
}

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
  const [selectedType, setSelectedType] = useState<CalendarTemplateId | null>(null);
  const detailsRef = useRef<HTMLDetailsElement>(null);
  useDismissibleDetails(detailsRef);

  const currentTemplate = current
    ? calendarTemplateManifests[current.calendarType]
    : null;

  return (
    <details
      ref={detailsRef}
      className="calendar-switcher relative z-40 max-w-[calc(50vw-2.75rem)] sm:max-w-none"
    >
      <summary className="group inline-flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-[10px] px-1 text-left text-[#243139] transition hover:text-[#0B665C] [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="block truncate text-2xl font-semibold tracking-tight sm:text-3xl">
            {current?.name ?? "Covie calendar"}
          </span>
          <span className="mt-0.5 block truncate text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#66747A]">
            {currentTemplate?.name ?? "Calendar"}
          </span>
        </span>
        <ChevronDown
          className="h-5 w-5 shrink-0 text-slate-400 transition group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>

      <div className="absolute left-0 top-full mt-2 max-h-[72vh] w-[min(92vw,28rem)] overflow-y-auto rounded-xl border-2 border-[#243139] bg-[#FFF9F2] p-3 shadow-[5px_5px_0_#F4C64E]">
        <div className="px-2 pb-2">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            Your calendars
          </p>
        </div>

        <div className="space-y-1">
          {calendars.map((calendar) => {
            const active = calendar.id === currentCalendarId;
            const template = calendarTemplateManifests[calendar.calendarType];

            return (
              <form action={openCalendar} key={calendar.id}>
                <input type="hidden" name="calendarId" value={calendar.id} />
                <button
                  type="submit"
                  disabled={active}
                  aria-current={active ? "page" : undefined}
                  className="flex min-h-14 w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-[#F7EFE5] disabled:cursor-default disabled:bg-[#EAF8F5]"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-extrabold text-slate-900">
                      {calendar.name}
                    </span>
                    <span className="mt-0.5 block truncate text-xs font-bold text-[#526168]">
                      {template.name}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-slate-500">
                      {calendar.displayName ?? "Account access"} · {calendar.permission}
                    </span>
                  </span>
                  {active ? (
                    <Check
                      className="h-4 w-4 shrink-0 text-[#0B665C]"
                      aria-hidden="true"
                    />
                  ) : null}
                </button>
              </form>
            );
          })}
        </div>

        <div className="my-3 border-t border-[#E6DBCF]" />

        <details name="calendar-management" className="group/create">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-xl px-3 text-sm font-semibold text-slate-700 hover:bg-[#F7EFE5] [&::-webkit-details-marker]:hidden">
            <CalendarPlus2
              className="h-4 w-4 text-[#0B665C]"
              aria-hidden="true"
            />
            Create another calendar
            <Plus className="ml-auto h-4 w-4 text-slate-400" aria-hidden="true" />
          </summary>

          <div className="mt-2 rounded-xl bg-white p-3">
            {selectedType ? (
              <>
                <button
                  type="button"
                  onClick={() => setSelectedType(null)}
                  className="min-h-11 text-xs font-extrabold text-[#526168] hover:text-[#243139]"
                >
                  ← Choose a different type
                </button>

                <div className="mb-3 rounded-xl border border-[#E6DBCF] bg-[#FFF9F2] p-3">
                  <span className="text-xs font-extrabold uppercase tracking-[0.08em] text-[#66747A]">
                    Calendar type
                  </span>
                  <strong className="mt-1 block text-sm text-[#243139]">
                    {calendarTemplateManifests[selectedType].name}
                  </strong>
                </div>

                <form action={createAction}>
                  <input type="hidden" name="flow" value="calendar-management" />
                  <input type="hidden" name="displayName" value={defaultName} />
                  <input type="hidden" name="calendarType" value={selectedType} />

                  <label className="block">
                    <span className="text-xs font-semibold text-slate-700">
                      Calendar name
                    </span>
                    <input
                      name="calendarName"
                      required
                      maxLength={80}
                      placeholder={calendarNamePlaceholder(selectedType)}
                      className={inputClass}
                    />
                  </label>

                  {selectedType === "co_parenting" ? (
                    <label className="mt-3 block">
                      <span className="text-xs font-semibold text-slate-700">
                        Child or children
                      </span>
                      <textarea
                        name="children"
                        rows={2}
                        required
                        placeholder={"Child 1\nChild 2"}
                        className={textareaClass}
                      />
                      <span className="mt-1 block text-[11px] text-slate-500">
                        One name per line.
                      </span>
                    </label>
                  ) : (
                    <input type="hidden" name="children" value="" />
                  )}

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
                    className="covie-primary-action mt-3 min-h-11 w-full rounded-[10px] px-3 text-sm font-extrabold disabled:opacity-60"
                  >
                    {creating
                      ? "Creating…"
                      : `Create ${calendarTemplateManifests[selectedType].name.toLowerCase()} calendar`}
                  </button>
                </form>
              </>
            ) : (
              <>
                <p className="mb-3 text-xs font-bold text-[#526168]">
                  What will this calendar be used for?
                </p>
                <CalendarTypeChoiceGrid
                  selected={selectedType}
                  onSelect={setSelectedType}
                  compact
                />
              </>
            )}
          </div>
        </details>

        <details name="calendar-management" className="group/join mt-1">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-xl px-3 text-sm font-semibold text-slate-700 hover:bg-[#F7EFE5] [&::-webkit-details-marker]:hidden">
            <KeyRound
              className="h-4 w-4 text-[#6651B7]"
              aria-hidden="true"
            />
            Join another calendar
            <Plus className="ml-auto h-4 w-4 text-slate-400" aria-hidden="true" />
          </summary>

          <form action={joinAction} className="mt-2 rounded-xl bg-white p-3">
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
              className="covie-action-violet mt-3 min-h-11 w-full rounded-[10px] px-3 text-sm disabled:opacity-60"
            >
              {joining ? "Joining…" : "Join calendar"}
            </button>
          </form>
        </details>
      </div>
    </details>
  );
}
