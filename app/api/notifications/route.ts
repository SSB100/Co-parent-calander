import { NextResponse } from "next/server";
import { getCalendarSession } from "@/lib/security/session";
import { loadNotificationCount } from "@/lib/workspace/load-summary";

export async function GET() {
  const session = await getCalendarSession();
  if (!session) {
    return NextResponse.json(
      { error: "Calendar access is required." },
      { status: 401 },
    );
  }

  try {
    const count = await loadNotificationCount(session);
    return NextResponse.json(
      { count },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Notifications are unavailable." },
      { status: 500 },
    );
  }
}
