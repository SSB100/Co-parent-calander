import { createHash, randomBytes } from "node:crypto";
import { GOOGLE_CALENDAR_SCOPE, getGoogleCalendarConfig } from "@/lib/google-calendar/config";
import { decryptGoogleSecret, encryptGoogleSecret } from "@/lib/google-calendar/crypto";

export const GOOGLE_OAUTH_COOKIE = "coparent_google_oauth";
const STATE_TTL_MS = 10 * 60 * 1000;

type OAuthState = {
  state: string;
  verifier: string;
  membershipId: string;
  calendarId: string;
  expiresAt: number;
};

export function createGoogleOAuthStart(membershipId: string, calendarId: string) {
  const config = getGoogleCalendarConfig();
  const state = randomBytes(24).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const payload: OAuthState = {
    state,
    verifier,
    membershipId,
    calendarId,
    expiresAt: Date.now() + STATE_TTL_MS,
  };

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_CALENDAR_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");

  return {
    url,
    cookieValue: encryptGoogleSecret(JSON.stringify(payload), config.encryptionKey),
    expiresAt: new Date(payload.expiresAt),
  };
}

export function readGoogleOAuthState(cookieValue: string) {
  const config = getGoogleCalendarConfig();
  const parsed = JSON.parse(decryptGoogleSecret(cookieValue, config.encryptionKey)) as Partial<OAuthState>;
  if (
    typeof parsed.state !== "string" ||
    typeof parsed.verifier !== "string" ||
    typeof parsed.membershipId !== "string" ||
    typeof parsed.calendarId !== "string" ||
    typeof parsed.expiresAt !== "number" ||
    parsed.expiresAt <= Date.now()
  ) {
    throw new Error("Google OAuth state is invalid or expired.");
  }
  return parsed as OAuthState;
}
