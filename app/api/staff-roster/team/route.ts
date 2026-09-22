import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  createStaffMemberSchema,
  updateStaffMemberSchema,
} from "@/lib/staff-rosters/contracts";
import {
  createTeamMember,
  getTeam,
  updateTeamMember,
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
    return NextResponse.json(await getTeam(session));
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

  const parsed = createStaffMemberSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Check the team member." },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(
      await createTeamMember({
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

  const parsed = updateStaffMemberSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Check the team member." },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(
      await updateTeamMember({
        session,
        ...parsed.data,
      }),
    );
  } catch (error) {
    return staffRosterApiError(error);
  }
}
