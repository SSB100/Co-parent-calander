"use client";

import { Check, Copy, Eye, Link2, LoaderCircle, Share2, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type ShareStatus = {
  enabled: boolean;
  tokenCreatedAt?: string | null;
  lastUsedAt?: string | null;
};

const focusableSelector = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function SharePanel() {
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const loadingRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<ShareStatus | null>(null);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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
        onClick={() => void openPanel()}
        className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
      >
        <Share2 className="h-4 w-4" aria-hidden="true" />
        <span>Share</span>
      </button>

      {open ? (
        <div className="covie-dialog-backdrop">
          <section
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="share-title"
            aria-describedby="share-description"
            aria-busy={loading}
            tabIndex={-1}
            className="covie-dialog covie-dialog-sm covie-dialog-fit"
          >
            <header className="covie-dialog-header">
              <div className="covie-dialog-heading">
                <div className="covie-dialog-icon violet">
                  <Eye aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <h2 id="share-title" className="covie-dialog-title">
                    Read-only sharing
                  </h2>
                  <p id="share-description" className="covie-dialog-description">
                    Share a private viewer link without giving editing access.
                  </p>
                </div>
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                aria-label="Close sharing panel"
                disabled={loading}
                onClick={() => setOpen(false)}
                className="covie-dialog-close"
              >
                <X aria-hidden="true" />
              </button>
            </header>

            <div className="covie-dialog-body">
              <div className="covie-dialog-section covie-dialog-section-tint">
                {loading && !status ? (
                  <div
                    role="status"
                    aria-live="polite"
                    className="flex items-center gap-2 text-sm text-slate-600"
                  >
                    <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Checking sharing status…
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${
                          status?.enabled ? "bg-[#19A897]" : "bg-slate-300"
                        }`}
                        aria-hidden="true"
                      />
                      <p className="font-semibold text-slate-900">
                        {status?.enabled ? "Viewer sharing is on" : "Viewer sharing is off"}
                      </p>
                    </div>
                    {status?.enabled && !viewerUrl ? (
                      <p className="mt-2 text-sm leading-6 text-slate-500">
                        The current link is hidden for security. Generate a new one if you need to copy it again.
                      </p>
                    ) : null}
                  </>
                )}
              </div>

              {viewerUrl ? (
                <div className="covie-dialog-section mt-3">
                  <p className="text-xs font-semibold text-slate-500">Viewer link</p>
                  <p className="mt-2 break-all rounded-xl bg-slate-50 p-3 font-mono text-xs leading-5 text-slate-600">
                    {viewerUrl}
                  </p>
                  <button
                    type="button"
                    onClick={() => void copyViewerLink()}
                    className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700"
                  >
                    {copied ? (
                      <Check className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Copy className="h-4 w-4" aria-hidden="true" />
                    )}
                    <span aria-live="polite">{copied ? "Copied" : "Copy link"}</span>
                  </button>
                </div>
              ) : null}

              {message ? (
                <p role="status" aria-live="polite" className="covie-dialog-status mt-3">
                  {message}
                </p>
              ) : null}
            </div>

            <footer className="covie-dialog-footer">
              <button
                type="button"
                disabled={loading || !status?.enabled}
                onClick={() => void revokeLink()}
                className="covie-dialog-danger"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Revoke access
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => void generateLink()}
                className="covie-dialog-primary"
              >
                {loading ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Link2 className="h-4 w-4" aria-hidden="true" />
                )}
                {status?.enabled ? "Generate new link" : "Create viewer link"}
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </>
  );
}
