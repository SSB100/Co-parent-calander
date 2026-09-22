import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  staffLeaveCancelSchema,
  staffLeaveRangeSchema,
  staffLeaveRequestSchema,
  staffLeaveReviewSchema,
} from "@/lib/staff-rosters/workforce-contracts";
import {
  cancelLeaveRequest,
  createLeaveRequest,
  getLeaveRequests,
  reviewLeaveRequest,
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
  const today = new Date().toISOString().slice(0, 10);
  const parsed = staffLeaveRangeSchema.safeParse({
    from: url.searchParams.get("from") ?? today,
    to: url.searchParams.get("to") ?? today,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Choose a valid leave date range." }, { status: 400 });
  }

  try {
    return NextResponse.json(
      await getLeaveRequests({
        session,
        from: parsed.data.from ?? today,
        to: parsed.data.to ?? today,
      }),
    );
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

  const parsed = staffLeaveRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Check the leave request." },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(await createLeaveRequest({ session, ...parsed.data }));
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

  const parsed = staffLeaveReviewSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Choose a valid leave decision." }, { status: 400 });
  }

  try {
    return NextResponse.json(await reviewLeaveRequest({ session, ...parsed.data }));
  } catch (error) {
    return staffRosterApiError(error);
  }
}

export async function DELETE(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ error: "This request was blocked for safety." }, { status: 403 });
  }
  const session = await getCalendarSession();
  if (!session) {
    return NextResponse.json({ error: "Calendar access is required." }, { status: 401 });
  }

  const parsed = staffLeaveCancelSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Choose a valid leave request." }, { status: 400 });
  }

  try {
    return NextResponse.json(await cancelLeaveRequest({ session, ...parsed.data }));
  } catch (error) {
    return staffRosterApiError(error);
  }
}
