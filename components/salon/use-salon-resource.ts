"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { SalonLoader, type SalonIdentity } from "./salon-loader";
export function useSalonResource<T>(
  url: string | null,
  identity: SalonIdentity = {},
  calendarHeader?: string,
) {
  const key = JSON.stringify([url, identity, calendarHeader]);
  const scope = JSON.stringify([
    url?.split("?")[0],
    identity.calendarId,
    identity.appointmentId,
    calendarHeader,
  ]);
  // Retain same-scope controls and drafts during revalidation so keyboard focus
  // and an interrupted booking's request ID survive. Callers hide stale day
  // results while loading; any failed access check clears the entire snapshot.
  const [snapshot, setSnapshot] = useState<{ scope: string; data: T } | null>(
      null,
    ),
    [state, setState] = useState({ key, loading: Boolean(url), error: "" });
  const loader = useRef<SalonLoader<T> | null>(null),
    revision = useRef(0);
  const calendarId = identity.calendarId,
    appointmentId = identity.appointmentId,
    date = identity.date;
  const refresh = useCallback(async () => {
    const current = ++revision.current;
    loader.current ??= new SalonLoader<T>();
    loader.current.cancel();
    setState({ key, loading: Boolean(url), error: "" });
    if (!url) {
      setSnapshot(null);
      return;
    }
    try {
      const body = await loader.current.load(
        url,
        { calendarId, appointmentId, date },
        calendarHeader,
      );
      if (current !== revision.current || !body) return;
      setSnapshot({ scope, data: body });
      setState({ key, loading: false, error: "" });
    } catch (error) {
      if (current === revision.current) {
        setSnapshot(null);
        setState({
          key,
          loading: false,
          error:
            error instanceof Error
              ? error.message
              : "This information could not be loaded. Try again.",
        });
      }
    }
  }, [key, scope, url, calendarHeader, calendarId, appointmentId, date]);
  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    const recheck = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("focus", recheck);
    window.addEventListener("pageshow", recheck);
    document.addEventListener("visibilitychange", recheck);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", recheck);
      window.removeEventListener("pageshow", recheck);
      document.removeEventListener("visibilitychange", recheck);
      loader.current?.cancel();
      revision.current += 1;
    };
  }, [refresh]);
  return {
    data: snapshot?.scope === scope ? snapshot.data : null,
    loading: state.key !== key || state.loading,
    error: state.key === key ? state.error : "",
    refresh,
  };
}
export function useSalonMutation(
  url: string,
  calendarHeader?: string,
  onAccessChanged?: () => void,
) {
  const lock = useRef(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [status, setStatus] = useState(0);
  const save = async (payload: unknown) => {
    if (lock.current) return null;
    lock.current = true;
    setBusy(true);
    setError("");
    setStatus(0);
    try {
      const response = await fetch(url, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          ...(calendarHeader ? { "x-covie-calendar-id": calendarHeader } : {}),
        },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => null);
      setStatus(response.status);
      if (
        response.status === 401 ||
        response.status === 403 ||
        (response.status === 409 &&
          typeof body?.error === "string" &&
          body.error.startsWith("Your selected calendar changed"))
      )
        onAccessChanged?.();
      if (!response.ok || !body?.ok)
        throw new Error(
          body?.error ||
            "The result could not be confirmed. Refresh before trying again.",
        );
      return body as {
        ok: true;
        id?: string;
        code?: string;
        expiresAt?: string;
      };
    } catch (caught) {
      setError(
        caught instanceof Error && !(caught instanceof TypeError)
          ? caught.message
          : "The connection was interrupted. Refresh to check before retrying.",
      );
      return null;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return { save, busy, error, setError, status };
}
