import { NextResponse } from "next/server";
import {
  AttachmentServiceError,
  getAttachmentDownload,
} from "@/lib/attachments/service";
import { getCalendarSession } from "@/lib/security/session";

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
    { error: "The private download link could not be created." },
    { status: 500 },
  );
}

export async function GET(_request: Request, context: RouteContext) {
  const session = await getCalendarSession();
  if (!session) {
    return NextResponse.json(
      { error: "Calendar access is required." },
      { status: 401 },
    );
  }

  try {
    return NextResponse.json(
      await getAttachmentDownload({
        session,
        attachmentId: (await context.params).id,
      }),
    );
  } catch (error) {
    return attachmentServiceError(error);
  }
}
