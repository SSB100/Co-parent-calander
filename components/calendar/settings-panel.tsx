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
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [open]);

  async function openPanel() {
    setOpen(true);
    setLoading(true);
    setMessage(null);
    setMessageKind("error");
    try {
      const response = await fetch("/api/settings", { cache: "no-store" });
      const body = (await response.json().catch(() => null)) as SettingsPayload | { error?: string } | null;
      if (!response.ok || !body || !("calendar" in body)) {
        throw new Error(body && "error" in body ? body.error : "Settings could not be loaded.");
      }
      setData(body);
    } catch (error) {
      setData(null);
      setMessageKind("error");
      setMessage(error instanceof Error ? error.message : "Settings could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (!data || saving || readOnly) return;
    setSaving(true);
    setMessage(null);
    setMessageKind("error");
    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          calendarName: data.calendar.name,
          parents: data.parents,
          children: data.children,
        }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? "Settings could not be saved.");
      setMessageKind("success");
      setMessage("Settings saved.");
      onChanged?.();
    } catch (error) {
      setMessageKind("error");
      setMessage(error instanceof Error ? error.message : "Settings could not be saved.");
    } finally {
      setSaving(false);
    }
  }

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
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/35 backdrop-blur-sm sm:items-center sm:p-6">
          <section
            ref={dialogRef}
            className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-6"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
            aria-describedby="settings-description"
            aria-busy={loading || saving}
            tabIndex={-1}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                  <Settings2 className="h-5 w-5" aria-hidden="true" />
                </div>
                <h2 id="settings-title" className="text-xl font-semibold text-slate-900">Calendar settings</h2>
                <p id="settings-description" className="mt-1 text-sm text-slate-500">
                  {readOnly
                    ? "Review shared calendar details and manage your own optional integrations."
                    : "Keep shared calendar details up to date and manage your own optional integrations."}
                </p>
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                aria-label="Close settings"
                disabled={loading || saving}
                onClick={() => setOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            {loading ? (
              <div role="status" aria-live="polite" className="mt-6 flex items-center gap-2 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
                <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                Loading settings…
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

            {!loading && data ? (
              <div className="mt-6 space-y-5">
                <label className="block">
                  <span className="text-sm font-semibold text-slate-800">Calendar name</span>
                  <input
                    value={data.calendar.name}
                    disabled={saving || readOnly}
                    onChange={(event) => setData({ ...data, calendar: { ...data.calendar, name: event.target.value } })}
                    className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:ring-2 focus:ring-slate-200 disabled:bg-slate-50 disabled:opacity-70"
                  />
                </label>

                <div>
                  <p className="text-sm font-semibold text-slate-800">Parents</p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {data.parents.map((parent, index) => (
                      <div key={parent.id} className="rounded-xl border border-slate-200 bg-white p-3">
                        <input
                          value={parent.displayName}
                          disabled={saving || readOnly}
                          aria-label={`Parent ${index + 1} name`}
                          onChange={(event) =>
                            setData({
                              ...data,
                              parents: data.parents.map((item) =>
                                item.id === parent.id ? { ...item, displayName: event.target.value } : item,
                              ),
                            })
                          }
                          className="min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:ring-2 focus:ring-slate-200 disabled:bg-slate-50 disabled:opacity-70"
                        />
                        <fieldset className="mt-3" disabled={saving || readOnly}>
                          <legend className="text-xs font-semibold text-slate-600">Calendar colour</legend>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {parentColorOptions.map((option) => {
                              const taken = data.parents.some(
                                (item) => item.id !== parent.id && item.colorKey === option.key,
                              );
                              return (
                                <button
                                  key={option.key}
                                  type="button"
                                  aria-label={`${option.label} for ${parent.displayName}`}
                                  aria-pressed={parent.colorKey === option.key}
                                  disabled={saving || readOnly || taken}
                                  title={taken ? `${option.label} is already used by the other parent` : option.label}
                                  onClick={() =>
                                    setData({
                                      ...data,
                                      parents: data.parents.map((item) =>
                                        item.id === parent.id ? { ...item, colorKey: option.key } : item,
                                      ),
                                    })
                                  }
                                  className={`h-8 w-8 rounded-full border-2 transition ${parent.colorKey === option.key ? "border-slate-950 ring-2 ring-slate-300 ring-offset-1" : "border-white"} disabled:cursor-not-allowed disabled:opacity-25`}
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
                  <div className="mt-2 space-y-2">
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
                              item.id === child.id ? { ...item, displayName: event.target.value } : item,
                            ),
                          })
                        }
                        className="min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:ring-2 focus:ring-slate-200 disabled:bg-slate-50 disabled:opacity-70"
                      />
                    ))}
                  </div>
                </div>

                <div className="rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-500">
                  Calendar timezone: {data.calendar.timezone}
                </div>

                <GoogleCalendarSettings />

                {!readOnly ? (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void save()}
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                  >
                    {saving ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Settings2 className="h-4 w-4" aria-hidden="true" />
                    )}
                    Save settings
                  </button>
                ) : null}
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
    </>
  );
}
