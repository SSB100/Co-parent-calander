"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import {
  signInWithEmail,
  signUpWithEmail,
  type AuthActionState,
} from "@/app/auth/actions";
import { CovieBrand } from "@/components/workspace/covie-brand";

const initialState: AuthActionState = { error: null };

export function CredentialsForm({
  mode,
  inviteCode = "",
}: {
  mode: "sign-in" | "sign-up";
  inviteCode?: string;
}) {
  const isSignUp = mode === "sign-up";
  const [state, action, pending] = useActionState(
    isSignUp ? signUpWithEmail : signInWithEmail,
    initialState,
  );
  const alternateHref = `${isSignUp ? "/auth/sign-in" : "/auth/sign-up"}${
    inviteCode ? `?invite=${encodeURIComponent(inviteCode)}` : ""
  }`;

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10 sm:px-6">
      <section className="w-full max-w-md rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm sm:p-8">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
          <CovieBrand />
        </Link>

        <h1 className="mt-8 text-3xl font-semibold tracking-tight text-slate-950">
          {isSignUp ? "Create your account" : "Welcome back"}
        </h1>
        <p className="mt-2 text-base leading-7 text-slate-600">
          {inviteCode
            ? "You have been invited to a Covie calendar. Continue with your account to join."
            : isSignUp
              ? "Create your account, then choose whether to start or join a Covie calendar."
              : "Log in to open your Covie calendar."}
        </p>

        <form action={action} className="mt-7 space-y-5">
          {inviteCode ? <input type="hidden" name="invite" value={inviteCode} /> : null}

          {isSignUp ? (
            <label className="block">
              <span className="text-sm font-semibold text-slate-800">Your name</span>
              <input
                name="name"
                autoComplete="name"
                maxLength={60}
                required
                className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-950 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              />
            </label>
          ) : null}

          <label className="block">
            <span className="text-sm font-semibold text-slate-800">Email</span>
            <input
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              maxLength={256}
              required
              className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-950 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            />
          </label>

          <label className="block">
            <span className="flex items-center justify-between gap-3 text-sm font-semibold text-slate-800">
              Password
              {!isSignUp ? (
                <Link href="/auth/forgot-password" className="font-medium text-slate-500 hover:text-slate-900">
                  Forgot password?
                </Link>
              ) : null}
            </span>
            <input
              name="password"
              type="password"
              autoComplete={isSignUp ? "new-password" : "current-password"}
              minLength={8}
              maxLength={128}
              required
              className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-950 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            />
            {isSignUp ? <span className="mt-2 block text-xs text-slate-500">At least 8 characters.</span> : null}
          </label>

          {state.error ? (
            <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              {state.error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={pending}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 text-sm font-semibold text-white transition hover:bg-emerald-900 disabled:cursor-wait disabled:opacity-60"
          >
            {pending ? (isSignUp ? "Creating account…" : "Logging in…") : isSignUp ? "Create account" : "Log in"}
            {!pending ? <ArrowRight className="h-4 w-4" aria-hidden="true" /> : null}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-600">
          {isSignUp ? "Already have an account?" : "New here?"}{" "}
          <Link
            href={alternateHref}
            className="font-semibold text-slate-950 underline decoration-slate-300 underline-offset-4"
          >
            {isSignUp ? "Log in" : "Create an account"}
          </Link>
        </p>
      </section>
    </main>
  );
}
