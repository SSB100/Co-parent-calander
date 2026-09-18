"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth/server";
import { normalizeInviteCode } from "@/lib/security/invites";

export type AuthActionState = { error: string | null };

const email = z.string().trim().email("Enter a valid email address.").max(256);
const password = z.string().min(8, "Use at least 8 characters.").max(128);

function onboardingDestination(formData: FormData) {
  const invite = normalizeInviteCode(String(formData.get("invite") ?? ""));
  return invite ? `/onboarding?invite=${encodeURIComponent(invite)}` : "/onboarding";
}

export async function signInWithEmail(
  _previous: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = z
    .object({ email, password })
    .safeParse({ email: formData.get("email"), password: formData.get("password") });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check your details." };
  }

  const { error: signInError } = await auth.signIn.email(parsed.data);
  if (signInError) return { error: "The email or password is incorrect." };

  const invite = normalizeInviteCode(String(formData.get("invite") ?? ""));
  redirect(invite ? onboardingDestination(formData) : "/");
}

export async function signUpWithEmail(
  _previous: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = z
    .object({
      name: z.string().trim().min(1, "Enter your name.").max(60),
      email,
      password,
    })
    .safeParse({
      name: formData.get("name"),
      email: formData.get("email"),
      password: formData.get("password"),
    });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check your details." };
  }

  const { error: signUpError } = await auth.signUp.email(parsed.data);
  if (signUpError) {
    const alreadyExists = signUpError.message?.toLowerCase().includes("already");
    return {
      error: alreadyExists
        ? "An account already exists for that email. Log in instead."
        : signUpError.message || "Your account could not be created.",
    };
  }

  redirect(onboardingDestination(formData));
}
