import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { createPrivateDownloadUrl } from "@/lib/attachments/blob";
import { getDb } from "@/lib/db";
import { attachments } from "@/lib/db/schema";
import { getCalendarSession } from "@/lib/security/session";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const session = await getCalendarSession();
  if (!session) {
    return NextResponse.json({ error: "Calendar access is required." }, { status: 401 });
  }

  const id = (await context.params).id;
  const rows = await getDb()
    .select({
      id: attachments.id,
      storageKey: attachments.storageKey,
      originalFileName: attachments.originalFileName,
    })
    .from(attachments)
    .where(
      and(
        eq(attachments.id, id),
        eq(attachments.calendarId, session.calendarId),
        eq(attachments.status, "ready"),
      ),
    )
    .limit(1);

  const attachment = rows[0];
  if (!attachment) {
    return NextResponse.json({ error: "Attachment not found." }, { status: 404 });
  }

  try {
    const signed = await createPrivateDownloadUrl(attachment.storageKey);
    return NextResponse.json({
      url: signed.url,
      expiresAt: signed.expiresAt,
      fileName: attachment.originalFileName,
    });
  } catch {
    return NextResponse.json(
      { error: "The private download link could not be created." },
      { status: 503 },
    );
  }
}
