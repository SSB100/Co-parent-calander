"use client";

import { Bell, LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  CovieEmptyState,
  CovieNotice,
  CovieStatusBadge,
} from "@/components/ui/covie";

type RosterUpdate = {
  id: string;
  memberId: string;
  memberName: string;
  kind: "published" | "shift_added" | "shift_removed" | "shift_changed" | string;
  title: string;
  beforeSummary: string | null;
  afterSummary: string | null;
  createdAt: string;
  weekStart: string;
};

type UpdatesPayload = {
  currentMemberId: string;
  currentAccessRole: "owner" | "manager" | "staff";
  canManageRoster: boolean;
  updates: RosterUpdate[];
};

function statusTone(kind: string) {
  if (kind === "published" || kind === "shift_added") return "teal" as const;
  if (kind === "shift_changed") return "sunshine" as const;
  return "neutral" as const;
}

function statusLabel(kind: string) {
  if (kind === "published") return "Published";
  if (kind === "shift_added") return "Added";
  if (kind === "shift_removed") return "Removed";
  if (kind === "shift_changed") return "Changed";
  return "Update";
}

function timestamp(value: string) {
  return new Intl.DateTimeFormat("en-NZ", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function StaffRosterUpdatesPage() {
  const [data, setData] = useState<UpdatesPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/staff-roster/updates", {
      cache: "no-store",
    });
    const body = (await response.json().catch(() => null)) as
      | UpdatesPayload
      | { error?: string }
      | null;

    if (!response.ok || !body || !("updates" in body)) {
      throw new Error(
        body && "error" in body && body.error
          ? body.error
          : "Roster updates could not be loaded.",
      );
    }

    setData(body);
    setError(null);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh().catch((caught) =>
        setError(
          caught instanceof Error
            ? caught.message
            : "Roster updates could not be loaded.",
        ),
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  if (error) {
    return (
      <CovieNotice tone="danger" role="alert">
        {error}
      </CovieNotice>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-40 items-center justify-center rounded-2xl border border-[#E6DBCF] bg-white text-sm text-[#66747A]">
        <LoaderCircle className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
        Loading updates…
      </div>
    );
  }

  if (data.updates.length === 0) {
    return (
      <CovieEmptyState
        icon={<Bell className="h-8 w-8 text-[#19A897]" aria-hidden="true" />}
        title="No roster updates yet"
        description={
          data.canManageRoster
            ? "Published roster changes will appear here after you send them."
            : "Published changes to your roster will appear here."
        }
      />
    );
  }

  return (
    <div className="space-y-3">
      {data.updates.map((update) => (
        <article
          key={update.id}
          className="rounded-2xl border border-[#E6DBCF] bg-white p-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              {data.canManageRoster ? (
                <span className="text-xs font-extrabold uppercase tracking-[0.06em] text-[#0D7A6D]">
                  {update.memberName}
                </span>
              ) : null}
              <h2 className="mt-1 font-[family-name:var(--font-fraunces)] text-lg font-bold text-[#243139]">
                {update.title}
              </h2>
              <p className="mt-1 text-xs font-bold text-[#66747A]">
                {timestamp(update.createdAt)}
              </p>
            </div>
            <CovieStatusBadge tone={statusTone(update.kind)}>
              {statusLabel(update.kind)}
            </CovieStatusBadge>
          </div>

          {update.beforeSummary || update.afterSummary ? (
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {update.beforeSummary ? (
                <div className="rounded-xl bg-[#FFF9F2] p-3">
                  <span className="text-[11px] font-extrabold uppercase tracking-[0.05em] text-[#8B7D70]">
                    Before
                  </span>
                  <strong className="mt-1 block text-sm text-[#243139]">
                    {update.beforeSummary}
                  </strong>
                </div>
              ) : null}
              {update.afterSummary ? (
                <div className="rounded-xl bg-[#EAF8F5] p-3">
                  <span className="text-[11px] font-extrabold uppercase tracking-[0.05em] text-[#0D7A6D]">
                    {update.kind === "published" ? "Roster" : "Now"}
                  </span>
                  <strong className="mt-1 block text-sm text-[#243139]">
                    {update.afterSummary}
                  </strong>
                </div>
              ) : null}
            </div>
          ) : null}
        </article>
      ))}
    </div>
  );
}
