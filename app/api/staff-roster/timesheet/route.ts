import { NextResponse } from "next/server";
import { staffTimesheetWeekSchema } from "@/lib/staff-rosters/workforce-contracts";
import { getTimesheet } from "@/lib/staff-rosters/workforce-service";
import { staffRosterApiError } from "@/app/api/staff-roster/shared";
import { getCalendarSession } from "@/lib/security/session";

export async function GET(request: Request) {
  const session = await getCalendarSession();
  if (!session) {
    return NextResponse.json({ error: "Calendar access is required." }, { status: 401 });
  }

  const url = new URL(request.url);
  const parsed = staffTimesheetWeekSchema.safeParse({
    weekStart: url.searchParams.get("weekStart"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Choose a valid timesheet week." }, { status: 400 });
  }

  try {
    return NextResponse.json(
      await getTimesheet({ session, weekStart: parsed.data.weekStart }),
    );
  } catch (error) {
    return staffRosterApiError(error);
  }
}
