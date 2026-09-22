import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  staffTimesheetManagerCorrectionSchema,
  staffTimesheetWeekSchema,
} from "@/lib/staff-rosters/workforce-contracts";
import {
  correctTimesheetSession,
  getTimesheet,
} from "@/lib/staff-rosters/workforce-service";
import { staffRosterApiError } from "@/app/api/staff-roster/shared";
import { isSameOriginMutation } from "@/lib/security/request";
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

  const parsed = staffTimesheetManagerCorrectionSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          parsed.error.issues[0]?.message ??
          "Check the corrected timesheet entry.",
      },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(
      await correctTimesheetSession({
        session,
        ...parsed.data,
      }),
    );
  } catch (error) {
    return staffRosterApiError(error);
  }
}
