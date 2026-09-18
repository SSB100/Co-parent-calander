import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import type { CalendarApprovalPermission } from "@/lib/approvals/types";
import {
  createPrivateDownloadUrl,
  createPrivateUploadUrl,
  privateBlobMetadata,
} from "@/lib/attachments/blob";
import { processStorageCleanupAfterResponse } from "@/lib/attachments/dispatch";
import {
  attachmentStorageKey,
  assertAttachmentTarget,
  type AttachmentBeginInput,
  type AttachmentTargetInput,
} from "@/lib/attachments/model";
import { getDb, getSql } from "@/lib/db";
import {
  attachmentLinks,
  attachments,
  participants,
} from "@/lib/db/schema";

export type AttachmentReadSession = {
  calendarId: string;
  participantId: string | null;
  permission: CalendarApprovalPermission;
};

export type AttachmentWriteSession = AttachmentReadSession & {
  participantId: string;
};

export class AttachmentServiceError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "AttachmentServiceError";
  }
}

async function assertTarget(
  calendarId: string,
  target: Pick<AttachmentTargetInput, "entityType" | "entityId">,
) {
  try {
    await assertAttachmentTarget(calendarId, target);
  } catch (error) {
    throw new AttachmentServiceError(
      404,
      error instanceof Error ? error.message : "Attachment target not found.",
    );
  }
}

async function loadAttachment(calendarId: string, id: string) {
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
    .where(
      and(
        eq(attachments.calendarId, calendarId),
        eq(attachments.id, id),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}

export async function listAttachments(input: {
  session: AttachmentReadSession;
  target: AttachmentTargetInput;
}) {
  const { session, target } = input;
  await assertTarget(session.calendarId, target);

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
    .innerJoin(
      attachments,
      eq(attachmentLinks.attachmentId, attachments.id),
    )
    .leftJoin(
      participants,
      eq(attachments.uploadedBy, participants.id),
    )
    .where(
      and(
        eq(attachmentLinks.calendarId, session.calendarId),
        eq(attachmentLinks.entityType, target.entityType),
        eq(attachmentLinks.entityId, target.entityId),
        eq(attachmentLinks.role, target.role),
        eq(attachments.status, "ready"),
      ),
    )
    .orderBy(asc(attachments.createdAt));

  return {
    permission: session.permission,
    attachments: rows,
  };
}

export async function prepareAttachmentUpload(input: {
  session: AttachmentWriteSession;
  attachment: AttachmentBeginInput;
}) {
  const { session, attachment } = input;
  await assertTarget(session.calendarId, attachment);

  const id = randomUUID();
  const storageKey = attachmentStorageKey({
    calendarId: session.calendarId,
    attachmentId: id,
    originalFileName: attachment.originalFileName,
  });
  const sql = getSql();

  try {
    await sql`
      INSERT INTO attachments (
        id, calendar_id, storage_provider, storage_key, original_file_name,
        content_type, size_bytes, category, primary_entity_type, primary_entity_id,
        primary_role, status, uploaded_by
      )
      VALUES (
        ${id}, ${session.calendarId}, 'vercel_blob', ${storageKey},
        ${attachment.originalFileName}, ${attachment.contentType},
        ${attachment.sizeBytes}, ${attachment.category},
        ${attachment.entityType}, ${attachment.entityId},
        ${attachment.role}, 'pending', ${session.participantId}
      )
    `;
  } catch {
    throw new AttachmentServiceError(
      409,
      "The upload could not be prepared.",
    );
  }

  try {
    const signed = await createPrivateUploadUrl({
      pathname: storageKey,
      contentType: attachment.contentType,
      maximumSizeInBytes: attachment.sizeBytes,
    });

    return {
      attachmentId: id,
      uploadUrl: signed.url,
      expiresAt: signed.expiresAt,
      contentType: attachment.contentType,
    };
  } catch {
    try {
      await sql`
        DELETE FROM attachments
        WHERE id = ${id}
          AND calendar_id = ${session.calendarId}
          AND status = 'pending'
      `;
    } catch {}

    throw new AttachmentServiceError(
      503,
      "Private file storage is not available yet. Check the Covie Blob storage connection.",
    );
  }
}

export async function finalizeAttachment(input: {
  session: AttachmentWriteSession;
  attachmentId: string;
}) {
  const { session, attachmentId } = input;
  const attachment = await loadAttachment(
    session.calendarId,
    attachmentId,
  );

  if (!attachment) {
    throw new AttachmentServiceError(404, "Attachment not found.");
  }
  if (attachment.status === "ready") {
    return { ok: true as const, attachmentId: attachment.id };
  }

  await assertTarget(session.calendarId, {
    entityType: attachment.primaryEntityType,
    entityId: attachment.primaryEntityId,
  });

  let metadata: Awaited<ReturnType<typeof privateBlobMetadata>>;
  try {
    metadata = await privateBlobMetadata(attachment.storageKey);
  } catch {
    throw new AttachmentServiceError(
      409,
      "The uploaded file could not be verified in private storage.",
    );
  }

  if (
    metadata.pathname !== attachment.storageKey ||
    metadata.size !== attachment.sizeBytes ||
    metadata.contentType.toLocaleLowerCase() !==
      attachment.contentType.toLocaleLowerCase()
  ) {
    throw new AttachmentServiceError(
      409,
      "The uploaded file did not match the authorized file details.",
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
          .innerJoin(
            attachments,
            eq(attachmentLinks.attachmentId, attachments.id),
          )
          .where(
            and(
              eq(attachmentLinks.calendarId, session.calendarId),
              eq(attachmentLinks.entityType, "child"),
              eq(
                attachmentLinks.entityId,
                attachment.primaryEntityId,
              ),
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

  if (attachment.primaryEntityType === "child") {
    statements.push(sql`
      INSERT INTO audit_log (
        calendar_id, actor_participant_id, action, entity_type,
        entity_id, after_state
      )
      VALUES (
        ${session.calendarId},
        ${session.participantId},
        ${attachment.primaryRole === "profile_photo"
          ? "child_profile.photo_update"
          : "child_profile.document_add"},
        'child_profile',
        ${attachment.primaryEntityId},
        ${JSON.stringify({
          attachmentId: attachment.id,
          fileName: attachment.originalFileName,
          category: attachment.category,
        })}::jsonb
      )
    `);
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
        ${session.calendarId},
        ${attachment.id},
        ${attachment.primaryEntityType}::attachment_entity_type,
        ${attachment.primaryEntityId},
        ${attachment.primaryRole}::attachment_role
      )
    `,
    sql`
      INSERT INTO audit_log (
        calendar_id, actor_participant_id, action, entity_type,
        entity_id, after_state
      )
      VALUES (
        ${session.calendarId},
        ${session.participantId},
        'attachment.upload',
        'attachment',
        ${attachment.id},
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
    throw new AttachmentServiceError(
      409,
      "The attachment could not be finalized.",
    );
  }

  processStorageCleanupAfterResponse(
    oldPhotoRows
      .filter((old) => old.attachmentId !== attachment.id)
      .map((old) => old.storageKey),
  );

  return { ok: true as const, attachmentId: attachment.id };
}

export async function deleteAttachment(input: {
  session: AttachmentWriteSession;
  attachmentId: string;
}) {
  const { session, attachmentId } = input;
  const attachment = await loadAttachment(
    session.calendarId,
    attachmentId,
  );

  if (!attachment) {
    throw new AttachmentServiceError(404, "Attachment not found.");
  }

  const sql = getSql();
  const statements = [
    sql`
      DELETE FROM attachments
      WHERE id = ${attachment.id}
        AND calendar_id = ${session.calendarId}
    `,
    sql`
      INSERT INTO audit_log (
        calendar_id, actor_participant_id, action, entity_type,
        entity_id, before_state
      )
      VALUES (
        ${session.calendarId},
        ${session.participantId},
        'attachment.delete',
        'attachment',
        ${attachment.id},
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
  ];

  if (
    attachment.primaryEntityType === "child" &&
    attachment.status === "ready"
  ) {
    statements.push(sql`
      INSERT INTO audit_log (
        calendar_id, actor_participant_id, action, entity_type,
        entity_id, before_state
      )
      VALUES (
        ${session.calendarId},
        ${session.participantId},
        ${attachment.primaryRole === "profile_photo"
          ? "child_profile.photo_remove"
          : "child_profile.document_remove"},
        'child_profile',
        ${attachment.primaryEntityId},
        ${JSON.stringify({
          attachmentId: attachment.id,
          fileName: attachment.originalFileName,
          category: attachment.category,
        })}::jsonb
      )
    `);
  }

  try {
    await sql.transaction(statements);
  } catch {
    throw new AttachmentServiceError(
      409,
      "The attachment could not be removed.",
    );
  }

  processStorageCleanupAfterResponse([attachment.storageKey]);

  return { ok: true as const };
}

export async function getAttachmentDownload(input: {
  session: AttachmentReadSession;
  attachmentId: string;
}) {
  const rows = await getDb()
    .select({
      id: attachments.id,
      storageKey: attachments.storageKey,
      originalFileName: attachments.originalFileName,
    })
    .from(attachments)
    .where(
      and(
        eq(attachments.id, input.attachmentId),
        eq(attachments.calendarId, input.session.calendarId),
        eq(attachments.status, "ready"),
      ),
    )
    .limit(1);

  const attachment = rows[0];
  if (!attachment) {
    throw new AttachmentServiceError(404, "Attachment not found.");
  }

  try {
    const signed = await createPrivateDownloadUrl(
      attachment.storageKey,
    );

    return {
      url: signed.url,
      expiresAt: signed.expiresAt,
      fileName: attachment.originalFileName,
    };
  } catch {
    throw new AttachmentServiceError(
      503,
      "The private download link could not be created.",
    );
  }
}
