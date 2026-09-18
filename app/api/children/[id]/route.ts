import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { childIdSchema } from "@/lib/children/contracts";
import { childProfileSchema } from "@/lib/children/profile";
import {
  ChildProfileServiceError,
  getChildProfile,
  updateChildProfile,
} from "@/lib/children/service";
import { isSameOriginMutation } from "@/lib/security/request";
import {
  getCalendarSession,
  getEditorSession,
} from "@/lib/security/session";

type RouteContext = {
  params: Promise<{ id: string }>;
};


function childProfileServiceError(error: unknown) {
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

async function parseChildId(context: RouteContext) {
  const params = await context.params;
  return childIdSchema.safeParse(params.id);
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const session = await getCalendarSession();
  if (!session) {
    return NextResponse.json(
      { error: "Calendar access is required." },
      { status: 401 },
    );
  }

  const parsedId = await parseChildId(context);
  if (!parsedId.success) {
    return NextResponse.json(
      { error: "Choose a valid child profile." },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(
      await getChildProfile({
        session,
        childId: parsedId.data,
      }),
    );
  } catch (error) {
    return childProfileServiceError(error);
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
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

  const parsedId = await parseChildId(context);
  if (!parsedId.success) {
    return NextResponse.json(
      { error: "Choose a valid child profile." },
      { status: 400 },
    );
  }

  const parsed = childProfileSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          parsed.error.issues[0]?.message ??
          "Check the child profile details.",
      },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(
      await updateChildProfile({
        session,
        childId: parsedId.data,
        profile: parsed.data,
      }),
    );
  } catch (error) {
    return childProfileServiceError(error);
  }
}
