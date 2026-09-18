import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  attachmentBeginSchema,
  attachmentStorageKey,
  attachmentTargetSchema,
  assertAttachmentTarget,
} from "@/lib/attachments/model";
import { createPrivateUploadUrl } from "@/lib/attachments/blob";
import { getDb, getSql } from "@/lib/db";
import {
  attachmentLinks,
  attachments,
  participants,
} from "@/lib/db/schema";
import { isSameOriginMutation } from "@/lib/security/request";
import { getCalendarSession, getEditorSession } from "@/lib/security/session";

export async function GET(request: NextRequest) {
  const session = await getCalendarSession();
  if (!session) {
    return NextResponse.json({ error: "Calendar access is required." }, { status: 401 });
  }

  const parsed = attachmentTargetSchema.safeParse({
    entityType: request.nextUrl.searchParams.get("entityType"),
    entityId: request.nextUrl.searchParams.get("entityId"),
    role: request.nextUrl.searchParams.get("role") ?? "supporting",
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Choose a valid attachment target." }, { status: 400 });
  }

  try {
    await assertAttachmentTarget(session.calendarId, parsed.data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Attachment target not found." },
      { status: 404 },
    );
  }

  const rows = await getDb()
    .select({
      id: attachments.id,
      originalFileName: attachments.originalFileName,
      contentType: attachments.contentType,
      sizeBytes: attachments.sizeBytes,
      category: attachments.category,
      role: attachmentLinks.role,
      createdAt: attachments.createdAt,
      readyAt: attachments.readyAt,
      uploadedByName: participants.displayName,
    })
    .from(attachmentLinks)
    .innerJoin(attachments, eq(attachmentLinks.attachmentId, attachments.id))
    .leftJoin(participants, eq(attachments.uploadedBy, participants.id))
    .where(
      and(
        eq(attachmentLinks.calendarId, session.calendarId),
        eq(attachmentLinks.entityType, parsed.data.entityType),
        eq(attachmentLinks.entityId, parsed.data.entityId),
        eq(attachmentLinks.role, parsed.data.role),
        eq(attachments.status, "ready"),
      ),
    )
    .orderBy(asc(attachments.createdAt));

  return NextResponse.json({
    permission: session.permission,
    attachments: rows,
  });
}

export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ error: "This request was blocked for safety." }, { status: 403 });
  }

  const session = await getEditorSession();
  if (!session) {
    return NextResponse.json({ error: "Editor access is required." }, { status: 401 });
  }

  const parsed = attachmentBeginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Choose a valid file." },
      { status: 400 },
    );
  }

  try {
    await assertAttachmentTarget(session.calendarId, parsed.data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Attachment target not found." },
      { status: 404 },
    );
  }

  const id = randomUUID();
  const storageKey = attachmentStorageKey({
    calendarId: session.calendarId,
    attachmentId: id,
    originalFileName: parsed.data.originalFileName,
  });
  const sql = getSql();

  try {
    await sql\`
      INSERT INTO attachments (
        id, calendar_id, storage_provider, storage_key, original_file_name,
        content_type, size_bytes, category, primary_entity_type, primary_entity_id,
        primary_role, status, uploaded_by
      )
      VALUES (
        ${id}, ${session.calendarId}, 'vercel_blob', ${storageKey},
        ${parsed.data.originalFileName}, ${parsed.data.contentType}, ${parsed.data.sizeBytes},
        ${parsed.data.category}, ${parsed.data.entityType}, ${parsed.data.entityId},
        ${parsed.data.role}, 'pending', ${session.participantId}
      )
    \`;
  } catch {
    return NextResponse.json(
      { error: "The upload could not be prepared." },
      { status: 409 },
    );
  }

  try {
    const signed = await createPrivateUploadUrl({
      pathname: storageKey,
      contentType: parsed.data.contentType,
      maximumSizeInBytes: parsed.data.sizeBytes,
    });

    return NextResponse.json({
      attachmentId: id,
      uploadUrl: signed.url,
      expiresAt: signed.expiresAt,
      contentType: parsed.data.contentType,
    });
  } catch {
    try {
      await sql\`
        DELETE FROM attachments
        WHERE id = ${id}
          AND calendar_id = ${session.calendarId}
          AND status = 'pending'
      \`;
    } catch {}

    return NextResponse.json(
      {
        error:
          "Private file storage is not available yet. Check the Covie Blob storage connection.",
      },
      { status: 503 },
    );
  }
}
