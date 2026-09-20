import { NextResponse } from "next/server";
import { getCalendarSession } from "@/lib/security/session";
import { loadComingUpContext } from "@/lib/workspace/load-summary";

export async function GET() {
  const session = await getCalendarSession();
  if (!session) {
    return NextResponse.json(
      { error: "Calendar access is required." },
      { status: 401 },
    );
  }

  try {
    const context = await loadComingUpContext(session);
    return NextResponse.json(context, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return NextResponse.json(
      { error: "Workspace context is unavailable." },
      { status: 500 },
    );
  }
}
