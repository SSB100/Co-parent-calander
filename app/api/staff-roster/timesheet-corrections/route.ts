import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  staffTimesheetCorrectionReviewSchema,
  staffTimesheetCorrectionSchema,
} from "@/lib/staff-rosters/workforce-contracts";
import {
  requestTimesheetCorrection,
  reviewTimesheetCorrection,
} from "@/lib/staff-rosters/workforce-service";
import { staffRosterApiError } from "@/app/api/staff-roster/shared";
import { isSameOriginMutation } from "@/lib/security/request";
import { getCalendarSession } from "@/lib/security/session";

export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ error: "This request was blocked for safety." }, { status: 403 });
  }
  const session = await getCalendarSession();
  if (!session) {
    return NextResponse.json({ error: "Calendar access is required." }, { status: 401 });
  }

  const parsed = staffTimesheetCorrectionSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Check the correction details." },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(
      await requestTimesheetCorrection({
        session,
        clockSessionId: parsed.data.clockSessionId,
        requestedClockInAt: parsed.data.requestedClockInAt ?? null,
        requestedClockOutAt: parsed.data.requestedClockOutAt ?? null,
        reason: parsed.data.reason,
      }),
    );
  } catch (error) {
    return staffRosterApiError(error);
  }
}

export async function PATCH(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ error: "This request was blocked for safety." }, { status: 403 });
  }
  const session = await getCalendarSession();
  if (!session) {
    return NextResponse.json({ error: "Calendar access is required." }, { status: 401 });
  }

  const parsed = staffTimesheetCorrectionReviewSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "Choose a valid correction decision." }, { status: 400 });
  }

  try {
    return NextResponse.json(
      await reviewTimesheetCorrection({
        session,
        correctionId: parsed.data.correctionId,
        decision: parsed.data.decision,
      }),
    );
  } catch (error) {
    return staffRosterApiError(error);
  }
}
