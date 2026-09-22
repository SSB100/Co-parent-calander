"use client";

import { LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { GoogleGMark, googleActionClassName } from "@/components/google/google-brand";

type Connection = {
  status: "initial_sync" | "active" | "reconnect_required" | "error";
  pendingOrFailedCount: number;
  lastSuccessfulSyncAt: string | null;
};
type Payload = { configured: boolean; connection: Connection | null };

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function readGoogleCalendarStatus() {
  const response = await fetch("/api/google-calendar", { cache: "no-store" });
  const body = (await response.json().catch(() => null)) as
    | Payload
    | { error?: string }
    | null;
  if (!response.ok || !body || !("configured" in body)) {
    throw new Error(
      body && "error" in body
        ? body.error
        : "Google Calendar status could not be checked.",
    );
  }
  return body;
}

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
      <div className="google-calendar-quick-action relative">
        <a
          href="/api/google-calendar/connect"
          className={googleActionClassName}
        >
          <GoogleGMark className="h-4.5 w-4.5" />
          <span className="hidden sm:inline">
            {payload.connection ? "Reconnect Google Calendar" : "Connect Google Calendar"}
          </span>
          <span className="sm:hidden">
            {payload.connection ? "Reconnect Google" : "Connect to Google"}
          </span>
        </a>
      </div>
    );
  }

  async function syncNow() {
    if (!payload?.connection || syncing) return;

    const previousSuccess = payload.connection.lastSuccessfulSyncAt;
    setSyncing(true);
    setMessage("Syncing with Google Calendar…");

    try {
      const response = await fetch("/api/google-calendar/reconcile", {
        method: "POST",
      });
      const body = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (!response.ok) {
        throw new Error(body?.error ?? "Google Calendar could not be synced.");
      }

      const deadline = Date.now() + 90_000;
      while (Date.now() < deadline) {
        await wait(1500);
        const next = await readGoogleCalendarStatus();
        setPayload(next);

        const connection = next.connection;
        if (!connection) {
          throw new Error("Google Calendar is no longer connected.");
        }
        if (connection.status === "reconnect_required") {
          throw new Error("Reconnect Google Calendar before syncing again.");
        }

        const completed =
          connection.lastSuccessfulSyncAt !== null &&
          connection.lastSuccessfulSyncAt !== previousSuccess &&
          connection.pendingOrFailedCount === 0;

        if (completed) {
          setMessage("Google Calendar is up to date.");
          window.setTimeout(() => setMessage(null), 5000);
          return;
        }

        if (
          connection.status === "error" &&
          connection.pendingOrFailedCount === 0
        ) {
          throw new Error("Google Calendar sync did not complete.");
        }
      }

      setMessage(
        "Google Calendar is still syncing in the background. You can keep using Covie.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Google Calendar could not be synced.",
      );
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="google-calendar-quick-action relative">
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
        <span className="hidden sm:inline">
          {syncing ? "Syncing Google Calendar…" : "Sync Google Calendar"}
        </span>
        <span className="sm:hidden">{syncing ? "Syncing…" : "Sync to Google"}</span>
        {payload.connection.pendingOrFailedCount > 0 ? (
          <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
            {payload.connection.pendingOrFailedCount}
          </span>
        ) : null}
      </button>
      {message ? (
        <p
          role="status"
          className="absolute right-0 top-full z-40 mt-2 w-56 rounded-xl border border-[#243139] bg-white p-2 text-xs text-slate-700 shadow-[4px_4px_0_#F4C64E]"
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
