import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  parentingScheduleDeleteSchema,
  parentingScheduleUpsertSchema,
} from "@/lib/parenting-schedules/model";
import {
  deleteParentingSchedule,
  listParentingSchedules,
  ParentingScheduleServiceError,
  upsertParentingSchedule,
} from "@/lib/parenting-schedules/service";
import { isSameOriginMutation } from "@/lib/security/request";
import { getEditorSession } from "@/lib/security/session";

function scheduleServiceError(error: unknown) {
  if (error instanceof ParentingScheduleServiceError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.statusCode },
    );
  }

  return NextResponse.json(
    { error: "The repeating schedule request could not be completed." },
    { status: 500 },
  );
}

export async function GET() {
  const session = await getEditorSession();
  if (!session) {
    return NextResponse.json(
      { error: "Editor access is required." },
      { status: 401 },
    );
  }

  return NextResponse.json(
    await listParentingSchedules(session),
  );
}

export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json(
      { error: "This request was blocked for safety." },
      { status: 403 },
    );
  }

  const session = await getEditorSession();
  if (!session) {
    return NextResponse.json(
      { error: "Editor access is required." },
      { status: 401 },
    );
  }

  const parsed = parentingScheduleUpsertSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          parsed.error.issues[0]?.message ??
          "Choose a valid repeating schedule.",
      },
      { status: 400 },
    );
  }

  try {
    const result = await upsertParentingSchedule({
      session,
      ...parsed.data,
    });
    return NextResponse.json(result, {
      status: result.pending ? 202 : 200,
    });
  } catch (error) {
    return scheduleServiceError(error);
  }
}

export async function DELETE(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json(
      { error: "This request was blocked for safety." },
      { status: 403 },
    );
  }

  const session = await getEditorSession();
  if (!session) {
    return NextResponse.json(
      { error: "Editor access is required." },
      { status: 401 },
    );
  }

  const parsed = parentingScheduleDeleteSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Choose a valid saved schedule." },
      { status: 400 },
    );
  }

  try {
    const result = await deleteParentingSchedule({
      session,
      scheduleId: parsed.data.scheduleId,
      reason: parsed.data.reason,
    });
    return NextResponse.json(result, {
      status: result.pending ? 202 : 200,
    });
  } catch (error) {
    return scheduleServiceError(error);
  }
}
