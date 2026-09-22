import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { copyStaffRosterWeekSchema } from "@/lib/staff-rosters/contracts";
import { copyPreviousRosterWeek } from "@/lib/staff-rosters/service";
import { staffRosterApiError } from "@/app/api/staff-roster/shared";
import { isSameOriginMutation } from "@/lib/security/request";
import { getCalendarSession } from "@/lib/security/session";

export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json(
      { error: "This request was blocked for safety." },
      { status: 403 },
    );
  }

  const session = await getCalendarSession();
  if (!session) {
    return NextResponse.json(
      { error: "Calendar access is required." },
      { status: 401 },
    );
  }

  const parsed = copyStaffRosterWeekSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Choose a valid roster week." },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(
      await copyPreviousRosterWeek({
        session,
        targetWeekStart: parsed.data.weekStart,
      }),
    );
  } catch (error) {
    return staffRosterApiError(error);
  }
}
