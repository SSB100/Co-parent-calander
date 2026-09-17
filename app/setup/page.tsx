"use client";

import { Check, Copy, UsersRound } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

type SetupResult = {
  calendarName: string;
  parentOne: { name: string; editorUrl: string };
  parentTwo: { name: string; editorUrl: string };
};

export default function SetupPage() {
  const [calendarName, setCalendarName] = useState("Our Family Calendar");
  const [parentOneName, setParentOneName] = useState("");
  const [parentTwoName, setParentTwoName] = useState("");
  const [childrenText, setChildrenText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SetupResult | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function submitSetup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    const children = childrenText
      .split("\n")
      .map((value) => value.trim())
      .filter(Boolean);

    try {
      const response = await fetch("/api/setup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ calendarName, parentOneName, parentTwoName, children }),
      });
      const body = (await response.json().catch(() => null)) as
        | SetupResult
        | { error?: string }
        | null;

      if (!response.ok || !body || !("parentOne" in body)) {
        throw new Error(
          body && "error" in body && body.error
            ? body.error
            : "Setup could not be completed.",
        );
      }

      setResult(body);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Setup could not be completed.");
    } finally {
      setSaving(false);
    }
  }

  async function copyLink(label: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    window.setTimeout(() => setCopied(null), 1800);
  }

  if (result) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-4 py-10 sm:px-6">
        <section className="w-full rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
          <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
            <Check className="h-6 w-6" aria-hidden="true" />
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Setup complete</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
            {result.calendarName} is ready
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
            Save each private editor link somewhere secure. The links below are shown now so they can be shared directly with the correct parent.
          </p>

          <div className="mt-7 space-y-3">
            {[result.parentOne, result.parentTwo].map((parent, index) => {
              const label = `parent-${index + 1}`;
              return (
                <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Parent {index + 1} editor link
                      </p>
                      <p className="mt-1 font-semibold text-slate-900">{parent.name}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void copyLink(label, parent.editorUrl)}
                      className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-100"
                    >
                      {copied === label ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      {copied === label ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <p className="break-all rounded-xl bg-white p-3 font-mono text-xs leading-5 text-slate-500 ring-1 ring-slate-200">
                    {parent.editorUrl}
                  </p>
                </div>
              );
            })}
          </div>

          <Link
            href="/"
            className="mt-7 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-slate-900 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 sm:w-auto"
          >
            Open shared calendar
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-4 py-10 sm:px-6">
      <section className="w-full rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
        <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
          <UsersRound className="h-6 w-6" aria-hidden="true" />
        </div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">First-time setup</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
          Set up your shared calendar
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
          Keep this simple. Add the family calendar name, the two parent display names and each child who will use the schedule.
        </p>

        <form onSubmit={submitSetup} className="mt-8 space-y-6">
          <label className="block">
            <span className="text-sm font-semibold text-slate-800">Calendar name</span>
            <input
              value={calendarName}
              onChange={(event) => setCalendarName(event.target.value)}
              maxLength={80}
              required
              className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-semibold text-slate-800">Parent 1 name</span>
              <input
                value={parentOneName}
                onChange={(event) => setParentOneName(event.target.value)}
                maxLength={50}
                placeholder="e.g. Alex"
                required
                className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-slate-800">Parent 2 name</span>
              <input
                value={parentTwoName}
                onChange={(event) => setParentTwoName(event.target.value)}
                maxLength={50}
                placeholder="e.g. Jordan"
                required
                className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-sm font-semibold text-slate-800">Children</span>
            <span className="ml-2 text-xs text-slate-500">one name per line</span>
            <textarea
              value={childrenText}
              onChange={(event) => setChildrenText(event.target.value)}
              rows={4}
              placeholder={"Child 1\nChild 2"}
              required
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            />
          </label>

          {error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={saving}
            className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-slate-900 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60 sm:w-auto"
          >
            {saving ? "Creating calendar…" : "Finish setup"}
          </button>
        </form>
      </section>
    </main>
  );
}
