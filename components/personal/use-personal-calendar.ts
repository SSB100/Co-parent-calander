"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PersonalData } from "@/lib/personal/contracts";
import { PersonalLoader } from "./personal-loader";
import { personalQueryKey, scopePersonalData, type PersonalQuery } from "./personal-ui";

export function usePersonalCalendar(initialData: PersonalData, query: PersonalQuery) {
  const key = personalQueryKey(query);
  const [snapshot, setSnapshot] = useState<{ key: string; data: PersonalData; initialData: PersonalData } | null>(() => ({ key: personalQueryKey({ month: initialData.month, timezone: initialData.timezone, source: "" }), data: scopePersonalData(initialData, ""), initialData }));
  const [sourceSnapshot, setSources] = useState({ items: initialData.sources, initialData });
  const [status, setStatus] = useState({ key, loading: false, error: "", initialData });
  const loader = useRef<PersonalLoader | null>(null);
  const revision = useRef(0);
  const { month, timezone, source } = query;

  const refresh = useCallback(async () => {
    const current = ++revision.current;
    loader.current ??= new PersonalLoader();
    setSnapshot(null);
    setStatus({ key, loading: true, error: "", initialData });
    try {
      const next = await loader.current.load({ month, timezone, source });
      if (current !== revision.current || !next) return;
      setSnapshot({ key, data: next, initialData });
      setSources({ items: next.sources, initialData });
      setStatus({ key, loading: false, error: "", initialData });
    } catch (error) {
      if (current !== revision.current) return;
      setSnapshot(null);
      setSources({ items: [], initialData });
      setStatus({ key, loading: false, error: error instanceof Error ? error.message : "Personal could not be refreshed.", initialData });
    }
  }, [key, month, timezone, source, initialData]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh(); }, 0);
    const recheck = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", recheck);
    window.addEventListener("pageshow", recheck);
    document.addEventListener("visibilitychange", recheck);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", recheck);
      window.removeEventListener("pageshow", recheck);
      document.removeEventListener("visibilitychange", recheck);
      revision.current += 1;
      loader.current?.cancel();
    };
  }, [refresh]);

  // A fresh server render (including source revocation) invalidates older client data
  // immediately, before effects run. The selected month and view can stay in place.
  return {
    data: snapshot?.initialData === initialData && snapshot.key === key ? snapshot.data : null,
    sources: sourceSnapshot.initialData === initialData ? sourceSnapshot.items : initialData.sources,
    loading: status.initialData !== initialData || status.key !== key || status.loading,
    error: status.initialData === initialData && status.key === key ? status.error : "",
    refresh,
  };
}
