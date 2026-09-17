"use client";

import { CalendarPlus2, KeyRound } from "lucide-react";
import { useActionState } from "react";
import {
  createCalendar,
  joinCalendar,
  type DashboardActionState,
} from "@/app/dashboard/actions";

const initialState: DashboardActionState = { error: null };
const inputClass = "mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-950 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200";

export function CreateCalendarForm({ defaultName }: { defaultName: string }) {
  const [state, action, pending] = useActionState(createCalendar, initialState);

  return (
    <form action={action} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
        <CalendarPlus2 className="h-5 w-5" aria-hidden="true" />
      </span>
      <h2 className="mt-5 text-xl font-semibold text-slate-950">Create a new shared calendar</h2>
      <p className="mt-1 text-sm leading-6 text-slate-600">Add the basics now. You can invite the other parent from the calendar.</p>

      <div className="mt-5 space-y-4">
        <label className="block"><span className="text-sm font-semibold text-slate-800">Calendar name</span><input name="calendarName" defaultValue="Our Family Calendar" required maxLength={80} className={inputClass} /></label>
        <label className="block"><span className="text-sm font-semibold text-slate-800">Your name in this calendar</span><input name="displayName" defaultValue={defaultName} required maxLength={50} className={inputClass} /></label>
        <label className="block"><span className="text-sm font-semibold text-slate-800">Children</span><span className="ml-2 text-xs text-slate-500">one name per line</span><textarea name="children" rows={3} required placeholder={"Child 1\nChild 2"} className={`${inputClass} py-3`} /></label>
      </div>

      {state.error ? <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{state.error}</p> : null}
      <button disabled={pending} className="mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-slate-950 px-5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60">{pending ? "Creating…" : "Create calendar"}</button>
    </form>
  );
}

export function JoinCalendarForm({ defaultName }: { defaultName: string }) {
  const [state, action, pending] = useActionState(joinCalendar, initialState);

  return (
    <form action={action} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
        <KeyRound className="h-5 w-5" aria-hidden="true" />
      </span>
      <h2 className="mt-5 text-xl font-semibold text-slate-950">Join with a calendar code</h2>
      <p className="mt-1 text-sm leading-6 text-slate-600">Ask the calendar owner for their private 12-character code.</p>

      <div className="mt-5 space-y-4">
        <label className="block"><span className="text-sm font-semibold text-slate-800">Calendar code</span><input name="code" autoComplete="off" autoCapitalize="characters" spellCheck={false} required maxLength={16} placeholder="ABCD-EFGH-JKLM" className={`${inputClass} font-mono uppercase tracking-[0.12em]`} /></label>
        <label className="block"><span className="text-sm font-semibold text-slate-800">Your name in this calendar</span><input name="displayName" defaultValue={defaultName} required maxLength={50} className={inputClass} /></label>
      </div>

      {state.error ? <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{state.error}</p> : null}
      <button disabled={pending} className="mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-60">{pending ? "Joining…" : "Join calendar"}</button>
    </form>
  );
}
