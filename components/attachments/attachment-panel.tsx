"use client";

import {
  Download,
  FileText,
  LoaderCircle,
  Paperclip,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

type AttachmentEntityType = "expense" | "responsibility" | "event" | "child";
type AttachmentCategory =
  | "receipt"
  | "school_form"
  | "medical_letter"
  | "registration"
  | "camp"
  | "insurance"
  | "other";

type AttachmentItem = {
  id: string;
  originalFileName: string;
  contentType: string;
  sizeBytes: number;
  category: AttachmentCategory | "profile_photo";
  role: "supporting" | "profile_photo";
  createdAt: string;
  readyAt: string | null;
  uploadedByName: string | null;
};

type AttachmentPayload = {
  permission: "owner" | "editor" | "viewer";
  attachments: AttachmentItem[];
};

const categoryLabels: Record<AttachmentCategory, string> = {
  receipt: "Receipt",
  school_form: "School form",
  medical_letter: "Medical letter",
  registration: "Registration",
  camp: "Camp information",
  insurance: "Insurance",
  other: "Other",
};

function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function when(value: string) {
  return new Intl.DateTimeFormat("en-NZ", {
    dateStyle: "medium",
  }).format(new Date(value));
}

function contentTypeForFile(file: File) {
  if (file.type) return file.type.toLocaleLowerCase();

  const name = file.name.toLocaleLowerCase();
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".heic")) return "image/heic";
  if (name.endsWith(".heif")) return "image/heif";
  if (name.endsWith(".doc")) return "application/msword";
  if (name.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  return "";
}

export function AttachmentPanel({
  entityType,
  entityId,
  defaultCategory = "other",
  title = "Documents",
  defaultOpen = false,
  compact = false,
}: {
  entityType: AttachmentEntityType;
  entityId: string;
  defaultCategory?: AttachmentCategory;
  title?: string;
  defaultOpen?: boolean;
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const loadedRef = useRef(false);
  const [open, setOpen] = useState(defaultOpen);
  const [data, setData] = useState<AttachmentPayload | null>(null);
  const [category, setCategory] = useState<AttachmentCategory>(defaultCategory);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({
        entityType,
        entityId,
        role: "supporting",
      });
      const response = await fetch(`/api/attachments?${query.toString()}`, {
        cache: "no-store",
      });
      const body = (await response.json().catch(() => null)) as
        | AttachmentPayload
        | { error?: string }
        | null;
      if (!response.ok || !body || !("attachments" in body)) {
        throw new Error(
          body && "error" in body && body.error
            ? body.error
            : "Documents could not be loaded.",
        );
      }
      setData(body);
      loadedRef.current = true;
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Documents could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [entityId, entityType]);

  useEffect(() => {
    if (!open || loadedRef.current) return;
    void load();
  }, [load, open]);

  function toggleOpen() {
    setOpen((current) => !current);
  }

  async function uploadFile(file: File) {
    if (busy) return;
    const contentType = contentTypeForFile(file);
    setBusy(true);
    setError(null);

    let attachmentId: string | null = null;
    try {
      const begin = await fetch("/api/attachments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          entityType,
          entityId,
          role: "supporting",
          category,
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
        throw new Error(beginBody?.error ?? "The upload could not be prepared.");
      }
      attachmentId = beginBody.attachmentId;

      const upload = await fetch(beginBody.uploadUrl, {
        method: "PUT",
        headers: {
          "content-type": beginBody.contentType ?? contentType,
        },
        body: file,
      });
      if (!upload.ok) {
        throw new Error("The file could not be uploaded to private storage.");
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
          finalizeBody?.error ?? "The uploaded file could not be finalized.",
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
        caught instanceof Error ? caught.message : "The file could not be uploaded.",
      );
    } finally {
      if (inputRef.current) inputRef.current.value = "";
      setBusy(false);
    }
  }

  async function download(item: AttachmentItem) {
    const popup = window.open("", "_blank");
    if (popup) popup.opener = null;

    setError(null);
    try {
      const response = await fetch(`/api/attachments/${item.id}/download`, {
        cache: "no-store",
      });
      const body = (await response.json().catch(() => null)) as
        | { url?: string; error?: string }
        | null;
      if (!response.ok || !body?.url) {
        throw new Error(body?.error ?? "The private download could not be opened.");
      }

      if (popup) {
        popup.location.href = body.url;
      } else {
        window.location.assign(body.url);
      }
    } catch (caught) {
      popup?.close();
      setError(
        caught instanceof Error
          ? caught.message
          : "The private download could not be opened.",
      );
    }
  }

  async function remove(item: AttachmentItem) {
    if (busy) return;
    if (!window.confirm(`Remove “${item.originalFileName}” from Covie?`)) return;

    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/attachments/${item.id}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
      });
      const body = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (!response.ok) {
        throw new Error(body?.error ?? "The document could not be removed.");
      }
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "The document could not be removed.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={toggleOpen}
        className={`inline-flex min-h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 ${
          compact ? "" : "mt-3"
        }`}
      >
        <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
        {title}
      </button>
    );
  }

  const editable = data?.permission === "owner" || data?.permission === "editor";
  const items = data?.attachments ?? [];

  return (
    <section
      className={`rounded-2xl border border-slate-200 bg-slate-50/70 ${
        compact ? "mt-2 p-3" : "mt-4 p-4"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Paperclip className="h-4 w-4" aria-hidden="true" />
            {title}
          </p>
          {!compact ? (
            <p className="mt-1 text-xs text-slate-500">
              Private supporting files linked to this item.
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={toggleOpen}
          aria-label={`Close ${title}`}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {loading ? (
        <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
          Loading documents…
        </div>
      ) : null}

      {!loading && items.length === 0 ? (
        <p className="mt-3 text-xs text-slate-500">No documents attached yet.</p>
      ) : null}

      {items.length > 0 ? (
        <div className="mt-3 space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5"
            >
              <FileText className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-slate-800">
                  {item.originalFileName}
                </p>
                <p className="mt-0.5 truncate text-[11px] text-slate-400">
                  {item.category === "profile_photo"
                    ? "Profile photo"
                    : categoryLabels[item.category as AttachmentCategory] ?? "Other"}
                  {" · "}
                  {fileSize(item.sizeBytes)}
                  {" · "}
                  {item.uploadedByName ? `${item.uploadedByName} · ` : ""}
                  {when(item.readyAt ?? item.createdAt)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void download(item)}
                aria-label={`Open ${item.originalFileName}`}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
              </button>
              {editable ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void remove(item)}
                  aria-label={`Remove ${item.originalFileName}`}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-rose-500 hover:bg-rose-50 disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {editable ? (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <select
            value={category}
            disabled={busy}
            aria-label="Document type"
            onChange={(event) =>
              setCategory(event.target.value as AttachmentCategory)
            }
            className="min-h-10 rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 outline-none focus:border-slate-500"
          >
            {(Object.keys(categoryLabels) as AttachmentCategory[]).map((value) => (
              <option key={value} value={value}>
                {categoryLabels[value]}
              </option>
            ))}
          </select>
          <input
            ref={inputRef}
            type="file"
            className="sr-only"
            accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,.doc,.docx,application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void uploadFile(file);
            }}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="covie-primary-action inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-3 text-xs disabled:opacity-50"
          >
            {busy ? (
              <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Plus className="h-4 w-4" aria-hidden="true" />
            )}
            Add file
          </button>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 text-xs text-rose-700">
          {error}
        </p>
      ) : null}
    </section>
  );
}
