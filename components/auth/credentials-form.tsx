"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";
import {
  signInWithEmail,
  signUpWithEmail,
  type AuthActionState,
} from "@/app/auth/actions";
import { GoogleGMark, googleActionClassName } from "@/components/google/google-brand";
import { CovieBrand } from "@/components/workspace/covie-brand";
import { authClient } from "@/lib/auth/client";

const initialState: AuthActionState = { error: null };

export function CredentialsForm({
  mode,
  inviteCode = "",
  verificationNotice = false,
}: {
  mode: "sign-in" | "sign-up";
  inviteCode?: string;
  verificationNotice?: boolean;
}) {
  const isSignUp = mode === "sign-up";
  const [state, action, pending] = useActionState(
    isSignUp ? signUpWithEmail : signInWithEmail,
    initialState,
  );
  const [googlePending, setGooglePending] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const alternateHref = `${isSignUp ? "/auth/sign-in" : "/auth/sign-up"}${
    inviteCode ? `?invite=${encodeURIComponent(inviteCode)}` : ""
  }`;

  async function continueWithGoogle() {
    if (isSignUp && !termsAccepted) {
      setGoogleError(
        "Agree to the Terms & Conditions before creating your account.",
      );
      return;
    }

    setGooglePending(true);
    setGoogleError(null);

    const callbackPath = inviteCode
      ? `/onboarding?invite=${encodeURIComponent(inviteCode)}`
      : isSignUp
        ? "/onboarding"
        : "/";
    const callbackURL = new URL(callbackPath, window.location.origin).toString();

    try {
      const result = await authClient.signIn.social({
        provider: "google",
        callbackURL,
        disableRedirect: true,
      });
      if (result?.error) {
        throw new Error(result.error.message || "Google sign-in could not be started.");
      }

      const data = result?.data as { url?: string } | null | undefined;
      if (!data?.url) {
        throw new Error("Google sign-in did not return a redirect URL.");
      }

      window.location.assign(data.url);
    } catch (error) {
      setGoogleError(
        error instanceof Error ? error.message : "Google sign-in could not be started.",
      );
      setGooglePending(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#FFF9F2] px-4 py-10 sm:px-6">
      <section className="w-full max-w-md rounded-xl border-2 border-[#243139] bg-white p-6 shadow-[8px_8px_0_#19A897] sm:p-8">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
          <CovieBrand />
        </Link>

        <h1 className="covie-display mt-8 text-4xl font-semibold tracking-tight text-slate-950">
          {isSignUp ? "Create your account" : "Welcome back"}
        </h1>
        <p className="mt-2 text-base leading-7 text-slate-600">
          {inviteCode
            ? "You have been invited to a Covie calendar. Continue with your account to join."
            : isSignUp
              ? "Create your account and verify your email, then choose whether to start or join a Covie calendar."
              : "Log in to open your Covie calendar."}
        </p>

        {verificationNotice ? (
          <div
            role="status"
            className="mt-5 rounded-xl border border-[#9FD7CE] bg-[#E8F8F4] px-4 py-3 text-sm leading-6 text-[#243139]"
          >
            Check your email and complete verification, then sign in. If you
            already verified the address, you can continue below.
          </div>
        ) : null}

        {isSignUp ? (
          <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-[#D8CEC3] bg-[#FFF9F2] p-4">
            <input
              type="checkbox"
              checked={termsAccepted}
              onChange={(event) => setTermsAccepted(event.target.checked)}
              className="mt-1 h-4 w-4 flex-none accent-[#243139]"
            />
            <span className="text-sm leading-6 text-[#43535A]">
              I agree to the{" "}
              <Link
                href="/terms"
                className="font-bold text-[#243139] underline decoration-[#FF6B5F] decoration-2 underline-offset-3"
              >
                Terms & Conditions
              </Link>{" "}
              and have read the{" "}
              <Link
                href="/privacy"
                className="font-bold text-[#243139] underline decoration-[#19A897] decoration-2 underline-offset-3"
              >
                Privacy Policy
              </Link>
              .
            </span>
          </label>
        ) : null}

        <div className="mt-7">
          <button
            type="button"
            onClick={() => void continueWithGoogle()}
            disabled={googlePending || pending || (isSignUp && !termsAccepted)}
            className={`${googleActionClassName} w-full min-h-12`}
            style={{ fontFamily: '"Google Sans", Roboto, Arial, sans-serif' }}
          >
            <GoogleGMark />
            {googlePending
              ? "Opening Google…"
              : isSignUp
                ? "Sign up with Google"
                : "Sign in with Google"}
          </button>
          {googleError ? (
            <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              {googleError}
            </p>
          ) : null}
          <div className="my-5 flex items-center gap-3" aria-hidden="true">
            <span className="h-px flex-1 bg-slate-200" />
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">or use email</span>
            <span className="h-px flex-1 bg-slate-200" />
          </div>
        </div>

        <form action={action} className="space-y-5">
          {inviteCode ? <input type="hidden" name="invite" value={inviteCode} /> : null}
          {isSignUp ? (
            <input
              type="hidden"
              name="termsAccepted"
              value={termsAccepted ? "yes" : ""}
            />
          ) : null}

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
              minLength={isSignUp ? 12 : 1}
              maxLength={128}
              required
              className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-950 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            />
            {isSignUp ? (
              <span className="mt-2 block text-xs text-slate-500">
                At least 12 characters. We’ll send a verification email before
                the account can be used.
              </span>
            ) : null}
          </label>

          {isSignUp ? (
            <label className="block">
              <span className="text-sm font-semibold text-slate-800">
                Re-enter password
              </span>
              <input
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                required
                className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-950 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              />
            </label>
          ) : null}

          {state.error ? (
            <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              {state.error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={pending || googlePending || (isSignUp && !termsAccepted)}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#FF6B5F] px-5 text-sm font-bold text-[#243139] transition hover:bg-[#F35F54] disabled:cursor-wait disabled:opacity-60"
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
