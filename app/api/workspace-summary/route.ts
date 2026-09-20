import { NextResponse } from "next/server";
import { getCalendarSession } from "@/lib/security/session";
import { loadWorkspaceSummary } from "@/lib/workspace/load-summary";

export async function GET(request: Request) {
  const session = await getCalendarSession();
  if (!session) {
    return NextResponse.json(
      { error: "Calendar access is required." },
      { status: 401 },
    );
  }

  try {
    const url = new URL(request.url);
    const includeContext = url.searchParams.get("context") !== "0";
    const summary = await loadWorkspaceSummary(session, includeContext);

    return NextResponse.json(summary, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return NextResponse.json(
      { error: "Workspace summary is unavailable." },
      { status: 500 },
    );
  }
}
