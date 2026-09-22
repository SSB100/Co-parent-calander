import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  staffAvailabilityIdSchema,
  staffAvailabilityRangeSchema,
  staffAvailabilitySchema,
} from "@/lib/staff-rosters/contracts";
import {
  createAvailability,
  deleteAvailability,
  getAvailability,
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

  const parsed = staffAvailabilityRangeSchema.safeParse({
    from: request.nextUrl.searchParams.get("from") || undefined,
    to: request.nextUrl.searchParams.get("to") || undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Choose a valid availability range." },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(
      await getAvailability({
        session,
        ...parsed.data,
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

  const parsed = staffAvailabilitySchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Check the availability." },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(
      await createAvailability({
        session,
        ...parsed.data,
      }),
      { status: 201 },
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
    | { availabilityId?: unknown }
    | null;
  const parsed = staffAvailabilityIdSchema.safeParse(body?.availabilityId);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Choose a valid availability entry." },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(
      await deleteAvailability({
        session,
        availabilityId: parsed.data,
      }),
    );
  } catch (error) {
    return staffRosterApiError(error);
  }
}
