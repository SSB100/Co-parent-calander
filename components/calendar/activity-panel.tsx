"use client";

import { History, LoaderCircle, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type ActivityItem = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  occurredAt: string;
  actorName: string | null;
};

const focusableSelector = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

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
    "child_profile.update": "updated a child profile",
    "child_activity.create": "added a child activity",
    "child_activity.update": "updated a child activity",
    "child_activity.delete": "removed a child activity",
    "child_profile.photo_update": "updated a child profile photo",
    "child_profile.photo_remove": "removed a child profile photo",
    "child_profile.document_add": "added a child document",
    "child_profile.document_remove": "removed a child document",
    "attachment.upload": "added a private document",
    "attachment.delete": "removed a private document",
    "link.create": "linked related Covie items",
    "link.delete": "unlinked related Covie items",
    "share.viewer_link_generated": "generated a viewer link",
    "share.viewer_link_revoked": "revoked viewer access",
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
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const loadingRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      const dialog = dialogRef.current;
      if (!dialog) return;

      if (event.key === "Escape") {
        if (!loadingRef.current) {
          event.preventDefault();
          setOpen(false);
        }
        return;
      }

      if (event.key !== "Tab") return;

      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector)).filter(
        (element) => element.getClientRects().length > 0,
      );
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeElement = document.activeElement;

      if (event.shiftKey && (activeElement === first || !dialog.contains(activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return (
    <>
      <button
        type="button"
        aria-label="Activity"
        onClick={() => void openPanel()}
        className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
      >
        <History className="h-4 w-4" aria-hidden="true" />
        <span>Activity</span>
      </button>

      {open ? (
        <div className="covie-dialog-backdrop">
          <section
            ref={dialogRef}
            className="covie-dialog covie-dialog-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="activity-title"
            aria-describedby="activity-description"
            aria-busy={loading}
            tabIndex={-1}
          >
            <header className="covie-dialog-header">
              <div className="covie-dialog-heading">
                <div className="covie-dialog-icon sunshine">
                  <History aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <h2 id="activity-title" className="covie-dialog-title">
                    Recent activity
                  </h2>
                  <p id="activity-description" className="covie-dialog-description">
                    Important changes to this shared calendar, newest first.
                  </p>
                </div>
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                aria-label="Close activity"
                disabled={loading}
                onClick={() => setOpen(false)}
                className="covie-dialog-close"
              >
                <X aria-hidden="true" />
              </button>
            </header>

            <div className="covie-dialog-body">
              {loading ? (
                <div
                  role="status"
                  aria-live="polite"
                  className="covie-dialog-status flex items-center gap-2"
                >
                  <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Loading activity…
                </div>
              ) : null}

              {message ? (
                <p role="alert" className="covie-dialog-status">
                  {message}
                </p>
              ) : null}

              {!loading ? (
                <div className="space-y-2">
                  {items.length === 0 ? (
                    <p className="covie-dialog-status">No activity recorded yet.</p>
                  ) : null}
                  {items.map((item, index) => (
                    <div
                      key={item.id}
                      className="flex gap-3 rounded-xl border border-slate-200 bg-white p-3"
                    >
                      <span
                        className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
                          index % 3 === 0
                            ? "bg-[#FF6B5F]"
                            : index % 3 === 1
                              ? "bg-[#19A897]"
                              : "bg-[#765ED6]"
                        }`}
                        aria-hidden="true"
                      />
                      <div className="min-w-0">
                        <p className="text-sm text-slate-800">
                          <span className="font-semibold">{item.actorName || "Calendar"}</span>{" "}
                          {describe(item.action)}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">{when(item.occurredAt)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
