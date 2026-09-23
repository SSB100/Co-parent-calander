import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { staffClockActionSchema } from "@/lib/staff-rosters/workforce-contracts";
import { clockIn, clockOut, getClockState, changeBreak } from "@/lib/staff-rosters/workforce-service";
import { staffRosterApiError } from "@/app/api/staff-roster/shared";
import { isSameOriginMutation } from "@/lib/security/request";
import { getCalendarSession } from "@/lib/security/session";

export async function GET() {
  const session = await getCalendarSession();
  if (!session) {
    return NextResponse.json({ error: "Calendar access is required." }, { status: 401 });
  }

  try {
    return NextResponse.json(await getClockState(session));
  } catch (error) {
    return staffRosterApiError(error);
  }
}

export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ error: "This request was blocked for safety." }, { status: 403 });
  }

  const session = await getCalendarSession();
  if (!session) {
    return NextResponse.json({ error: "Calendar access is required." }, { status: 401 });
  }

  const parsed = staffClockActionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Choose a valid clock action." }, { status: 400 });
  }

  try {
    return NextResponse.json(
      parsed.data.action === "clock_in"
        ? await clockIn({
            session,
            confirmUnrostered: parsed.data.confirmUnrostered,
          })
        : parsed.data.action === "clock_out"
          ? await clockOut(session)
          : await changeBreak({ session, action: parsed.data.action, breakId: parsed.data.breakId }),
    );
  } catch (error) {
    return staffRosterApiError(error);
  }
}
