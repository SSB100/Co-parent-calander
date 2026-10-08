"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TimesheetsData } from "@/lib/timesheets/contracts";

export type TimesheetsSave = (action: string, data: Record<string, unknown>) => Promise<boolean>;
const changeKey = "covie:timesheets:changed";
const unavailable = "These timesheets are unavailable. Your access or selected calendar may have changed. Refresh to check.";

/** No persistent/private browser cache; every response is checked against its request scope. */
export function useTimesheetsResource(calendarId: string, date: string, view: "day" | "week") {
  const key = JSON.stringify([calendarId, date, view]);
  const [snapshot, setSnapshot] = useState<{ key: string; data: TimesheetsData; revision: number } | null>(null);
  const [state, setState] = useState({ key, loading: true, error: "" });
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState({ key, notice: "", error: "", invitationUrl: "" });
  const request = useRef<AbortController | null>(null);
  const mutation = useRef<AbortController | null>(null);
  const revision = useRef(0);
  const lock = useRef(false);
  const alive = useRef(false);
  const currentKey = useRef(key);

  const refresh = useCallback(async (preserveFeedback = false) => {
    const sequence = ++revision.current;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setSnapshot(null);
    setState({ key, loading: true, error: "" });
    if (!preserveFeedback) setFeedback({ key, notice: "", error: "", invitationUrl: "" });
    try {
      const query = new URLSearchParams({ view, ...(date ? { date } : {}) });
      const response = await fetch(`/api/timesheets?${query}`, {
        credentials: "same-origin", cache: "no-store", signal: controller.signal,
        headers: { "x-covie-calendar-id": calendarId },
      });
      const body = await response.json().catch(() => null) as TimesheetsData | null;
      if (!response.ok || !body || body.calendarId !== calendarId || body.view !== view || (date && body.date !== date)) throw new Error(unavailable);
      if (!Array.isArray(body.entries) || !Array.isArray(body.staff) || !body.organisation || !["owner", "manager", "member"].includes(body.role)) throw new Error(unavailable);
      if (controller.signal.aborted || sequence !== revision.current || !alive.current || currentKey.current !== key) return false;
      setSnapshot({ key, data: body, revision: sequence });
      setState({ key, loading: false, error: "" });
      return true;
    } catch {
      if (controller.signal.aborted || sequence !== revision.current || !alive.current || currentKey.current !== key) return false;
      setSnapshot(null);
      setFeedback({ key, notice: "", error: "", invitationUrl: "" });
      setState({ key, loading: false, error: unavailable });
      return false;
    }
  }, [calendarId, date, key, view]);

  useEffect(() => {
    alive.current = true;
    currentKey.current = key;
    const timer = window.setTimeout(() => void refresh(), 0);
    const recheck = () => { if (document.visibilityState !== "hidden") void refresh(); };
    const storage = () => { void refresh(); };
    window.addEventListener("focus", recheck);
    window.addEventListener("pageshow", recheck);
    window.addEventListener("storage", storage);
    document.addEventListener("visibilitychange", recheck);
    return () => {
      alive.current = false;
      revision.current += 1;
      window.clearTimeout(timer);
      request.current?.abort();
      mutation.current?.abort();
      window.removeEventListener("focus", recheck);
      window.removeEventListener("pageshow", recheck);
      window.removeEventListener("storage", storage);
      document.removeEventListener("visibilitychange", recheck);
    };
  }, [key, refresh]);

  const data = snapshot?.key === key && state.key === key && !state.loading ? snapshot.data : null;
  const save: TimesheetsSave = async (action, payload) => {
    if (lock.current || !data || currentKey.current !== key || !alive.current) return false;
    lock.current = true;
    setBusy(true);
    setFeedback({ key, notice: "", error: "", invitationUrl: "" });
    const controller = new AbortController();
    mutation.current = controller;
    const issuedRevision = revision.current;
    try {
      const response = await fetch("/api/timesheets", {
        method: "POST", credentials: "same-origin", cache: "no-store", signal: controller.signal,
        headers: { "content-type": "application/json", "x-covie-calendar-id": calendarId },
        body: JSON.stringify({ action, data: payload }),
      });
      const body = await response.json().catch(() => null);
      if (!alive.current || currentKey.current !== key || controller.signal.aborted) return false;
      if (issuedRevision !== revision.current) { await refresh(); return false; }
      if (!response.ok || body?.ok !== true) throw new Error(typeof body?.error === "string" ? body.error : "The result could not be confirmed. Check the refreshed timesheet before retrying.");
      const ready = await refresh(true);
      if (!ready || !alive.current || currentKey.current !== key) return false;
      setFeedback({ key, notice: action === "createInvite" ? "Invitation created. Share this personal link with the staff member; no email was sent." : "Saved.", error: "", invitationUrl: action === "createInvite" && typeof body.invitationUrl === "string" ? new URL(body.invitationUrl, window.location.origin).href : "" });
      try { window.localStorage.setItem(changeKey, String(Date.now())); } catch { /* Private mode still revalidates on focus. */ }
      return true;
    } catch (error) {
      if (!alive.current || currentKey.current !== key || controller.signal.aborted) return false;
      const message = error instanceof Error && !(error instanceof TypeError) ? error.message : "The connection was interrupted. Check the refreshed timesheet before retrying.";
      await refresh(true);
      if (alive.current && currentKey.current === key) setFeedback({ key, notice: "", error: message, invitationUrl: "" });
      return false;
    } finally {
      lock.current = false;
      if (alive.current && currentKey.current === key) setBusy(false);
    }
  };

  return { data, generation: snapshot?.revision ?? 0, loading: state.key !== key || state.loading, error: state.key === key ? state.error : "", busy, save, refresh, feedback: feedback.key === key ? feedback : null };
}
