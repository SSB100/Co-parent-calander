import { createHash } from "node:crypto";

function hostFingerprint(value: string | undefined) {
  if (!value) return null;
  try {
    return createHash("sha256").update(new URL(value).hostname.toLowerCase()).digest("hex").slice(0, 16);
  } catch { return "invalid_url"; }
}

const safeCodes = new Set(["ENOTFOUND", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "EAI_AGAIN", "UND_ERR_CONNECT_TIMEOUT", "AUTH_UPSTREAM_UNAVAILABLE", "AUTH_UPSTREAM_TIMEOUT", "AUTH_NETWORK_ERROR"]);
function safeCode(value: unknown) {
  return typeof value === "string" && (safeCodes.has(value) || /^[0-9]{2}[0-9A-Z]{3}$/.test(value)) ? value : null;
}

/** Never include messages, stack traces, request data, credentials or full URLs. */
export function safeServerDiagnostic(error: unknown, env: Record<string, string | undefined> = process.env) {
  const failure = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const cause = failure.cause && typeof failure.cause === "object" ? failure.cause as Record<string, unknown> : {};
  return {
    code: safeCode(failure.code),
    causeCode: safeCode(cause.code),
    status: typeof failure.status === "number" && Number.isInteger(failure.status) && failure.status >= 100 && failure.status <= 599 ? failure.status : null,
    authConfigured: Boolean(env.NEON_AUTH_BASE_URL),
    authCookieConfigured: Boolean(env.NEON_AUTH_COOKIE_SECRET),
    appDatabaseConfigured: Boolean(env.APP_DATABASE_URL),
    fallbackDatabaseConfigured: Boolean(env.DATABASE_URL),
    authHostFingerprint: hostFingerprint(env.NEON_AUTH_BASE_URL),
    databaseHostFingerprint: hostFingerprint(env.APP_DATABASE_URL ?? env.DATABASE_URL),
  };
}

export function reportServerFailure(area: "sign-in" | "salon", error: unknown) {
  console.error(`[covie:${area}] request failed`, safeServerDiagnostic(error));
}
