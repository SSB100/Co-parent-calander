import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createChildSchema } from "@/lib/children/contracts";
import {
  ChildProfileServiceError,
  createChild,
  listChildren,
} from "@/lib/children/service";
import { isSameOriginMutation } from "@/lib/security/request";
import {
  getCalendarSession,
  getEditorSession,
} from "@/lib/security/session";

function childServiceError(error: unknown) {
  if (error instanceof ChildProfileServiceError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.statusCode },
    );
  }
  return NextResponse.json(
    { error: "The child profile request could not be completed." },
    { status: 500 },
  );
}

export async function GET() {
  const session = await getCalendarSession();
  if (!session) {
    return NextResponse.json(
      { error: "Calendar access is required." },
      { status: 401 },
    );
  }

  return NextResponse.json(await listChildren(session));
}

export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json(
      { error: "This request was blocked for safety." },
      { status: 403 },
    );
  }

  const session = await getEditorSession();
  if (!session || !session.participantId) {
    return NextResponse.json(
      { error: "Editor access is required." },
      { status: 401 },
    );
  }

  const parsed = createChildSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Check the child name." },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(
      await createChild({
        session: {
          calendarId: session.calendarId,
          calendarTimezone: session.calendarTimezone,
          participantId: session.participantId,
          permission: session.permission,
        },
        displayName: parsed.data.displayName,
      }),
      { status: 201 },
    );
  } catch (error) {
    return childServiceError(error);
  }
}
