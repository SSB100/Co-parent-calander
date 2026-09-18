import { NextResponse } from "next/server";
import { isGoogleCalendarConfigured } from "@/lib/google-calendar/config";
import { createGoogleOAuthStart, GOOGLE_OAUTH_COOKIE } from "@/lib/google-calendar/oauth";
import { getCalendarSession } from "@/lib/security/session";

export async function GET() {
  const session = await getCalendarSession();
  if (!session) {
    return NextResponse.json({ error: "Calendar access is required." }, { status: 401 });
  }
  if (!isGoogleCalendarConfigured()) {
    return NextResponse.json(
      { error: "Google Calendar is not configured for this environment." },
      { status: 503 },
    );
  }

  const start = createGoogleOAuthStart(session.membershipId, session.calendarId);
  const response = NextResponse.redirect(start.url);
  response.cookies.set(GOOGLE_OAUTH_COOKIE, start.cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/google-calendar",
    expires: start.expiresAt,
  });
  return response;
}
