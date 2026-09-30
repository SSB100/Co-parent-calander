"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarAccessDeniedError, CalendarContextChangedError, calendarContextHeaders, requireCalendarContext, throwIfCalendarAccessDenied, throwIfCalendarContextChanged } from "@/components/calendar-sharing/calendar-context";
import type { SocialData } from "@/lib/social-groups/contracts";
import type { SocialSave } from "./social-ui";

export function useSocialGroups(calendarId: string, month: string, enabled: boolean, onSnapshot?: (data: SocialData | null) => void) {
  const [data, setData] = useState<SocialData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const mounted = useRef(false);
  const requestSequence = useRef(0);
  const currentRequest = useRef<AbortController | null>(null);
  const mutationLock = useRef(false);
  const acceptSnapshot = useCallback((next: SocialData | null) => { setData(next); onSnapshot?.(next); }, [onSnapshot]);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    const sequence = ++requestSequence.current;
    currentRequest.current?.abort();
    const controller = new AbortController(); currentRequest.current = controller;
    setLoading(true); setLoadError("");
    try {
      const response = await fetch(`/api/social-groups${month ? `?month=${encodeURIComponent(month)}` : ""}`, { cache: "no-store", headers: calendarContextHeaders(calendarId), signal: controller.signal });
      const body = await response.json().catch(() => null) as SocialData | { error?: string } | null;
      throwIfCalendarAccessDenied(response.status, body);
      throwIfCalendarContextChanged(response.status, body);
      if (!response.ok || !body || !("events" in body)) throw new Error(body && "error" in body && body.error ? body.error : "Your group calendar could not be loaded.");
      if (mounted.current && sequence === requestSequence.current) acceptSnapshot(requireCalendarContext(body, calendarId));
    } catch (caught) {
      if (!controller.signal.aborted && mounted.current && sequence === requestSequence.current) {
        if (caught instanceof CalendarContextChangedError || caught instanceof CalendarAccessDeniedError) acceptSnapshot(null);
        setLoadError(caught instanceof Error ? caught.message : "Your group calendar could not be loaded.");
      }
    } finally {
      if (mounted.current && sequence === requestSequence.current) setLoading(false);
    }
  }, [calendarId, enabled, month, acceptSnapshot]);

  useEffect(() => {
    mounted.current = true;
    const timer = window.setTimeout(() => { void refresh(); }, 0);
    const recheck = () => { if (document.visibilityState === "visible" && !mutationLock.current) void refresh(); };
    window.addEventListener("focus", recheck); window.addEventListener("pageshow", recheck); document.addEventListener("visibilitychange", recheck);
    return () => { mounted.current = false; window.clearTimeout(timer); window.removeEventListener("focus", recheck); window.removeEventListener("pageshow", recheck); document.removeEventListener("visibilitychange", recheck); currentRequest.current?.abort(); requestSequence.current += 1; };
  }, [refresh]);

  const save: SocialSave = async (action, payload) => {
    if (mutationLock.current) return false;
    mutationLock.current = true; setBusy(true); setError(""); setNotice("");
    let responseReceived = false;
    try {
      const response = await fetch("/api/social-groups", { method: "POST", headers: { "content-type": "application/json", ...calendarContextHeaders(calendarId) }, body: JSON.stringify({ action, data: payload }) });
      responseReceived = true;
      const body = await response.json().catch(() => null) as { ok?: boolean; error?: string; warning?: string | null } | null;
      throwIfCalendarAccessDenied(response.status, body);
      throwIfCalendarContextChanged(response.status, body);
      if (!response.ok || !body?.ok) throw new Error(body?.error ?? "The save result could not be verified. Reload to check before trying again.");
      if (!mounted.current) return true;
      setNotice(body.warning || ({ event: "Event saved.", cancel: "Event cancelled. Its history is still available.", rsvp: "Your response is saved.", availability: "Your availability is saved and shared with the group.", settings: "Group settings saved." }[action]));
      void refresh(); return true;
    } catch (caught) {
      if (mounted.current) {
        if (caught instanceof CalendarContextChangedError || caught instanceof CalendarAccessDeniedError) { currentRequest.current?.abort(); requestSequence.current += 1; acceptSnapshot(null); setLoadError(caught.message); setLoading(false); }
        setError(responseReceived ? caught instanceof Error ? caught.message : "This change could not be saved." : "The connection was interrupted. The request may have reached Covie. Reload to check before trying again.");
      }
      return false;
    } finally {
      mutationLock.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  return { data, loading, loadError, error, notice, busy, mutationLock, refresh, save, clearMessages: () => { setError(""); setNotice(""); } };
}
