import { NextResponse } from "next/server";
import { getRosterUpdates } from "@/lib/staff-rosters/service";
import { staffRosterApiError } from "@/app/api/staff-roster/shared";
import { getCalendarSession } from "@/lib/security/session";

export async function GET() {
  const session = await getCalendarSession();
  if (!session) {
    return NextResponse.json(
      { error: "Calendar access is required." },
      { status: 401 },
    );
  }

  try {
    return NextResponse.json(await getRosterUpdates(session));
  } catch (error) {
    return staffRosterApiError(error);
  }
}
