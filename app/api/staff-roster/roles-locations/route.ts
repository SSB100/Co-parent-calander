import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  archiveStaffStructureSchema,
  createStaffStructureSchema,
} from "@/lib/staff-rosters/contracts";
import {
  archiveRoleOrLocation,
  createRoleOrLocation,
  getRolesAndLocations,
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
    return NextResponse.json(await getRolesAndLocations(session));
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

  const parsed = createStaffStructureSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Check the details." },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(
      await createRoleOrLocation({
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

  const parsed = archiveStaffStructureSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Choose a valid role or location." },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(
      await archiveRoleOrLocation({
        session,
        ...parsed.data,
      }),
    );
  } catch (error) {
    return staffRosterApiError(error);
  }
}
