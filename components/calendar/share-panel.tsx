"use client";

import { Check, Copy, Eye, Link2, LoaderCircle, Share2, Trash2, X } from "lucide-react";
import { useState } from "react";

type ShareStatus = {
  enabled: boolean;
  tokenCreatedAt?: string | null;
  lastUsedAt?: string | null;
};

export function SharePanel() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<ShareStatus | null>(null);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function openPanel() {
    setOpen(true);
    if (status) return;

    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/share", { cache: "no-store" });
      const body = (await response.json().catch(() => null)) as ShareStatus | { error?: string } | null;
      if (!response.ok || !body || !("enabled" in body)) {
        throw new Error(body && "error" in body && body.error ? body.error : "Sharing could not be loaded.");
      }
      setStatus(body);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sharing could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  async function generateLink() {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/share", { method: "POST" });
      const body = (await response.json().catch(() => null)) as
        | { enabled: boolean; viewerUrl: string }
        | { error?: string }
        | null;
      if (!response.ok || !body || !("viewerUrl" in body)) {
        throw new Error(body && "error" in body && body.error ? body.error : "A viewer link could not be created.");
      }
      setViewerUrl(body.viewerUrl);
      setStatus({ enabled: true, tokenCreatedAt: new Date().toISOString(), lastUsedAt: null });
      setMessage("New viewer link created. Any previous viewer link is now invalid.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "A viewer link could not be created.");
    } finally {
      setLoading(false);
    }
  }

  async function revokeLink() {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/share", { method: "DELETE" });
      const body = (await response.json().catch(() => null)) as { enabled?: boolean; error?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? "The viewer link could not be revoked.");
      setViewerUrl(null);
      setStatus({ enabled: false, tokenCreatedAt: null, lastUsedAt: null });
      setMessage("Viewer access has been revoked.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The viewer link could not be revoked.");
    } finally {
      setLoading(false);
    }
  }

  async function copyViewerLink() {
    if (!viewerUrl) return;
    await navigator.clipboard.writeText(viewerUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

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
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/35 p-0 backdrop-blur-sm sm:items-center sm:p-6">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="share-title"
            className="w-full max-w-lg rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                  <Eye className="h-5 w-5" aria-hidden="true" />
                </div>
                <h2 id="share-title" className="text-xl font-semibold text-slate-900">
                  Read-only sharing
                </h2>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  Anyone with the viewer link can see the schedule and shared events, but cannot edit them.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close sharing panel"
                onClick={() => setOpen(false)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              {loading && !status ? (
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Checking sharing status…
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${status?.enabled ? "bg-emerald-500" : "bg-slate-300"}`} />
                    <p className="font-semibold text-slate-900">
                      {status?.enabled ? "Viewer sharing is on" : "Viewer sharing is off"}
                    </p>
                  </div>
                  {status?.enabled && !viewerUrl ? (
                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      For security, the existing link cannot be displayed again. Generate a new link to copy it; the old one will immediately stop working.
                    </p>
                  ) : null}
                </>
              )}
            </div>

            {viewerUrl ? (
              <div className="mt-4 rounded-2xl border border-slate-200 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Viewer link</p>
                <p className="mt-2 break-all rounded-xl bg-slate-50 p-3 font-mono text-xs leading-5 text-slate-600">
                  {viewerUrl}
                </p>
                <button
                  type="button"
                  onClick={() => void copyViewerLink()}
                  className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl bg-slate-900 px-3 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? "Copied" : "Copy link"}
                </button>
              </div>
            ) : null}

            {message ? (
              <p className="mt-4 rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-700">{message}</p>
            ) : null}

            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                disabled={loading}
                onClick={() => void generateLink()}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                {status?.enabled ? "Generate new link" : "Create viewer link"}
              </button>
              <button
                type="button"
                disabled={loading || !status?.enabled}
                onClick={() => void revokeLink()}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Revoke viewer access
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
