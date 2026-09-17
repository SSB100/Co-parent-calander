"use client";

import { History, LoaderCircle, X } from "lucide-react";
import { useState } from "react";

type ActivityItem = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  occurredAt: string;
  actorName: string | null;
};

function describe(action: string) {
  const labels: Record<string, string> = {
    "calendar.setup_completed": "completed first-time setup",
    "assignment.bulk_set": "updated calendar days",
    "assignment.bulk_clear": "cleared calendar days",
    "assignment.details_update": "updated day details",
    "assignment.single_clear": "cleared a day",
    "recurring_schedule.replace": "updated the repeating schedule",
    "recurring_schedule.disable": "turned off the repeating schedule",
    "event.create": "added a shared event",
    "event.update": "updated a shared event",
    "event.delete": "removed a shared event",
    "settings.update": "updated calendar settings",
    "share.viewer_create": "created a viewer link",
    "share.viewer_regenerate": "replaced the viewer link",
    "share.viewer_revoke": "revoked viewer access",
  };
  return labels[action] ?? action.replaceAll("_", " ").replaceAll(".", " · ");
}

function when(value: string) {
  return new Intl.DateTimeFormat("en-NZ", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function ActivityPanel() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  async function openPanel() {
    setOpen(true);
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/activity", { cache: "no-store" });
      const body = (await response.json().catch(() => null)) as { activity?: ActivityItem[]; error?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? "Activity could not be loaded.");
      setItems(body?.activity ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Activity could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button type="button" onClick={() => void openPanel()} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50">
        <History className="h-4 w-4" />
        <span className="hidden sm:inline">Activity</span>
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/35 backdrop-blur-sm sm:items-center sm:p-6">
          <section className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-6" role="dialog" aria-modal="true" aria-labelledby="activity-title">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700"><History className="h-5 w-5" /></div>
                <h2 id="activity-title" className="text-xl font-semibold text-slate-900">Recent activity</h2>
                <p className="mt-1 text-sm text-slate-500">A simple history of important changes made to this shared calendar.</p>
              </div>
              <button type="button" aria-label="Close activity" onClick={() => setOpen(false)} className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>
            {loading ? <div className="mt-6 flex items-center gap-2 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600"><LoaderCircle className="h-4 w-4 animate-spin" />Loading activity…</div> : null}
            {message ? <p className="mt-4 rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-700">{message}</p> : null}
            {!loading ? (
              <div className="mt-5 space-y-1">
                {items.length === 0 ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No activity recorded yet.</p> : null}
                {items.map((item) => (
                  <div key={item.id} className="flex gap-3 border-b border-slate-100 py-3 last:border-b-0">
                    <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-slate-300" />
                    <div className="min-w-0">
                      <p className="text-sm text-slate-800"><span className="font-semibold">{item.actorName || "Calendar"}</span> {describe(item.action)}</p>
                      <p className="mt-1 text-xs text-slate-400">{when(item.occurredAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
    </>
  );
}
