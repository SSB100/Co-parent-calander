export const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.app.created";
export const GOOGLE_SYNC_PAST_DAYS = 90;
export const GOOGLE_SYNC_FUTURE_MONTHS = 18;

export function isGoogleCalendarConfigured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_TOKEN_ENCRYPTION_KEY &&
      process.env.NEXT_PUBLIC_APP_URL,
  );
}

export function getGoogleCalendarConfig() {
  if (!isGoogleCalendarConfigured()) {
    throw new Error("Google Calendar integration is not configured.");
  }

  const appUrl = new URL(process.env.NEXT_PUBLIC_APP_URL!);
  if (appUrl.protocol !== "https:" && appUrl.hostname !== "localhost") {
    throw new Error("NEXT_PUBLIC_APP_URL must use HTTPS outside local development.");
  }

  return {
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    encryptionKey: process.env.GOOGLE_TOKEN_ENCRYPTION_KEY!,
    appUrl: appUrl.origin,
    redirectUri: new URL("/api/google-calendar/callback", appUrl).toString(),
  };
}
