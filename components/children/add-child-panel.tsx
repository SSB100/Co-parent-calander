"use client";

import { LoaderCircle, Plus, UserRound, X } from "lucide-react";
import { useRef, useState } from "react";

export function AddChildPanel({
  onChanged,
  buttonLabel = "Add child",
}: {
  onChanged?: (child: { id: string; displayName: string }) => void;
  buttonLabel?: string;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openPanel() {
    setDisplayName("");
    setError(null);
    setOpen(true);
    window.requestAnimationFrame(() => closeRef.current?.focus());
  }

  async function save() {
    if (saving || !displayName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/children", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName }),
      });
      const body = (await response.json().catch(() => null)) as
        | { id?: string; displayName?: string; error?: string }
        | null;
      if (!response.ok || !body?.id || !body.displayName) {
        throw new Error(body?.error ?? "The child profile could not be added.");
      }
      const child = { id: body.id, displayName: body.displayName };
      setOpen(false);
      onChanged?.(child);
      window.dispatchEvent(new Event("covie-records-updated"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The child profile could not be added.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openPanel}
        className="covie-primary-action inline-flex min-h-11 items-center gap-2 rounded-[10px] px-4 text-sm"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        {buttonLabel}
      </button>

      {open ? (
        <div className="covie-dialog-backdrop">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-child-title"
            className="covie-dialog covie-dialog-sm covie-dialog-fit"
          >
            <header className="covie-dialog-header">
              <div className="covie-dialog-heading">
                <div className="covie-dialog-icon violet">
                  <UserRound aria-hidden="true" />
                </div>
                <div>
                  <h2 id="add-child-title" className="covie-dialog-title">
                    Add child
                  </h2>
                  <p className="covie-dialog-description">
                    Start with their preferred name. You can add school, health and practical details later.
                  </p>
                </div>
              </div>
              <button
                ref={closeRef}
                type="button"
                aria-label="Close add child"
                disabled={saving}
                onClick={() => setOpen(false)}
                className="covie-dialog-close"
              >
                <X aria-hidden="true" />
              </button>
            </header>

            <div className="covie-dialog-body">
              <label className="block">
                <span className="text-sm font-semibold text-slate-800">Preferred name</span>
                <input
                  autoFocus
                  value={displayName}
                  maxLength={50}
                  disabled={saving}
                  onChange={(event) => setDisplayName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void save();
                  }}
                  placeholder="e.g. Drake"
                  className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                />
              </label>
              {error ? (
                <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                  {error}
                </p>
              ) : null}
            </div>

            <footer className="covie-dialog-footer">
              <button
                type="button"
                disabled={saving || !displayName.trim()}
                onClick={() => void save()}
                className="covie-dialog-primary"
              >
                {saving ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
                {saving ? "Adding…" : "Add child"}
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </>
  );
}
