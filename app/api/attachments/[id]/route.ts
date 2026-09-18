import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  AttachmentServiceError,
  deleteAttachment,
  finalizeAttachment,
} from "@/lib/attachments/service";
import { isSameOriginMutation } from "@/lib/security/request";
import { getEditorSession } from "@/lib/security/session";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function attachmentServiceError(error: unknown) {
  if (error instanceof AttachmentServiceError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.statusCode },
    );
  }

  return NextResponse.json(
    { error: "The attachment request could not be completed." },
    { status: 500 },
  );
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

  try {
    return NextResponse.json(
      await finalizeAttachment({
        session,
        attachmentId: (await context.params).id,
      }),
    );
  } catch (error) {
    return attachmentServiceError(error);
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

  try {
    return NextResponse.json(
      await deleteAttachment({
        session,
        attachmentId: (await context.params).id,
      }),
    );
  } catch (error) {
    return attachmentServiceError(error);
  }
}
