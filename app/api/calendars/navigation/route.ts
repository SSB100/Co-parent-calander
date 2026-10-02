import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { listCalendarNavigationOptions } from "@/lib/calendars/navigation";

/** The same active memberships used by the shared-calendar switcher. */
export async function GET() {
  const headers = { "Cache-Control": "private, no-store" };
  const { data: session } = await auth.getSession();
  if (!session?.user) return NextResponse.json({ error: "Sign in to see your calendars." }, { status: 401, headers });
  try {
    const calendars = await listCalendarNavigationOptions(session.user.id);
    return NextResponse.json({ calendars }, { headers });
  } catch {
    return NextResponse.json({ error: "Your calendars could not be loaded. Try again." }, { status: 500, headers });
  }
}
