"use client";

import Link from "next/link";
import { useCallback, useSyncExternalStore } from "react";
import { X } from "lucide-react";
import { CovieIconButton } from "@/components/ui/covie";
import { calendarGuides } from "@/lib/onboarding/calendar-guides";
import { dismissSetupGuide, setupGuideIsDismissed, setupGuidePreferenceEvent, setupGuidePreferenceKey } from "@/lib/onboarding/guide-preferences";
import type { CalendarTemplateId } from "@/lib/templates/calendar-templates";

function subscribe(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener(setupGuidePreferenceEvent, listener);
  return () => { window.removeEventListener("storage", listener); window.removeEventListener(setupGuidePreferenceEvent, listener); };
}
const hiddenOnServer = () => true;

/** Only mounted for a newly created, owner-operated calendar. */
export function CalendarSetupGuide({ accountScope, calendarId, type }: { accountScope: string; calendarId: string; type: Exclude<CalendarTemplateId, "co_parenting"> }) {
  const key = setupGuidePreferenceKey(accountScope, calendarId);
  const getSnapshot = useCallback(() => setupGuideIsDismissed(key), [key]);
  const dismissed = useSyncExternalStore(subscribe, getSnapshot, hiddenOnServer);
  if (dismissed) return null;
  const guide = calendarGuides[type];
  return <section aria-label="Set up this calendar" className="mb-5 rounded-xl border border-[#E6DBCF] bg-white p-4">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0"><h2 className="text-base font-bold text-[#243139]">A simple way to get started</h2><p className="mt-1 text-sm leading-6 text-[#526168]">{guide.purpose}</p></div>
      <CovieIconButton aria-label="Dismiss setup guide" onClick={() => dismissSetupGuide(key)}><X size={18} aria-hidden="true" /></CovieIconButton>
    </div>
    <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-[#243139]">{guide.steps.map(step => <li key={step}>{step}</li>)}</ol>
    <div className="mt-4 flex flex-wrap items-center gap-3"><Link href={guide.startPath} onClick={() => dismissSetupGuide(key)} className="covie-button covie-primary-action">{guide.startLabel}</Link><button type="button" className="covie-button covie-action-secondary" onClick={() => dismissSetupGuide(key)}>I’ll explore on my own</button></div>
  </section>;
}
