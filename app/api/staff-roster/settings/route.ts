import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { staffRosterApiError } from "@/app/api/staff-roster/shared";
import { isSameOriginMutation } from "@/lib/security/request";
import { getCalendarSession } from "@/lib/security/session";
import { staffRosterOperationalHoursSchema } from "@/lib/staff-rosters/contracts";
import { updateRosterOperationalHours } from "@/lib/staff-rosters/service";

export async function PATCH(request: NextRequest) {
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

  const parsed = staffRosterOperationalHoursSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          parsed.error.issues[0]?.message ??
          "Choose valid operational hours.",
      },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(
      await updateRosterOperationalHours({
        session,
        startMinute: parsed.data.startMinute,
        endMinute: parsed.data.endMinute,
      }),
    );
  } catch (error) {
    return staffRosterApiError(error);
  }
}
