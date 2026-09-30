"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

/** Native history keeps the calendar mounted while Back/Forward opens and closes tools. */
export function useOwnerWorkspacePanel(calendarId: string, allowed: readonly string[]) {
  const [panel, setPanel] = useState<string | null>(null);
  const entry = useId();
  const closing = useRef(false);
  useEffect(() => {
    const read = () => {
      closing.current = false;
      const value = new URL(window.location.href).searchParams.get("panel");
      setPanel(value && allowed.includes(value) ? value : null);
    };
    read(); window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, [calendarId, allowed]);
  const clear = useCallback(() => {
    closing.current = false;
    const url = new URL(window.location.href);
    if (url.searchParams.has("panel")) {
      url.searchParams.delete("panel");
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    }
    setPanel(null);
  }, []);
  const open = useCallback((value: string) => {
    if (!allowed.includes(value)) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("panel") === value) return;
    url.searchParams.set("panel", value);
    window.history.pushState({ coviePanelEntry: `${calendarId}:${entry}` }, "", `${url.pathname}${url.search}${url.hash}`);
    setPanel(value);
  }, [allowed, calendarId, entry]);
  const close = useCallback(() => {
    if (closing.current) return;
    if (window.history.state?.coviePanelEntry === `${calendarId}:${entry}`) { closing.current = true; window.history.back(); }
    else clear();
  }, [calendarId, clear, entry]);
  return { panel, open, close, clear };
}
