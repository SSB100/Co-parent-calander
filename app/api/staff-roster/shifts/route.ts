import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  staffRosterWeekSchema,
  staffShiftIdSchema,
  staffShiftSchema,
  updateStaffShiftSchema,
} from "@/lib/staff-rosters/contracts";
import {
  createShift,
  deleteShift,
  getRosterWeek,
  updateShift,
} from "@/lib/staff-rosters/service";
import { staffRosterApiError } from "@/app/api/staff-roster/shared";
import { isSameOriginMutation } from "@/lib/security/request";
import { getCalendarSession } from "@/lib/security/session";

export async function GET(request: NextRequest) {
  const session = await getCalendarSession();
  if (!session) {
    return NextResponse.json(
      { error: "Calendar access is required." },
      { status: 401 },
    );
  }

  const parsed = staffRosterWeekSchema.safeParse({
    weekStart: request.nextUrl.searchParams.get("weekStart"),
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Choose a valid roster week." },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(
      await getRosterWeek({
        session,
        weekStart: parsed.data.weekStart,
      }),
    );
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

  const parsed = staffShiftSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Check the shift details." },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(
      await createShift({
        session,
        ...parsed.data,
      }),
      { status: 201 },
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

  const parsed = updateStaffShiftSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Check the shift details." },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(
      await updateShift({
        session,
        ...parsed.data,
      }),
    );
  } catch (error) {
    return staffRosterApiError(error);
  }
}

export async function DELETE(request: NextRequest) {
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

  const body = (await request.json().catch(() => null)) as
    | { shiftId?: unknown }
    | null;
  const parsed = staffShiftIdSchema.safeParse(body?.shiftId);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Choose a valid shift." },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(
      await deleteShift({
        session,
        shiftId: parsed.data,
      }),
    );
  } catch (error) {
    return staffRosterApiError(error);
  }
}
