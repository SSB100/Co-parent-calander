"use client";

import { formatDistanceToNow } from "date-fns";
import { LoaderCircle, Undo2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type UndoStatus =
  | { available: false }
  | {
      available: true;
      auditId: string;
      action: "assignment.bulk_set" | "assignment.bulk_clear";
      occurredAt: string;
      dateCount: number;
    };

type MessageKind = "success" | "error";

const focusableSelector = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function UndoBulkButton({ onChanged }: { onChanged?: () => void }) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const busyRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [status, setStatus] = useState<UndoStatus | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [messageKind, setMessageKind] = useState<MessageKind>("error");

  useEffect(() => {
    busyRef.current = loading || undoing;
  }, [loading, undoing]);

  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    window.requestAnimationFrame(() => {
      if (closeButtonRef.current && !closeButtonRef.current.disabled) closeButtonRef.current.focus();
      else dialogRef.current?.focus();
    });

    function handleKeyDown(event: KeyboardEvent) {
      const dialog = dialogRef.current;
      if (!dialog) return;

      if (event.key === "Escape") {
        if (!busyRef.current) {
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
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [open]);

  async function checkUndo() {
    setOpen(true);
    setLoading(true);
    setMessage(null);
    setMessageKind("error");
    setStatus(null);

    try {
      const response = await fetch("/api/assignments/undo", { cache: "no-store" });
      const body = (await response.json().catch(() => null)) as UndoStatus | { error?: string } | null;
      if (!response.ok || !body || !("available" in body)) {
        throw new Error(body && "error" in body ? body.error : "Undo status could not be checked.");
      }
      setStatus(body);
    } catch (error) {
      setMessageKind("error");
      setMessage(error instanceof Error ? error.message : "Undo status could not be checked.");
    } finally {
      setLoading(false);
    }
  }

  async function undoLatest() {
    if (undoing || !status?.available) return;
    setUndoing(true);
    setMessage(null);
    setMessageKind("error");

    try {
      const response = await fetch("/api/assignments/undo", { method: "POST" });
      const body = (await response.json().catch(() => null)) as
        | { ok?: boolean; dateCount?: number; error?: string }
        | null;
      if (!response.ok) {
        throw new Error(body?.error ?? "The bulk change could not be undone.");
      }

      setStatus({ available: false });
      setMessageKind("success");
      setMessage(
        `${body?.dateCount ?? status.dateCount} ${(body?.dateCount ?? status.dateCount) === 1 ? "day" : "days"} restored to the previous schedule.`,
      );
      onChanged?.();
    } catch (error) {
      setMessageKind("error");
      setMessage(error instanceof Error ? error.message : "The bulk change could not be undone.");
    } finally {
      setUndoing(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void checkUndo()}
        className="covie-action-sunshine inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm transition"
      >
        <Undo2 className="h-4 w-4" aria-hidden="true" />
        Undo bulk
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#243139]/35 p-0 backdrop-blur-sm sm:items-center sm:p-6">
          <section
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="undo-title"
            aria-describedby="undo-description"
            aria-busy={loading || undoing}
            tabIndex={-1}
            className="w-full max-w-md rounded-t-3xl border-2 border-[#243139] bg-white p-5 shadow-[7px_7px_0_#F4C64E] sm:rounded-3xl sm:p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                  <Undo2 className="h-5 w-5" aria-hidden="true" />
                </div>
                <h2 id="undo-title" className="text-xl font-semibold text-slate-900">
                  Undo last bulk change
                </h2>
                <p id="undo-description" className="mt-1 text-sm leading-6 text-slate-500">
                  Undo is only available when the most recent schedule change was a bulk or date-range assignment.
                </p>
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                aria-label="Close undo panel"
                disabled={loading || undoing}
                onClick={() => setOpen(false)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            {loading ? (
              <div
                role="status"
                aria-live="polite"
                className="mt-6 flex items-center gap-2 rounded-2xl bg-slate-50 px-4 py-5 text-sm text-slate-600"
              >
                <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                Checking the last schedule change…
              </div>
            ) : status?.available ? (
              <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="font-semibold text-slate-900">
                  {status.action === "assignment.bulk_clear" ? "Cleared" : "Assigned"} {status.dateCount}{" "}
                  {status.dateCount === 1 ? "day" : "days"}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {formatDistanceToNow(new Date(status.occurredAt), { addSuffix: true })}
                </p>
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  This will restore those dates to exactly how they were before that bulk change, including handover details and notes.
                </p>
              </div>
            ) : status ? (
              <div className="mt-6 rounded-2xl bg-slate-50 px-4 py-5 text-sm leading-6 text-slate-600">
                There is no recent bulk change that can be safely undone. A newer single-day edit also makes an older bulk change unavailable, so newer work is never overwritten.
              </div>
            ) : null}

            {message ? (
              <p
                role={messageKind === "error" ? "alert" : "status"}
                aria-live={messageKind === "error" ? "assertive" : "polite"}
                className={`mt-4 rounded-xl px-4 py-3 text-sm ${
                  messageKind === "error"
                    ? "bg-rose-50 text-rose-700"
                    : "bg-emerald-50 text-emerald-800"
                }`}
              >
                {message}
              </p>
            ) : null}

            {status?.available ? (
              <button
                type="button"
                disabled={undoing}
                onClick={() => void undoLatest()}
                className="covie-action-sunshine mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm disabled:opacity-50"
              >
                {undoing ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Undo2 className="h-4 w-4" aria-hidden="true" />
                )}
                Undo this bulk change
              </button>
            ) : null}
          </section>
        </div>
      ) : null}
    </>
  );
}
