"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth/server";
import { safeAuthReturnTo } from "@/lib/security/auth-return";
import { normalizeInviteCode } from "@/lib/security/invites";
import { signInFailure } from "@/lib/auth/sign-in-error";
import { reportServerFailure } from "@/lib/server-diagnostics";

export type AuthActionState = { error: string | null };

const email = z.string().trim().email("Enter a valid email address.").max(256);
const signInPassword = z.string().min(1, "Enter your password.").max(128);
const newPassword = z.string().min(12, "Use at least 12 characters.").max(128);

function onboardingDestination(formData: FormData) {
  const invite = normalizeInviteCode(String(formData.get("invite") ?? ""));
  return invite ? `/onboarding?invite=${encodeURIComponent(invite)}` : "/onboarding";
}

function verificationDestination(formData: FormData) {
  const invite = normalizeInviteCode(String(formData.get("invite") ?? ""));
  const params = new URLSearchParams({ verify: "1" });
  if (invite) params.set("invite", invite);
  const returnTo = safeAuthReturnTo(formData.get("returnTo"));
  if (returnTo) params.set("returnTo", returnTo);
  return `/auth/sign-in?${params.toString()}`;
}

export async function signInWithEmail(
  _previous: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = z
    .object({ email, password: signInPassword })
    .safeParse({ email: formData.get("email"), password: formData.get("password") });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check your details." };
  }

  let signInError: unknown;
  try {
    ({ error: signInError } = await auth.signIn.email(parsed.data));
  } catch (error) {
    reportServerFailure("sign-in", error);
    return { error: signInFailure(error).message };
  }
  if (signInError) {
    const failure = signInFailure(signInError);
    if (failure.category === "service") reportServerFailure("sign-in", signInError);
    return { error: failure.message };
  }

  const invite = normalizeInviteCode(String(formData.get("invite") ?? ""));
  redirect(invite ? onboardingDestination(formData) : safeAuthReturnTo(formData.get("returnTo")) || "/");
}

export async function signUpWithEmail(
  _previous: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = z
    .object({
      name: z.string().trim().min(1, "Enter your name.").max(60),
      email,
      password: newPassword,
      confirmPassword: newPassword,
      termsAccepted: z.literal("yes", {
        error: "Agree to the Terms & Conditions before creating your account.",
      }),
    })
    .refine((value) => value.password === value.confirmPassword, {
      path: ["confirmPassword"],
      message: "The passwords do not match.",
    })
    .safeParse({
      name: formData.get("name"),
      email: formData.get("email"),
      password: formData.get("password"),
      confirmPassword: formData.get("confirmPassword"),
      termsAccepted: formData.get("termsAccepted"),
    });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check your details." };
  }

  const account = {
    name: parsed.data.name,
    email: parsed.data.email,
    password: parsed.data.password,
  };
  const { error: signUpError } = await auth.signUp.email(account);
  if (signUpError) {
    return {
      error: "Your account could not be created. Check your details or try signing in.",
    };
  }

  redirect(verificationDestination(formData));
}
