"use client";

import { CalendarSync, LoaderCircle, RefreshCw, Unplug } from "lucide-react";
import { GoogleGMark, googleActionClassName } from "@/components/google/google-brand";
import { useEffect, useMemo, useState } from "react";

type Connection = {
  status: "initial_sync" | "active" | "reconnect_required" | "error";
  syncParenting: boolean;
  syncHandovers: boolean;
  syncSharedEvents: boolean;
  syncLocations: boolean;
  syncSharedNotes: boolean;
  parentLabelMode: "names" | "neutral";
  lastSuccessfulSyncAt: string | null;
  lastAttemptedSyncAt: string | null;
  pendingOrFailedCount: number;
  hasGeneratedCalendar: boolean;
};
type Payload = { configured: boolean; connection: Connection | null };

function statusText(connection: Connection) {
  if (connection.status === "reconnect_required") return "Reconnect required";
  if (connection.status === "error") return "Sync failed — retrying";
  if (connection.status === "initial_sync") return "Initial sync in progress";
  if (connection.pendingOrFailedCount > 0) return "Changes waiting to sync";
  if (!connection.lastSuccessfulSyncAt) return "Connected";
  const age = Date.now() - new Date(connection.lastSuccessfulSyncAt).getTime();
  if (age < 90_000) return "Synced just now";
  const minutes = Math.max(1, Math.round(age / 60_000));
  if (minutes < 60) return `Synced ${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  return `Synced ${hours} hour${hours === 1 ? "" : "s"} ago`;
}

export function GoogleCalendarSettings() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [draft, setDraft] = useState<Connection | null>(null);
  const [busy, setBusy] = useState<"load" | "save" | "sync" | "disconnect" | null>("load");
  const [message, setMessage] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  async function load() {
    setBusy("load");
    setMessage(null);
    try {
      const response = await fetch("/api/google-calendar", { cache: "no-store" });
      const body = (await response.json().catch(() => null)) as Payload | { error?: string } | null;
      if (!response.ok || !body || !("configured" in body)) {
        throw new Error(body && "error" in body ? body.error : "Google Calendar settings could not be loaded.");
      }
      setPayload(body);
      setDraft(body.connection);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Google Calendar settings could not be loaded.");
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    let cancelled = false;

    fetch("/api/google-calendar", { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as Payload | { error?: string } | null;
        if (!response.ok || !body || !("configured" in body)) {
          throw new Error(
            body && "error" in body
              ? body.error
              : "Google Calendar settings could not be loaded.",
          );
        }
        if (!cancelled) {
          setPayload(body);
          setDraft(body.connection);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setMessage(
            error instanceof Error
              ? error.message
              : "Google Calendar settings could not be loaded.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setBusy(null);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const connection = payload?.connection ?? null;
  const label = useMemo(() => (connection ? statusText(connection) : "Not connected"), [connection]);

  async function save() {
    if (!draft) return;
    setBusy("save");
    setMessage(null);
    try {
      const response = await fetch("/api/google-calendar", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          syncParenting: draft.syncParenting,
          syncHandovers: draft.syncHandovers,
          syncSharedEvents: draft.syncSharedEvents,
          syncLocations: draft.syncLocations,
          syncSharedNotes: draft.syncSharedNotes,
          parentLabelMode: draft.parentLabelMode,
        }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? "Sync settings could not be saved.");
      setMessage("Google Calendar settings saved. Changes are queued to sync.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sync settings could not be saved.");
      setBusy(null);
    }
  }

  async function syncNow() {
    setBusy("sync");
    setMessage(null);
    try {
      const response = await fetch("/api/google-calendar/reconcile", { method: "POST" });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? "Google Calendar could not be synced.");
      setMessage("Sync requested.");
      window.setTimeout(() => void load(), 900);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Google Calendar could not be synced.");
      setBusy(null);
    }
  }

  async function disconnect(deleteCalendar: boolean) {
    setBusy("disconnect");
    setMessage(null);
    try {
      const response = await fetch("/api/google-calendar", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deleteCalendar }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? "Google Calendar could not be disconnected.");
      setDisconnecting(false);
      setMessage(
        deleteCalendar
          ? "Google Calendar disconnected and the generated calendar was removed."
          : "Google Calendar disconnected. The generated calendar was left in your Google account.",
      );
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Google Calendar could not be disconnected.");
      setBusy(null);
    }
  }

  const toggle = (
    key: "syncParenting" | "syncHandovers" | "syncSharedEvents" | "syncLocations" | "syncSharedNotes",
  ) => {
    if (!draft) return;
    setDraft({ ...draft, [key]: !draft[key] });
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4" aria-labelledby="google-calendar-title">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm">
          <GoogleGMark />
        </div>
        <div className="min-w-0">
          <h3 id="google-calendar-title" className="text-sm font-semibold text-slate-900">Google Calendar</h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Optional one-way sync. Covie stays authoritative and never imports your personal Google events.
          </p>
        </div>
      </div>

      {busy === "load" && !payload ? (
        <div role="status" className="mt-4 flex items-center gap-2 text-sm text-slate-600">
          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
          Loading Google Calendar status…
        </div>
      ) : null}

      {message ? (
        <p role="status" aria-live="polite" className="mt-3 rounded-xl bg-white px-3 py-2 text-xs text-slate-700">
          {message}
        </p>
      ) : null}

      {payload && !payload.configured ? (
        <p className="mt-4 rounded-xl bg-white px-3 py-2 text-xs text-slate-600">
          Google Calendar syncing is not configured in this environment. The rest of the calendar works normally.
        </p>
      ) : null}

      {payload?.configured && !connection ? (
        <div className="mt-4">
          <p className="mb-3 text-sm font-semibold text-slate-800">Not connected</p>
          <a
            href="/api/google-calendar/connect"
            className={googleActionClassName}
          >
            <GoogleGMark className="h-4.5 w-4.5" />
            Connect Google Calendar
          </a>
        </div>
      ) : null}

      {payload?.configured && connection && draft ? (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white px-3 py-2">
            <div>
              <p className="text-sm font-semibold text-slate-800">{label}</p>
              {connection.pendingOrFailedCount > 0 ? (
                <p className="mt-0.5 text-xs text-slate-500">
                  {connection.pendingOrFailedCount} change{connection.pendingOrFailedCount === 1 ? "" : "s"} pending or needing attention.
                </p>
              ) : null}
            </div>
            {connection.status === "reconnect_required" ? (
              <a href="/api/google-calendar/connect" className={`${googleActionClassName} min-h-9 px-3 text-xs`}>
                <GoogleGMark className="h-4 w-4" /> Reconnect Google Calendar
              </a>
            ) : null}
          </div>

          <fieldset disabled={busy !== null} className="space-y-2">
            <legend className="text-sm font-semibold text-slate-800">Sync to your generated Google calendar</legend>
            {[
              ["syncParenting", "Parenting schedule"],
              ["syncHandovers", "Handovers"],
              ["syncSharedEvents", "Shared events"],
              ["syncLocations", "Handover locations"],
              ["syncSharedNotes", "Shared notes and descriptions"],
            ].map(([key, text]) => (
              <label key={key} className="flex min-h-10 items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 text-sm text-slate-700">
                <span>{text}</span>
                <input
                  type="checkbox"
                  checked={draft[key as keyof Connection] as boolean}
                  onChange={() => toggle(key as "syncParenting" | "syncHandovers" | "syncSharedEvents" | "syncLocations" | "syncSharedNotes")}
                  className="h-4 w-4 rounded border-slate-300"
                />
              </label>
            ))}
          </fieldset>

          <label className="block">
            <span className="text-sm font-semibold text-slate-800">Parent labels in Google Calendar</span>
            <select
              value={draft.parentLabelMode}
              disabled={busy !== null}
              onChange={(event) =>
                setDraft({ ...draft, parentLabelMode: event.target.value as "names" | "neutral" })
              }
              className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"
            >
              <option value="names">Use parent names</option>
              <option value="neutral">Use neutral labels (Parent 1 / Parent 2)</option>
            </select>
          </label>

          <p className="text-xs leading-5 text-slate-500">
            Notes are off by default. Shared event descriptions and handover notes only leave the app when you enable them.
          </p>

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void save()} disabled={busy !== null} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
              {busy === "save" ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CalendarSync className="h-4 w-4" aria-hidden="true" />}
              Save sync settings
            </button>
            <button type="button" onClick={() => void syncNow()} disabled={busy !== null || connection.status === "reconnect_required"} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              {busy === "sync" ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
              Sync now
            </button>
            <button type="button" onClick={() => setDisconnecting(true)} disabled={busy !== null} className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50">
              <Unplug className="h-4 w-4" aria-hidden="true" />
              Disconnect
            </button>
          </div>

          {disconnecting ? (
            <div className="rounded-xl border border-rose-200 bg-white p-3" role="group" aria-label="Disconnect Google Calendar">
              <p className="text-sm font-semibold text-slate-900">What should happen to the generated Google calendar?</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Leaving it in place keeps its existing events in Google. Removing it deletes that app-created Google calendar.
              </p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <button type="button" disabled={busy !== null} onClick={() => void disconnect(false)} className="min-h-11 rounded-xl border border-slate-300 px-3 text-sm font-semibold text-slate-700">
                  Leave calendar in Google
                </button>
                <button type="button" disabled={busy !== null} onClick={() => void disconnect(true)} className="min-h-11 rounded-xl bg-rose-600 px-3 text-sm font-semibold text-white">
                  Remove generated calendar
                </button>
                <button type="button" disabled={busy !== null} onClick={() => setDisconnecting(false)} className="min-h-11 rounded-xl px-3 text-sm font-semibold text-slate-500">
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
