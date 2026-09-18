import { NextResponse } from "next/server";
import { listChildren } from "@/lib/children/service";
import { getCalendarSession } from "@/lib/security/session";

export async function GET() {
  const session = await getCalendarSession();
  if (!session) {
    return NextResponse.json(
      { error: "Calendar access is required." },
      { status: 401 },
    );
  }

  return NextResponse.json(await listChildren(session));
}
