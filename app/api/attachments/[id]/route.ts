import { after, NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import {
  assertAttachmentTarget,
} from "@/lib/attachments/model";
import {
  deletePrivateBlob,
  privateBlobMetadata,
} from "@/lib/attachments/blob";
import { getDb, getSql } from "@/lib/db";
import {
  attachmentLinks,
  attachments,
} from "@/lib/db/schema";
import { isSameOriginMutation } from "@/lib/security/request";
import { getEditorSession } from "@/lib/security/session";

type RouteContext = {
  params: Promise<{ id: string }>;
};

async function attachmentForEditor(calendarId: string, id: string) {
  const rows = await getDb()
    .select({
      id: attachments.id,
      storageKey: attachments.storageKey,
      originalFileName: attachments.originalFileName,
      contentType: attachments.contentType,
      sizeBytes: attachments.sizeBytes,
      category: attachments.category,
      status: attachments.status,
      primaryEntityType: attachments.primaryEntityType,
      primaryEntityId: attachments.primaryEntityId,
      primaryRole: attachments.primaryRole,
    })
    .from(attachments)
    .where(and(eq(attachments.calendarId, calendarId), eq(attachments.id, id)))
    .limit(1);
  return rows[0] ?? null;
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ error: "This request was blocked for safety." }, { status: 403 });
  }

  const session = await getEditorSession();
  if (!session) {
    return NextResponse.json({ error: "Editor access is required." }, { status: 401 });
  }

  const id = (await context.params).id;
  const attachment = await attachmentForEditor(session.calendarId, id);
  if (!attachment) {
    return NextResponse.json({ error: "Attachment not found." }, { status: 404 });
  }
  if (attachment.status === "ready") {
    return NextResponse.json({ ok: true, attachmentId: attachment.id });
  }

  try {
    await assertAttachmentTarget(session.calendarId, {
      entityType: attachment.primaryEntityType,
      entityId: attachment.primaryEntityId,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Attachment target not found." },
      { status: 404 },
    );
  }

  let metadata: Awaited<ReturnType<typeof privateBlobMetadata>>;
  try {
    metadata = await privateBlobMetadata(attachment.storageKey);
  } catch {
    return NextResponse.json(
      { error: "The uploaded file could not be verified in private storage." },
      { status: 409 },
    );
  }

  if (
    metadata.pathname !== attachment.storageKey ||
    metadata.size !== attachment.sizeBytes ||
    metadata.contentType.toLocaleLowerCase() !==
      attachment.contentType.toLocaleLowerCase()
  ) {
    return NextResponse.json(
      { error: "The uploaded file did not match the authorized file details." },
      { status: 409 },
    );
  }

  const oldPhotoRows =
    attachment.primaryEntityType === "child" &&
    attachment.primaryRole === "profile_photo"
      ? await getDb()
          .select({
            attachmentId: attachments.id,
            storageKey: attachments.storageKey,
          })
          .from(attachmentLinks)
          .innerJoin(attachments, eq(attachmentLinks.attachmentId, attachments.id))
          .where(
            and(
              eq(attachmentLinks.calendarId, session.calendarId),
              eq(attachmentLinks.entityType, "child"),
              eq(attachmentLinks.entityId, attachment.primaryEntityId),
              eq(attachmentLinks.role, "profile_photo"),
              eq(attachments.status, "ready"),
            ),
          )
      : [];

  const sql = getSql();
  const statements = [];

  for (const old of oldPhotoRows) {
    if (old.attachmentId !== attachment.id) {
      statements.push(sql`
        DELETE FROM attachments
        WHERE id = ${old.attachmentId}
          AND calendar_id = ${session.calendarId}
      `);
    }
  }

  statements.push(
    sql`
      UPDATE attachments
      SET status = 'ready', ready_at = now(), updated_at = now()
      WHERE id = ${attachment.id}
        AND calendar_id = ${session.calendarId}
        AND status = 'pending'
    `,
    sql`
      INSERT INTO attachment_links (
        calendar_id, attachment_id, entity_type, entity_id, role
      )
      VALUES (
        ${session.calendarId}, ${attachment.id},
        ${attachment.primaryEntityType}::attachment_entity_type,
        ${attachment.primaryEntityId},
        ${attachment.primaryRole}::attachment_role
      )
    `,
    sql`
      INSERT INTO audit_log (
        calendar_id, actor_participant_id, action, entity_type, entity_id, after_state
      )
      VALUES (
        ${session.calendarId}, ${session.participantId},
        'attachment.upload', 'attachment', ${attachment.id},
        ${JSON.stringify({
          fileName: attachment.originalFileName,
          contentType: attachment.contentType,
          sizeBytes: attachment.sizeBytes,
          category: attachment.category,
          targetEntityType: attachment.primaryEntityType,
          targetEntityId: attachment.primaryEntityId,
          role: attachment.primaryRole,
        })}::jsonb
      )
    `,
  );

  try {
    await sql.transaction(statements);
  } catch {
    return NextResponse.json(
      { error: "The attachment could not be finalized." },
      { status: 409 },
    );
  }

  for (const old of oldPhotoRows) {
    if (old.attachmentId === attachment.id) continue;
    after(async () => {
      try {
        await deletePrivateBlob(old.storageKey);
      } catch {}
    });
  }

  return NextResponse.json({ ok: true, attachmentId: attachment.id });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ error: "This request was blocked for safety." }, { status: 403 });
  }

  const session = await getEditorSession();
  if (!session) {
    return NextResponse.json({ error: "Editor access is required." }, { status: 401 });
  }

  const id = (await context.params).id;
  const attachment = await attachmentForEditor(session.calendarId, id);
  if (!attachment) {
    return NextResponse.json({ error: "Attachment not found." }, { status: 404 });
  }

  const sql = getSql();
  try {
    await sql.transaction([
      sql`
        DELETE FROM attachments
        WHERE id = ${attachment.id}
          AND calendar_id = ${session.calendarId}
      `,
      sql`
        INSERT INTO audit_log (
          calendar_id, actor_participant_id, action, entity_type, entity_id, before_state
        )
        VALUES (
          ${session.calendarId}, ${session.participantId},
          'attachment.delete', 'attachment', ${attachment.id},
          ${JSON.stringify({
            fileName: attachment.originalFileName,
            contentType: attachment.contentType,
            sizeBytes: attachment.sizeBytes,
            category: attachment.category,
            targetEntityType: attachment.primaryEntityType,
            targetEntityId: attachment.primaryEntityId,
            role: attachment.primaryRole,
            status: attachment.status,
          })}::jsonb
        )
      `,
    ]);
  } catch {
    return NextResponse.json(
      { error: "The attachment could not be removed." },
      { status: 409 },
    );
  }

  after(async () => {
    try {
      await deletePrivateBlob(attachment.storageKey);
    } catch {}
  });

  return NextResponse.json({ ok: true });
}
