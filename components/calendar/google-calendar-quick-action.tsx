"use client";

import { LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { GoogleGMark, googleActionClassName } from "@/components/google/google-brand";

type Connection = {
  status: "initial_sync" | "active" | "reconnect_required" | "error";
  pendingOrFailedCount: number;
};
type Payload = { configured: boolean; connection: Connection | null };

export function GoogleCalendarQuickAction() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/google-calendar", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as Payload | null;
        if (response.ok && body) setPayload(body);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  if (!payload?.configured) return null;

  if (!payload.connection || payload.connection.status === "reconnect_required") {
    return (
      <a
        href="/api/google-calendar/connect"
        className={googleActionClassName}
      >
        <GoogleGMark className="h-4.5 w-4.5" />
        <span className="hidden sm:inline">
          {payload.connection ? "Reconnect Google Calendar" : "Connect Google Calendar"}
        </span>
        <span className="sm:hidden">Calendar</span>
      </a>
    );
  }

  async function syncNow() {
    setSyncing(true);
    setMessage(null);
    try {
      const response = await fetch("/api/google-calendar/reconcile", { method: "POST" });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? "Google Calendar could not be synced.");
      setMessage("Google Calendar sync requested.");
      window.setTimeout(() => setMessage(null), 2400);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Google Calendar could not be synced.");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => void syncNow()}
        disabled={syncing}
        className={googleActionClassName}
      >
        {syncing ? (
          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <GoogleGMark className="h-4.5 w-4.5" />
        )}
        <span className="hidden sm:inline">Sync Google Calendar</span>
        <span className="sm:hidden">Google</span>
        {payload.connection.pendingOrFailedCount > 0 ? (
          <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
            {payload.connection.pendingOrFailedCount}
          </span>
        ) : null}
      </button>
      {message ? (
        <p
          role="status"
          className="absolute right-0 top-full z-40 mt-2 w-56 rounded-xl border border-slate-200 bg-white p-2 text-xs text-slate-700 shadow-lg"
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
