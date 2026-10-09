"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";
import { CovieButton, CovieInput, CovieNotice } from "@/components/ui/covie";
import { acceptTimesheetsInvitation } from "./actions";
export function TimesheetsInvitationForm({ token, email, verified, verificationRequested = false }: { token: string; email: string | null; verified: boolean; verificationRequested?: boolean }) {
  const [state, action, pending] = useActionState(acceptTimesheetsInvitation, { error: null });
  const [verificationEmail, setVerificationEmail] = useState(email ?? "");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();
  const destination = `/timesheets/invite/${token}`;
  const authQuery = new URLSearchParams({ returnTo: destination }).toString();
  async function signOut() {
    if (busy || pending) return;
    setBusy(true); setError("");
    try {
      const result = await authClient.signOut();
      if (result.error) throw new Error("Could not sign out. Please try again.");
      router.refresh();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not sign out."); }
    finally { setBusy(false); }
  }
  async function verify(send: boolean) {
    setBusy(true); setError(""); setNotice("");
    try {
      const address = (email ?? verificationEmail).trim();
      const response = send ? await authClient.emailOtp.sendVerificationOtp({ email: address, type: "email-verification" }) : await authClient.emailOtp.verifyEmail({ email: address, otp });
      if (response.error) throw new Error(send ? "The verification code could not be sent. Check the email or try again later." : "The code could not be verified. Check the latest code and try again.");
      setOtp(""); setNotice(send ? "If this account can be verified, a code has been sent. Check your inbox." : "Email verified. Sign in if needed, then accept this invitation.");
      if (!send) router.refresh();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Email verification is temporarily unavailable."); }
    finally { setBusy(false); }
  }
  return <div className="grid gap-5">
    <p>This person-specific invitation connects your account to an organisation’s Timesheets. Use the email address your manager invited.</p>
    {verificationRequested && !verified ? <CovieNotice>Verify your account email below, then sign in and accept this invitation.</CovieNotice> : null}
    {!email ? <div className="flex flex-wrap gap-3"><Link className="covie-button covie-action-primary" href={`/auth/sign-up?${authQuery}`}>Create your account</Link><Link className="covie-button covie-action-secondary" href={`/auth/sign-in?${authQuery}`}>Sign in to an existing account</Link></div> : <p>Signed in as {email}. <Link href={`/auth/sign-in?${authQuery}`} className="underline">Use a different account</Link></p>}
    {email ? <CovieButton type="button" tone="neutral" disabled={busy || pending} onClick={() => void signOut()}>Sign out to use another account</CovieButton> : null}
    {state.error ? <CovieNotice tone="danger">{state.error}</CovieNotice> : null}
    {email ? <form action={action} className="grid gap-3"><input type="hidden" name="token" value={token} /><CovieButton type="submit" disabled={pending || busy || !verified}>{pending ? "Accepting…" : "Accept Timesheets invitation"}</CovieButton>{!verified ? <p>Verify your email before joining. An existing Covie session alone doesn’t verify the invited address.</p> : null}</form> : null}
    {!verified ? <details open={verificationRequested}><summary className="cursor-pointer py-3 font-semibold">Verify your email address</summary><div className="grid gap-3 py-3">
      <p>Already created an account? Use its email address to request a verification code. Your manager never chooses or sees your password.</p>
      <label className="grid gap-1">Account email<CovieInput type="email" autoComplete="email" value={email ?? verificationEmail} readOnly={Boolean(email)} disabled={busy || pending} onChange={event => setVerificationEmail(event.target.value)} /></label>
      <CovieButton type="button" tone="neutral" disabled={busy || pending || !verificationEmail.trim()} onClick={() => void verify(true)}>Send verification code</CovieButton>
      <label className="grid gap-1">Verification code<CovieInput inputMode="numeric" autoComplete="one-time-code" value={otp} maxLength={12} disabled={busy || pending} onChange={event => setOtp(event.target.value)} /></label>
      <CovieButton type="button" disabled={busy || pending || !otp.trim() || !verificationEmail.trim()} onClick={() => void verify(false)}>Verify email</CovieButton>
      {notice ? <p role="status">{notice}</p> : null}{error ? <CovieNotice tone="danger">{error}</CovieNotice> : null}
    </div></details> : null}
    {verified && error ? <CovieNotice tone="danger">{error}</CovieNotice> : null}
    <p className="text-sm text-slate-600">Invitations expire after seven days and can be revoked. A forwarded link can only be accepted by the verified account matching the invited email.</p>
    <Link href="/personal" className="underline">Leave invitation</Link>
  </div>;
}
