import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createStaffRosterInvitation } from "@/lib/staff-rosters/invitations-service";
import { staffRosterApiError } from "@/app/api/staff-roster/shared";
import { isSameOriginMutation } from "@/lib/security/request";
import { getCalendarSession } from "@/lib/security/session";

const invitationSchema = z.object({
  memberId: z.string().uuid(),
});

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

  const parsed = invitationSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Choose a valid team member." },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(
      await createStaffRosterInvitation({
        session,
        memberId: parsed.data.memberId,
      }),
    );
  } catch (error) {
    return staffRosterApiError(error);
  }
}
