import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  childIdSchema,
  deleteChildActivitySchema,
  updateChildActivitySchema,
} from "@/lib/children/contracts";
import { childActivitySchema } from "@/lib/children/profile";
import {
  ChildProfileServiceError,
  createChildActivity,
  deleteChildActivity,
  updateChildActivity,
} from "@/lib/children/service";
import { isSameOriginMutation } from "@/lib/security/request";
import { getEditorSession } from "@/lib/security/session";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function childServiceError(error: unknown) {
  if (error instanceof ChildProfileServiceError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.statusCode },
    );
  }

  return NextResponse.json(
    { error: "The child activity request could not be completed." },
    { status: 500 },
  );
}

async function parseChildId(context: RouteContext) {
  const params = await context.params;
  return childIdSchema.safeParse(params.id);
}

export async function POST(request: NextRequest, context: RouteContext) {
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

  const parsedChild = await parseChildId(context);
  if (!parsedChild.success) {
    return NextResponse.json(
      { error: "Choose a valid child profile." },
      { status: 400 },
    );
  }

  const parsed = childActivitySchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          parsed.error.issues[0]?.message ??
          "Check the activity details.",
      },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(
      await createChildActivity({
        session,
        childId: parsedChild.data,
        activity: parsed.data,
      }),
    );
  } catch (error) {
    return childServiceError(error);
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

  const parsedChild = await parseChildId(context);
  if (!parsedChild.success) {
    return NextResponse.json(
      { error: "Choose a valid child profile." },
      { status: 400 },
    );
  }

  const parsed = updateChildActivitySchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          parsed.error.issues[0]?.message ??
          "Check the activity details.",
      },
      { status: 400 },
    );
  }

  const { id, ...activity } = parsed.data;
  try {
    return NextResponse.json(
      await updateChildActivity({
        session,
        childId: parsedChild.data,
        activityId: id,
        activity,
      }),
    );
  } catch (error) {
    return childServiceError(error);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
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

  const parsedChild = await parseChildId(context);
  const parsed = deleteChildActivitySchema.safeParse(
    await request.json().catch(() => null),
  );

  if (!parsedChild.success || !parsed.success) {
    return NextResponse.json(
      { error: "Choose a valid activity." },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(
      await deleteChildActivity({
        session,
        childId: parsedChild.data,
        activityId: parsed.data.id,
      }),
    );
  } catch (error) {
    return childServiceError(error);
  }
}
