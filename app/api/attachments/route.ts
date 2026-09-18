import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  attachmentBeginSchema,
  attachmentTargetSchema,
} from "@/lib/attachments/model";
import {
  AttachmentServiceError,
  listAttachments,
  prepareAttachmentUpload,
} from "@/lib/attachments/service";
import { isSameOriginMutation } from "@/lib/security/request";
import {
  getCalendarSession,
  getEditorSession,
} from "@/lib/security/session";

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

export async function GET(request: NextRequest) {
  const session = await getCalendarSession();
  if (!session) {
    return NextResponse.json(
      { error: "Calendar access is required." },
      { status: 401 },
    );
  }

  const parsed = attachmentTargetSchema.safeParse({
    entityType: request.nextUrl.searchParams.get("entityType"),
    entityId: request.nextUrl.searchParams.get("entityId"),
    role: request.nextUrl.searchParams.get("role") ?? "supporting",
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Choose a valid attachment target." },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(
      await listAttachments({
        session,
        target: parsed.data,
      }),
    );
  } catch (error) {
    return attachmentServiceError(error);
  }
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

  const parsed = attachmentBeginSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          parsed.error.issues[0]?.message ??
          "Choose a valid file.",
      },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(
      await prepareAttachmentUpload({
        session,
        attachment: parsed.data,
      }),
    );
  } catch (error) {
    return attachmentServiceError(error);
  }
}
