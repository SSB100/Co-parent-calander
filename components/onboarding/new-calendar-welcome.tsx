"use client";

import { Check, Copy, Link2, UsersRound } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

export function NewCalendarWelcome({ inviteCode }: { inviteCode: string }) {
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const shareLink = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/auth/sign-up?invite=${encodeURIComponent(inviteCode)}`;
  }, [inviteCode]);

  async function copy(value: string, type: "code" | "link") {
    if (!value || !navigator.clipboard) return;
    await navigator.clipboard.writeText(value);
    setCopied(type);
    window.setTimeout(() => setCopied(null), 1800);
  }

  return (
    <section className="mx-auto mt-4 w-full max-w-7xl px-3 sm:px-6 lg:px-8">
      <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
              <UsersRound className="h-4 w-4" aria-hidden="true" /> Your calendar is ready
            </div>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
              Invite your co-parent when you&apos;re ready
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              You can use Covie on your own right away. Share this private code or link whenever you want the other parent to join.
            </p>
          </div>

          <div className="w-full max-w-md rounded-2xl border border-emerald-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Private invite code</p>
            <div className="mt-2 flex items-center justify-between gap-3">
              <code className="text-lg font-semibold tracking-[0.12em] text-slate-950">{inviteCode}</code>
              <button
                type="button"
                onClick={() => void copy(inviteCode, "code")}
                className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                {copied === "code" ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
                {copied === "code" ? "Copied" : "Copy code"}
              </button>
            </div>

            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => void copy(shareLink, "link")}
                className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-900"
              >
                {copied === "link" ? <Check className="h-4 w-4" aria-hidden="true" /> : <Link2 className="h-4 w-4" aria-hidden="true" />}
                {copied === "link" ? "Link copied" : "Copy invite link"}
              </button>
              <Link
                href="/calendar"
                className="inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-950"
              >
                Maybe later
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
