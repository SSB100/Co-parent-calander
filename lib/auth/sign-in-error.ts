type SignInFailure = { code?: unknown; status?: unknown };

export function signInFailure(error: unknown) {
  const failure: SignInFailure = error && typeof error === "object" ? error : {};
  const code = typeof failure.code === "string" ? failure.code.toLowerCase() : "";
  const status = typeof failure.status === "number" ? failure.status : 0;
  if (status === 429) return { category: "rate_limit", message: "Too many sign-in attempts. Wait a few minutes, then try again." };
  // An upstream failure must never be presented as a rejected password.
  if (status < 500 && status !== 0) {
    if (["email_not_confirmed", "email_not_verified"].includes(code)) {
      return { category: "verification", message: "Verify your email using the message we sent you, then sign in." };
    }
    if (["invalid_credentials", "invalid_email_or_password", "invalid_password", "user_not_found", "identity_not_found", "credential_account_not_found"].includes(code)) {
      return { category: "credentials", message: "The email or password is incorrect." };
    }
  }
  return { category: "service", message: "Sign-in is temporarily unavailable. Please try again shortly." };
}
