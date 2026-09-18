import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  createResponsibilitySchema,
  deleteResponsibilitySchema,
  editResponsibilitySchema,
  responsibilityDateQuerySchema,
} from "@/lib/responsibilities/contracts";
import {
  createResponsibility,
  deleteResponsibility,
  listResponsibilities,
  ResponsibilityServiceError,
  updateResponsibility,
} from "@/lib/responsibilities/service";
import { isSameOriginMutation } from "@/lib/security/request";
import {
  getCalendarSession,
  getEditorSession,
} from "@/lib/security/session";

function responsibilityServiceError(error: unknown) {
  if (error instanceof ResponsibilityServiceError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.statusCode },
    );
  }

  return NextResponse.json(
    { error: "The responsibility request could not be completed." },
    { status: 500 },
  );
}

export async function GET(request: NextRequest) {
  const session = await getCalendarSession();
  if (!session) {
    return NextResponse.json(
      { error: "Calendar access is required." },
      { status: 401 },
    );
  }

  const rawDate = request.nextUrl.searchParams.get("date");
  const parsedDate = rawDate
    ? responsibilityDateQuerySchema.safeParse(rawDate)
    : null;

  if (rawDate && !parsedDate?.success) {
    return NextResponse.json(
      { error: "Choose a valid responsibility date." },
      { status: 400 },
    );
  }

  return NextResponse.json(
    await listResponsibilities({
      session,
      date: parsedDate?.success ? parsedDate.data : null,
    }),
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

  const parsed = createResponsibilitySchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          parsed.error.issues[0]?.message ??
          "Choose valid responsibility details.",
      },
      { status: 400 },
    );
  }

  const { reason, ...details } = parsed.data;
  try {
    const result = await createResponsibility({ session, details, reason });
    return NextResponse.json(result, {
      status: result.pending ? 202 : 200,
    });
  } catch (error) {
    return responsibilityServiceError(error);
  }
}

export async function PATCH(request: NextRequest) {
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

  const parsed = editResponsibilitySchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          parsed.error.issues[0]?.message ??
          "Choose valid responsibility details.",
      },
      { status: 400 },
    );
  }

  const { id, reason, ...details } = parsed.data;
  try {
    const result = await updateResponsibility({
      session,
      id,
      details,
      reason,
    });
    return NextResponse.json(result, {
      status: result.pending ? 202 : 200,
    });
  } catch (error) {
    return responsibilityServiceError(error);
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

  const parsed = deleteResponsibilitySchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Choose a valid responsibility." },
      { status: 400 },
    );
  }

  try {
    const result = await deleteResponsibility({
      session,
      id: parsed.data.id,
      reason: parsed.data.reason,
    });
    return NextResponse.json(result, {
      status: result.pending ? 202 : 200,
    });
  } catch (error) {
    return responsibilityServiceError(error);
  }
}
