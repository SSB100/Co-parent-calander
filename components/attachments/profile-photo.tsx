"use client";

import { Camera, LoaderCircle, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { CovieConfirmDialog } from "@/components/ui/covie";

type PhotoItem = {
  id: string;
  originalFileName: string;
};

type PhotoPayload = {
  permission: "owner" | "editor" | "viewer";
  attachments: PhotoItem[];
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function contentTypeForFile(file: File) {
  if (file.type) return file.type.toLocaleLowerCase();
  const name = file.name.toLocaleLowerCase();
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".heic")) return "image/heic";
  if (name.endsWith(".heif")) return "image/heif";
  return "";
}

async function fetchProfilePhoto(childId: string) {
  const query = new URLSearchParams({
    entityType: "child",
    entityId: childId,
    role: "profile_photo",
  });
  const response = await fetch(`/api/attachments?${query.toString()}`, {
    cache: "no-store",
  });
  const body = (await response.json().catch(() => null)) as
    | PhotoPayload
    | { error?: string }
    | null;
  if (!response.ok || !body || !("attachments" in body)) {
    throw new Error(
      body && "error" in body && body.error
        ? body.error
        : "Profile photo could not be loaded.",
    );
  }

  const photo = body.attachments[0] ?? null;
  if (!photo) return { payload: body, photoUrl: null as string | null };

  const download = await fetch(`/api/attachments/${photo.id}/download`, {
    cache: "no-store",
  });
  const downloadBody = (await download.json().catch(() => null)) as
    | { url?: string; error?: string }
    | null;
  if (!download.ok || !downloadBody?.url) {
    throw new Error(downloadBody?.error ?? "Profile photo could not be opened.");
  }

  return { payload: body, photoUrl: downloadBody.url };
}

export function ProfilePhoto({
  childId,
  displayName,
}: {
  childId: string;
  displayName: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [payload, setPayload] = useState<PhotoPayload | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoFailed, setPhotoFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);

  const load = useCallback(async () => {
    const result = await fetchProfilePhoto(childId);
    setPayload(result.payload);
    setPhotoUrl(result.photoUrl);
    setPhotoFailed(false);
    setError(null);
  }, [childId]);

  useEffect(() => {
    let cancelled = false;
    void fetchProfilePhoto(childId)
      .then((result) => {
        if (cancelled) return;
        setPayload(result.payload);
        setPhotoUrl(result.photoUrl);
        setPhotoFailed(false);
        setError(null);
      })
      .catch((caught) => {
        if (cancelled) return;
        setError(
          caught instanceof Error
            ? caught.message
            : "Profile photo could not be loaded.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [childId]);

  async function upload(file: File) {
    if (busy) return;
    setBusy(true);
    setError(null);
    let attachmentId: string | null = null;

    try {
      const contentType = contentTypeForFile(file);
      const begin = await fetch("/api/attachments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          entityType: "child",
          entityId: childId,
          role: "profile_photo",
          category: "profile_photo",
          originalFileName: file.name,
          contentType,
          sizeBytes: file.size,
        }),
      });
      const beginBody = (await begin.json().catch(() => null)) as
        | {
            attachmentId?: string;
            uploadUrl?: string;
            contentType?: string;
            error?: string;
          }
        | null;
      if (!begin.ok || !beginBody?.attachmentId || !beginBody.uploadUrl) {
        throw new Error(beginBody?.error ?? "The photo upload could not be prepared.");
      }
      attachmentId = beginBody.attachmentId;

      const uploadResponse = await fetch(beginBody.uploadUrl, {
        method: "PUT",
        headers: { "content-type": beginBody.contentType ?? contentType },
        body: file,
      });
      if (!uploadResponse.ok) {
        throw new Error("The photo could not be uploaded to private storage.");
      }

      const finalize = await fetch(`/api/attachments/${attachmentId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      const finalizeBody = (await finalize.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (!finalize.ok) {
        throw new Error(
          finalizeBody?.error ?? "The uploaded photo could not be finalized.",
        );
      }

      await load();
    } catch (caught) {
      if (attachmentId) {
        void fetch(`/api/attachments/${attachmentId}`, {
          method: "DELETE",
          headers: { "content-type": "application/json" },
        }).catch(() => undefined);
      }
      setError(
        caught instanceof Error ? caught.message : "The photo could not be uploaded.",
      );
    } finally {
      if (inputRef.current) inputRef.current.value = "";
      setBusy(false);
    }
  }

  async function remove() {
    const photo = payload?.attachments[0];
    if (!photo || busy) return;

    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/attachments/${photo.id}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
      });
      const body = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (!response.ok) {
        throw new Error(body?.error ?? "The profile photo could not be removed.");
      }
      setRemoveOpen(false);
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The profile photo could not be removed.",
      );
    } finally {
      setBusy(false);
    }
  }

  const editable =
    payload?.permission === "owner" || payload?.permission === "editor";
  const hasPhoto = Boolean(photoUrl && !photoFailed);

  return (
    <div className="flex shrink-0 flex-col items-center gap-2">
      <div className="relative">
        <div className="flex h-16 w-16 overflow-hidden rounded-2xl border-2 border-[#243139] bg-[#DDD3FA] text-lg font-bold text-[#243139] shadow-[3px_3px_0_#765ED6]">
          {hasPhoto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoUrl ?? ""}
              alt={`${displayName} profile`}
              className="h-full w-full object-cover"
              onError={() => setPhotoFailed(true)}
            />
          ) : (
            <span className="m-auto">{initials(displayName) || "C"}</span>
          )}
        </div>
        {busy ? (
          <span className="absolute inset-0 flex items-center justify-center rounded-2xl bg-[#765ED6]/70 text-white">
            <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
          </span>
        ) : null}
      </div>

      {editable ? (
        <div className="flex gap-1">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif"
            className="sr-only"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
            }}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            aria-label={hasPhoto ? "Replace profile photo" : "Add profile photo"}
            className="covie-icon-button flex h-11 w-11 items-center justify-center rounded-[10px] disabled:opacity-50"
          >
            <Camera className="h-4 w-4" aria-hidden="true" />
          </button>
          {payload?.attachments[0] ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => setRemoveOpen(true)}
              aria-label="Remove profile photo"
              className="flex h-11 w-11 items-center justify-center rounded-[10px] border border-[#A23F39] bg-[#FBECE8] text-[#A23F39] hover:bg-[#F7D8D2] disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      ) : null}

      <CovieConfirmDialog
        open={removeOpen}
        id="remove-profile-photo-title"
        title="Remove profile photo?"
        description="Remove this child profile photo from Covie?"
        confirmLabel="Remove photo"
        busy={busy}
        icon={<Trash2 aria-hidden="true" />}
        onCancel={() => {
          if (!busy) setRemoveOpen(false);
        }}
        onConfirm={() => void remove()}
      />

      {error ? (
        <span className="max-w-40 text-center text-[11px] leading-4 text-[#A23F39]">
          {error}
        </span>
      ) : null}
    </div>
  );
}
