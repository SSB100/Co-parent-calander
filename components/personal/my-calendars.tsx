"use client";

import { CalendarDays, Check, ChevronDown, LockKeyhole, X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal, useFormStatus } from "react-dom";
import { openCalendar } from "@/app/calendar/actions";
import { CovieButton, CovieDialog, CovieIconButton } from "@/components/ui/covie";
import type { CalendarNavigationOption } from "@/lib/calendars/navigation";
import { calendarTemplateManifests } from "@/lib/templates/calendar-templates";
import styles from "./my-calendars.module.css";

function CalendarChoice({ calendar }: { calendar: CalendarNavigationOption }) {
  const { pending } = useFormStatus();
  return <button type="submit" className={styles.choice} disabled={pending}>
    <CalendarDays size={18} aria-hidden="true" />
    <span><strong>{calendar.name}</strong><small>{pending ? "Opening…" : calendarTemplateManifests[calendar.calendarType].name}</small></span>
  </button>;
}

export function MyCalendars({ mobile = false }: { mobile?: boolean }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0, maxHeight: 400 });
  const [calendars, setCalendars] = useState<CalendarNavigationOption[] | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const titleId = useId();
  const panelId = useId();
  const close = useCallback((restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus();
  }, []);

  function toggle() {
    if (open) { close(); return; }
    const rect = trigger.current!.getBoundingClientRect();
    const top = Math.min(rect.bottom + 8, window.innerHeight - 160);
    setPosition({ left: Math.max(12, Math.min(rect.left, window.innerWidth - 372)), top: Math.max(12, top), maxHeight: window.innerHeight - Math.max(12, top) - 12 });
    setCalendars(null);
    setError("");
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    let current = true;
    void (async () => {
      try {
        const response = await fetch("/api/calendars/navigation", { cache: "no-store", signal: controller.signal });
        const result = await response.json();
        if (!response.ok) throw new Error(response.status === 401 ? "Sign in again to see your calendars." : "Your calendars could not be loaded. Try again.");
        if (!Array.isArray(result.calendars)) throw new Error("Your calendars could not be loaded. Try again.");
        if (current) setCalendars(result.calendars);
      } catch (failure) {
        if (current && !controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Your calendars could not be loaded. Try again.");
      }
    })();
    return () => { current = false; controller.abort(); };
  }, [open, revision]);

  useEffect(() => {
    if (!open) return;
    const dismiss = () => close(false);
    const hide = () => { if (document.visibilityState === "hidden") dismiss(); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); close(); } };
    const outside = (event: Event) => {
      if (!mobile && event.target instanceof Node && !panel.current?.contains(event.target) && !trigger.current?.contains(event.target)) close(false);
    };
    if (!mobile) panel.current?.focus();
    const overflow = document.body.style.overflow;
    if (mobile) document.body.style.overflow = "hidden";
    document.addEventListener("keydown", escape);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", outside);
    window.addEventListener("blur", dismiss);
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("resize", dismiss);
    window.addEventListener("orientationchange", dismiss);
    window.addEventListener("popstate", dismiss);
    window.addEventListener("pagehide", dismiss);
    window.addEventListener("pageshow", dismiss);
    return () => {
      if (mobile) document.body.style.overflow = overflow;
      document.removeEventListener("keydown", escape);
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", outside);
      window.removeEventListener("blur", dismiss);
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("orientationchange", dismiss);
      window.removeEventListener("popstate", dismiss);
      window.removeEventListener("pagehide", dismiss);
      window.removeEventListener("pageshow", dismiss);
    };
  }, [open, mobile, close]);

  const choices = <div id={panelId} className={styles.choices}>
    <button type="button" className={styles.choice} aria-current="page" onClick={() => close()}>
      <LockKeyhole size={18} aria-hidden="true" /><span><strong>Personal</strong><small>Your commitments · only visible to you</small></span><Check size={18} aria-hidden="true" /><span className="sr-only">Current calendar</span>
    </button>
    <p className={styles.label}>Active calendars</p>
    {error ? <div role="alert" className={styles.message}><p>{error}</p><CovieButton tone="neutral" onClick={() => { setCalendars(null); setError(""); setRevision((value) => value + 1); }}>Try again</CovieButton></div> : calendars === null ? <p role="status" className={styles.message}>Loading your calendars…</p> : calendars.length ? calendars.map((calendar) => <form key={calendar.id} action={openCalendar}>
      <input type="hidden" name="calendarId" value={calendar.id} /><CalendarChoice calendar={calendar} />
    </form>) : <p className={styles.message}>You don’t have any active shared calendars yet. Use Add calendar to create or join one.</p>}
  </div>;

  return <>
    <button ref={trigger} type="button" aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? panelId : undefined} onClick={toggle}>
      <CalendarDays size={mobile ? 20 : 17} aria-hidden="true" /><span>My calendars</span>{!mobile && <ChevronDown size={14} aria-hidden="true" />}
    </button>
    {open && createPortal(mobile ? <CovieDialog id={titleId} title="My calendars" description="Choose an active calendar to open." size="sm" icon={<CalendarDays aria-hidden="true" />} onClose={() => close()}>{choices}</CovieDialog> : <section ref={panel} className={styles.popover} style={position} role="dialog" aria-labelledby={titleId} tabIndex={-1}>
      <header className={styles.header}><h2 id={titleId}>My calendars</h2><CovieIconButton aria-label="Close My calendars" onClick={() => close()}><X size={18} aria-hidden="true" /></CovieIconButton></header>{choices}
    </section>, document.body)}
  </>;
}
