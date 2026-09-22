import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  completeRosterSetup,
  getRosterSetup,
} from "@/lib/staff-rosters/service";
import { staffRosterApiError } from "@/app/api/staff-roster/shared";
import { isSameOriginMutation } from "@/lib/security/request";
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
    return NextResponse.json(await getRosterSetup(session));
  } catch (error) {
    return staffRosterApiError(error);
  }
}

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

  try {
    return NextResponse.json(await completeRosterSetup(session));
  } catch (error) {
    return staffRosterApiError(error);
  }
}
