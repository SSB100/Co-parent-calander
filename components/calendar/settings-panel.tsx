"use client";

import { LoaderCircle, Settings2, X } from "lucide-react";
import { GoogleCalendarSettings } from "@/components/calendar/google-calendar-settings";
import { useEffect, useRef, useState } from "react";
import { parentColorOptions, type ParentColorKey } from "@/lib/parents/identity";

type NamedItem = { id: string; displayName: string };
type ParentItem = NamedItem & { colorKey: ParentColorKey };
type SettingsPayload = {
  calendar: { id: string; name: string; timezone: string };
  parents: ParentItem[];
  children: NamedItem[];
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

export function SettingsPanel({ readOnly = false, onChanged }: { readOnly?: boolean; onChanged?: () => void }) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const busyRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<SettingsPayload | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [messageKind, setMessageKind] = useState<MessageKind>("error");

  useEffect(() => {
    busyRef.current = loading || saving;
  }, [loading, saving]);

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
    return (
    <>
      <button
        type="button"
        aria-label="Settings"
        onClick={() => void openPanel()}
        className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
      >
        <Settings2 className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">Settings</span>
      </button>

      {open ? (
        <div className="covie-dialog-backdrop">
          <section
            ref={dialogRef}
            className="covie-dialog covie-dialog-md covie-dialog-fit"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
            aria-describedby="settings-description"
            aria-busy={loading || saving}
            tabIndex={-1}
          >
            <header className="covie-dialog-header">
              <div className="covie-dialog-heading">
                <div className="covie-dialog-icon teal">
                  <Settings2 aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <h2 id="settings-title" className="covie-dialog-title">
                    Calendar settings
                  </h2>
                  <p id="settings-description" className="covie-dialog-description">
                    {readOnly
                      ? "Review shared calendar details and your optional integrations."
                      : "Update names, colours and shared calendar details."}
                  </p>
                </div>
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                aria-label="Close settings"
                disabled={loading || saving}
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
                  Loading settings…
                </div>
              ) : null}

              {message ? (
                <p
                  role={messageKind === "error" ? "alert" : "status"}
                  aria-live={messageKind === "error" ? "assertive" : "polite"}
                  className={`rounded-xl border px-3 py-2 text-sm ${
                    messageKind === "error"
                      ? "border-rose-200 bg-rose-50 text-rose-700"
                      : "border-[#19A897] bg-[#EAF8F5] text-[#0B665C]"
                  }`}
                >
                  {message}
                </p>
              ) : null}

              {!loading && data ? (
                <div className="space-y-4">
                  <label className="block">
                    <span className="text-sm font-semibold text-slate-800">Calendar name</span>
                    <input
                      value={data.calendar.name}
                      disabled={saving || readOnly}
                      onChange={(event) =>
                        setData({
                          ...data,
                          calendar: { ...data.calendar, name: event.target.value },
                        })
                      }
                      className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:ring-2 focus:ring-slate-200 disabled:bg-slate-50 disabled:opacity-70"
                    />
                  </label>

                  <div>
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-800">Parents</p>
                      <span className="text-xs text-slate-500">Names & calendar colours</span>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {data.parents.map((parent, index) => (
                        <div
                          key={parent.id}
                          className={`rounded-xl border p-3 ${
                            index === 0
                              ? "border-[#19A897] bg-[#EAF8F5]"
                              : "border-[#765ED6] bg-[#F4F1FF]"
                          }`}
                        >
                          <input
                            value={parent.displayName}
                            disabled={saving || readOnly}
                            aria-label={`Parent ${index + 1} name`}
                            onChange={(event) =>
                              setData({
                                ...data,
                                parents: data.parents.map((item) =>
                                  item.id === parent.id
                                    ? { ...item, displayName: event.target.value }
                                    : item,
                                ),
                              })
                            }
                            className="min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-200 disabled:bg-slate-50 disabled:opacity-70"
                          />
                          <fieldset className="mt-2" disabled={saving || readOnly}>
                            <legend className="text-[11px] font-semibold text-slate-600">
                              Calendar colour
                            </legend>
                            <div className="mt-1.5 flex flex-wrap gap-2">
                              {parentColorOptions.map((option) => {
                                const taken = data.parents.some(
                                  (item) =>
                                    item.id !== parent.id && item.colorKey === option.key,
                                );
                                return (
                                  <button
                                    key={option.key}
                                    type="button"
                                    aria-label={`${option.label} for ${parent.displayName}`}
                                    aria-pressed={parent.colorKey === option.key}
                                    disabled={saving || readOnly || taken}
                                    title={
                                      taken
                                        ? `${option.label} is already used by the other parent`
                                        : option.label
                                    }
                                    onClick={() =>
                                      setData({
                                        ...data,
                                        parents: data.parents.map((item) =>
                                          item.id === parent.id
                                            ? { ...item, colorKey: option.key }
                                            : item,
                                        ),
                                      })
                                    }
                                    className={`h-7 w-7 rounded-full border-2 transition ${
                                      parent.colorKey === option.key
                                        ? "border-slate-950 ring-2 ring-slate-300 ring-offset-1"
                                        : "border-white"
                                    } disabled:cursor-not-allowed disabled:opacity-25`}
                                    style={{ backgroundColor: option.hex }}
                                  />
                                );
                              })}
                            </div>
                          </fieldset>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-sm font-semibold text-slate-800">Children</p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {data.children.map((child, index) => (
                        <input
                          key={child.id}
                          value={child.displayName}
                          disabled={saving || readOnly}
                          aria-label={`Child ${index + 1} name`}
                          onChange={(event) =>
                            setData({
                              ...data,
                              children: data.children.map((item) =>
                                item.id === child.id
                                  ? { ...item, displayName: event.target.value }
                                  : item,
                              ),
                            })
                          }
                          className="min-h-10 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:ring-2 focus:ring-slate-200 disabled:bg-slate-50 disabled:opacity-70"
                        />
                      ))}
                    </div>
                  </div>

                  <div className="covie-dialog-status">
                    Calendar timezone: {data.calendar.timezone}
                  </div>

                  <details className="rounded-xl border border-slate-200 bg-slate-50">
                    <summary className="flex min-h-11 cursor-pointer items-center justify-between px-3 text-sm font-semibold text-slate-800">
                      Google Calendar
                      <span className="text-xs font-medium text-slate-500">Optional sync</span>
                    </summary>
                    <div className="border-t border-slate-200 bg-white p-3">
                      <GoogleCalendarSettings />
                    </div>
                  </details>
                </div>
              ) : null}
            </div>

            {!readOnly ? (
              <footer className="covie-dialog-footer">
                <button
                  type="button"
                  disabled={saving || loading || !data}
                  onClick={() => void save()}
                  className="covie-dialog-primary"
                >
                  {saving ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Settings2 className="h-4 w-4" aria-hidden="true" />
                  )}
                  Save settings
                </button>
              </footer>
            ) : null}
          </section>
        </div>
      ) : null}
    </>
  );
}
