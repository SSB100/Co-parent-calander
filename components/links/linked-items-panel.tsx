"use client";

import {
  CalendarDays,
  CheckSquare2,
  ChevronRight,
  CircleDollarSign,
  FileText,
  Link2,
  LoaderCircle,
  Plus,
  Unlink,
  UsersRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type LinkedEntityType = "event" | "expense" | "responsibility" | "child";
type RelatedTargetType = LinkedEntityType | "attachment";

type RelatedItem = {
  type: RelatedTargetType;
  id: string;
  title: string;
  subtitle: string | null;
  href: string | null;
  origin: "explicit" | "native" | "document";
  removable: boolean;
};

type Candidate = {
  type: RelatedTargetType;
  id: string;
  title: string;
  subtitle: string | null;
  href: string | null;
};

type Payload = {
  permission: "owner" | "editor" | "viewer";
  items: RelatedItem[];
  candidates?: Candidate[];
};

const typeLabels: Record<RelatedTargetType, string> = {
  event: "Event",
  expense: "Expense",
  responsibility: "Responsibility",
  child: "Child",
  attachment: "Document",
};

function icon(type: RelatedTargetType) {
  if (type === "event") return <CalendarDays className="h-4 w-4" aria-hidden="true" />;
  if (type === "expense") return <CircleDollarSign className="h-4 w-4" aria-hidden="true" />;
  if (type === "responsibility") return <CheckSquare2 className="h-4 w-4" aria-hidden="true" />;
  if (type === "child") return <UsersRound className="h-4 w-4" aria-hidden="true" />;
  return <FileText className="h-4 w-4" aria-hidden="true" />;
}

function key(type: RelatedTargetType, id: string) {
  return `${type}:${id}`;
}

async function fetchRelatedItems(
  entityType: LinkedEntityType,
  entityId: string,
  includeCandidates = false,
) {
  const query = new URLSearchParams({
    entityType,
    entityId,
    includeCandidates: includeCandidates ? "true" : "false",
  });
  const response = await fetch(`/api/links?${query.toString()}`, {
    cache: "no-store",
  });
  const body = (await response.json().catch(() => null)) as
    | Payload
    | { error?: string }
    | null;

  if (!response.ok || !body || !("items" in body)) {
    throw new Error(
      body && "error" in body && body.error
        ? body.error
        : "Related items could not be loaded.",
    );
  }

  return body;
}

export function LinkedItemsPanel({
  entityType,
  entityId,
  title = "Related",
  compact = false,
  defaultOpen = false,
}: {
  entityType: LinkedEntityType;
  entityId: string;
  title?: string;
  compact?: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [data, setData] = useState<Payload | null>(null);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [filter, setFilter] = useState<RelatedTargetType | "all">("all");
  const [loading, setLoading] = useState(defaultOpen);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (includeCandidates = false) => {
    const body = await fetchRelatedItems(entityType, entityId, includeCandidates);
    setData(body);
    if (includeCandidates) setCandidates(body.candidates ?? []);
    setError(null);
    return body;
  }, [entityId, entityType]);

  useEffect(() => {
    if (!open || data) return;
    let cancelled = false;
    void fetchRelatedItems(entityType, entityId)
      .then((body) => {
        if (cancelled) return;
        setData(body);
        setError(null);
      })
      .catch((caught) => {
        if (cancelled) return;
        setError(
          caught instanceof Error
            ? caught.message
            : "Related items could not be loaded.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [data, entityId, entityType, open]);

  const editable = data?.permission === "owner" || data?.permission === "editor";
  const linkedKeys = useMemo(
    () => new Set((data?.items ?? []).map((item) => key(item.type, item.id))),
    [data?.items],
  );

  const available = useMemo(() => {
    const rows = (candidates ?? []).filter(
      (candidate) => !linkedKeys.has(key(candidate.type, candidate.id)),
    );
    if (filter === "all") return rows;
    return rows.filter((candidate) => candidate.type === filter);
  }, [candidates, filter, linkedKeys]);

  async function openPicker() {
    setPickerOpen(true);
    setLoading(true);
    setError(null);
    try {
      await load(true);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Related items could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function createLink(candidate: Candidate) {
    const candidateKey = key(candidate.type, candidate.id);
    if (busyKey) return;
    setBusyKey(candidateKey);
    setError(null);
    try {
      const response = await fetch("/api/links", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          entityType,
          entityId,
          targetType: candidate.type,
          targetId: candidate.id,
        }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(body?.error ?? "The related item could not be linked.");
      }
      await load(true);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The related item could not be linked.",
      );
    } finally {
      setBusyKey(null);
    }
  }

  async function removeLink(item: RelatedItem) {
    const itemKey = key(item.type, item.id);
    if (!item.removable || busyKey) return;
    setBusyKey(itemKey);
    setError(null);
    try {
      const response = await fetch("/api/links", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          entityType,
          entityId,
          targetType: item.type,
          targetId: item.id,
        }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(body?.error ?? "The related item could not be unlinked.");
      }
      await load(pickerOpen);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The related item could not be unlinked.",
      );
    } finally {
      setBusyKey(null);
    }
  }

  async function openDocument(item: RelatedItem) {
    setError(null);
    const popup = window.open("", "_blank");
    if (popup) popup.opener = null;
    try {
      const response = await fetch(`/api/attachments/${item.id}/download`, {
        cache: "no-store",
      });
      const body = (await response.json().catch(() => null)) as
        | { url?: string; error?: string }
        | null;
      if (!response.ok || !body?.url) {
        throw new Error(body?.error ?? "The private document could not be opened.");
      }
      if (popup) popup.location.href = body.url;
      else window.location.assign(body.url);
    } catch (caught) {
      popup?.close();
      setError(
        caught instanceof Error
          ? caught.message
          : "The private document could not be opened.",
      );
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setLoading(true);
          setOpen(true);
        }}
        className={`inline-flex min-h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 ${
          compact ? "" : "mt-3"
        }`}
      >
        <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
        {title}
      </button>
    );
  }

  const items = data?.items ?? [];

  return (
    <section
      className={`rounded-2xl border border-slate-200 bg-slate-50/70 ${
        compact ? "mt-2 p-3" : "mt-4 p-4"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Link2 className="h-4 w-4" aria-hidden="true" />
            {title}
          </p>
          {!compact ? (
            <p className="mt-1 text-xs text-slate-500">
              Keep the parts of the same real-life situation connected.
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setPickerOpen(false);
          }}
          aria-label={`Close ${title}`}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {loading && !data ? (
        <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
          Loading related items…
        </div>
      ) : null}

      {!loading && data && items.length === 0 ? (
        <p className="mt-3 text-xs text-slate-500">Nothing linked yet.</p>
      ) : null}

      {items.length > 0 ? (
        <div className="mt-3 space-y-2">
          {items.map((item) => {
            const content = (
              <>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                  {icon(item.type)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-slate-800">
                    {item.title}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-slate-400">
                    {typeLabels[item.type]}
                    {item.subtitle ? ` · ${item.subtitle}` : ""}
                  </span>
                </span>
              </>
            );

            return (
              <div
                key={key(item.type, item.id)}
                className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-2"
              >
                {item.type === "attachment" ? (
                  <button
                    type="button"
                    onClick={() => void openDocument(item)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left hover:opacity-80"
                  >
                    {content}
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" aria-hidden="true" />
                  </button>
                ) : item.href ? (
                  <Link
                    href={item.href}
                    className="flex min-w-0 flex-1 items-center gap-3 hover:opacity-80"
                  >
                    {content}
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" aria-hidden="true" />
                  </Link>
                ) : (
                  <div className="flex min-w-0 flex-1 items-center gap-3">{content}</div>
                )}

                {editable && item.removable ? (
                  <button
                    type="button"
                    disabled={busyKey === key(item.type, item.id)}
                    onClick={() => void removeLink(item)}
                    aria-label={`Unlink ${item.title}`}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                  >
                    {busyKey === key(item.type, item.id) ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Unlink className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {editable ? (
        <div className="mt-3">
          {!pickerOpen ? (
            <button
              type="button"
              onClick={() => void openPicker()}
              className="covie-primary-action inline-flex min-h-9 items-center gap-2 rounded-xl px-3 text-xs"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Link existing
            </button>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex flex-wrap gap-1.5">
                {(["all", ...Object.keys(typeLabels)] as Array<
                  RelatedTargetType | "all"
                >).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setFilter(value)}
                    className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold ${
                      filter === value
                        ? "bg-[#DDD3FA] text-[#243139] ring-1 ring-[#765ED6]"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {value === "all" ? "All" : typeLabels[value]}
                  </button>
                ))}
              </div>

              <div className="mt-3 max-h-64 space-y-1 overflow-y-auto">
                {loading && candidates === null ? (
                  <div className="flex items-center gap-2 px-2 py-3 text-xs text-slate-500">
                    <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Loading options…
                  </div>
                ) : available.length === 0 ? (
                  <p className="px-2 py-3 text-xs text-slate-500">
                    No other items to link in this category.
                  </p>
                ) : (
                  available.map((candidate) => (
                    <button
                      key={key(candidate.type, candidate.id)}
                      type="button"
                      disabled={Boolean(busyKey)}
                      onClick={() => void createLink(candidate)}
                      className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-slate-50 disabled:opacity-50"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                        {icon(candidate.type)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-semibold text-slate-800">
                          {candidate.title}
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] text-slate-400">
                          {typeLabels[candidate.type]}
                          {candidate.subtitle ? ` · ${candidate.subtitle}` : ""}
                        </span>
                      </span>
                      {busyKey === key(candidate.type, candidate.id) ? (
                        <LoaderCircle className="h-4 w-4 animate-spin text-slate-400" aria-hidden="true" />
                      ) : (
                        <Plus className="h-4 w-4 text-slate-400" aria-hidden="true" />
                      )}
                    </button>
                  ))
                )}
              </div>

              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                className="mt-3 text-xs font-semibold text-slate-500 hover:text-slate-700"
              >
                Done
              </button>
            </div>
          )}
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
