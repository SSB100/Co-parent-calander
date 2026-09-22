"use client";

import {
  Check,
  Copy,
  KeyRound,
  LoaderCircle,
  ShieldCheck,
  UserPlus,
  UsersRound,
  X,
} from "lucide-react";
import { useState } from "react";
import { CovieStatusBadge } from "@/components/ui/covie";
import { normalizeParentColorKey, parentColorOptions } from "@/lib/parents/identity";

type Permission = "owner" | "editor" | "viewer";
type Member = {
  id: string;
  name: string;
  email: string | null;
  permission: Permission;
  isCurrentUser: boolean;
};
type InviteData = {
  activeInvite: { id: string; codeHint: string; permission: Permission; expiresAt: string } | null;
  members: Member[];
};
type ParentProfile = {
  id: string;
  displayName: string;
  colorKey: string;
  hasAccount: boolean;
};

export function MembersPanel({ onChanged }: { onChanged?: () => void }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<InviteData | null>(null);
  const [permission, setPermission] = useState<"editor" | "viewer">("editor");
  const [newCode, setNewCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [parentOpen, setParentOpen] = useState(false);
  const [parentProfiles, setParentProfiles] = useState<ParentProfile[]>([]);
  const [parentName, setParentName] = useState("");
  const [parentBusy, setParentBusy] = useState(false);
  const [parentError, setParentError] = useState<string | null>(null);
  const [parentMessage, setParentMessage] = useState<string | null>(null);

  async function load() {
    const response = await fetch("/api/invites", { cache: "no-store" });
    const body = (await response.json().catch(() => null)) as InviteData | { error?: string } | null;
    if (!response.ok || !body || !("members" in body)) {
      throw new Error(
        body && "error" in body && body.error
          ? body.error
          : "Access settings could not be loaded.",
      );
    }
    setData(body);
  }

  async function loadParents() {
    const response = await fetch("/api/parents", { cache: "no-store" });
    const body = (await response.json().catch(() => null)) as
      | { parents?: ParentProfile[]; error?: string }
      | null;
    if (!response.ok) {
      throw new Error(body?.error ?? "Parent profiles could not be loaded.");
    }
    setParentProfiles(body?.parents ?? []);
  }

  function openPanel() {
    setError(null);
    setOpen(true);
    void load().catch((caught) =>
      setError(caught instanceof Error ? caught.message : "Access settings could not be loaded."),
    );
  }

  function openParentPanel() {
    setParentError(null);
    setParentMessage(null);
    setParentName("");
    setParentOpen(true);
    void loadParents().catch((caught) =>
      setParentError(caught instanceof Error ? caught.message : "Parent profiles could not be loaded."),
    );
  }

  async function createParent() {
    if (parentBusy || !parentName.trim()) return;
    setParentBusy(true);
    setParentError(null);
    setParentMessage(null);
    try {
      const response = await fetch("/api/parents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName: parentName }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(body?.error ?? "The parent profile could not be added.");
      }
      setParentName("");
      await loadParents();
      setParentMessage("Parent added. You can now use their name throughout the calendar without inviting them.");
      onChanged?.();
    } catch (caught) {
      setParentError(caught instanceof Error ? caught.message : "The parent profile could not be added.");
    } finally {
      setParentBusy(false);
    }
  }

  async function createCode() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/invites", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ permission }),
      });
      const body = (await response.json().catch(() => null)) as { code?: string; error?: string } | null;
      if (!response.ok || !body?.code) throw new Error(body?.error ?? "A code could not be created.");
      setNewCode(body.code);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A code could not be created.");
    } finally {
      setBusy(false);
    }
  }

  async function revokeCode() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/invites", { method: "DELETE" });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? "The code could not be revoked.");
      setNewCode(null);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The code could not be revoked.");
    } finally {
      setBusy(false);
    }
  }

  async function updateMember(memberId: string, nextPermission: "editor" | "viewer") {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/invites", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ membershipId: memberId, permission: nextPermission }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? "That permission could not be changed.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That permission could not be changed.");
    } finally {
      setBusy(false);
    }
  }

  async function copyCode() {
    if (!newCode) return;
    await navigator.clipboard.writeText(newCode);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <>
      <button
        type="button"
        onClick={openParentPanel}
        className="covie-action-teal inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm"
      >
        <UserPlus className="h-4 w-4" aria-hidden="true" />
        Add parent
      </button>
      <button
        type="button"
        onClick={openPanel}
        className="covie-action-violet inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm"
      >
        <UsersRound className="h-4 w-4" aria-hidden="true" />
        People & access
      </button>

      {parentOpen ? (
        <div className="covie-dialog-backdrop">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="parent-profiles-title"
            className="covie-dialog covie-dialog-sm covie-dialog-fit"
          >
            <header className="covie-dialog-header">
              <div className="covie-dialog-heading">
                <div className="covie-dialog-icon teal">
                  <UserPlus aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <h2 id="parent-profiles-title" className="covie-dialog-title">
                    Parent profiles
                  </h2>
                  <p className="covie-dialog-description">
                    Use a parent&apos;s name and colour in Covie. A parent does not need an account or calendar access.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setParentOpen(false)}
                aria-label="Close parent profiles"
                className="covie-dialog-close"
              >
                <X aria-hidden="true" />
              </button>
            </header>

            <div className="covie-dialog-body">
              {parentError ? (
                <p
                  role="alert"
                  className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800"
                >
                  {parentError}
                </p>
              ) : null}
              {parentMessage ? (
                <p
                  role="status"
                  className="rounded-xl border border-[#19A897] bg-[#EAF8F5] px-3 py-2 text-sm text-[#0B665C]"
                >
                  {parentMessage}
                </p>
              ) : null}

              <div className="space-y-2">
                {parentProfiles.map((parent, index) => {
                  const colorKey = normalizeParentColorKey(parent.colorKey, index);
                  const identity =
                    parentColorOptions.find((option) => option.key === colorKey) ??
                    parentColorOptions[index % parentColorOptions.length];
                  return (
                    <div
                      key={parent.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-[#E6DBCF] bg-white p-3"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span
                          className={`h-3 w-3 shrink-0 rounded-full ${identity.dotClass}`}
                          aria-hidden="true"
                        />
                        <p className="truncate font-semibold text-slate-900">
                          {parent.displayName}
                        </p>
                      </div>
                      <CovieStatusBadge tone={parent.hasAccount ? "violet" : "neutral"}>
                        {parent.hasAccount ? "Has access" : "Profile only"}
                      </CovieStatusBadge>
                    </div>
                  );
                })}
              </div>

              {parentProfiles.length < 2 ? (
                <label className="mt-4 block">
                  <span className="text-sm font-semibold text-slate-800">
                    Other parent&apos;s name
                  </span>
                  <input
                    value={parentName}
                    maxLength={50}
                    disabled={parentBusy}
                    onChange={(event) => setParentName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void createParent();
                    }}
                    placeholder="e.g. Jess"
                    autoFocus
                    className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  />
                </label>
              ) : (
                <p className="covie-dialog-status mt-4">
                  This calendar already has two parent profiles. Rename them in Settings or manage account access separately.
                </p>
              )}
            </div>

            {parentProfiles.length < 2 ? (
              <footer className="covie-dialog-footer">
                <button
                  type="button"
                  disabled={parentBusy || !parentName.trim()}
                  onClick={() => void createParent()}
                  className="covie-dialog-primary"
                >
                  {parentBusy ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <UserPlus className="h-4 w-4" aria-hidden="true" />
                  )}
                  {parentBusy ? "Adding…" : "Add parent"}
                </button>
              </footer>
            ) : null}
          </section>
        </div>
      ) : null}

      {open ? (
        <div className="covie-dialog-backdrop">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="members-title"
            className="covie-dialog covie-dialog-md"
          >
            <header className="covie-dialog-header">
              <div className="covie-dialog-heading">
                <div className="covie-dialog-icon violet">
                  <UsersRound aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <h2 id="members-title" className="covie-dialog-title">
                    People & permissions
                  </h2>
                  <p className="covie-dialog-description">
                    Manage who can open this calendar and what they are allowed to change.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close access settings"
                className="covie-dialog-close"
              >
                <X aria-hidden="true" />
              </button>
            </header>

            <div className="covie-dialog-body">
              {error ? (
                <p
                  role="alert"
                  className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800"
                >
                  {error}
                </p>
              ) : null}

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-slate-900">People with access</h3>
                  {!data ? (
                    <LoaderCircle className="h-4 w-4 animate-spin text-slate-400" aria-hidden="true" />
                  ) : null}
                </div>

                {data?.members.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-900">
                        {member.name}
                        {member.isCurrentUser ? " (you)" : ""}
                      </p>
                      {member.email ? (
                        <p className="truncate text-xs text-slate-500">{member.email}</p>
                      ) : null}
                    </div>
                    {member.permission === "owner" ? (
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                        Owner
                      </span>
                    ) : (
                      <select
                        value={member.permission}
                        disabled={busy}
                        onChange={(event) =>
                          void updateMember(
                            member.id,
                            event.target.value as "editor" | "viewer",
                          )
                        }
                        aria-label={`Permission for ${member.name}`}
                        className="covie-select min-h-11 text-sm font-semibold"
                      >
                        <option value="editor">Can edit</option>
                        <option value="viewer">View only</option>
                      </select>
                    )}
                  </div>
                ))}
              </div>

              <div className="mt-4 rounded-xl border border-[#765ED6] bg-[#F4F1FF] p-3">
                <div className="flex gap-3">
                  <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-violet-700" aria-hidden="true" />
                  <div>
                    <h3 className="font-semibold text-slate-900">Private join code</h3>
                    <p className="mt-1 text-xs leading-5 text-slate-600">
                      Each code works once and expires after 30 days. Creating a new code cancels the old one.
                    </p>
                  </div>
                </div>

                <label className="mt-3 block text-sm font-semibold text-slate-800">
                  New member can
                </label>
                <select
                  value={permission}
                  onChange={(event) =>
                    setPermission(event.target.value as "editor" | "viewer")
                  }
                  disabled={busy}
                  className="covie-input mt-1.5 text-sm"
                >
                  <option value="editor">Edit the calendar</option>
                  <option value="viewer">View only</option>
                </select>

                {newCode ? (
                  <div className="mt-3 rounded-xl bg-white p-3 ring-1 ring-slate-200">
                    <p className="text-xs font-semibold text-slate-500">Share this code now</p>
                    <div className="mt-2 flex items-center gap-2">
                      <code className="min-w-0 flex-1 break-all text-lg font-bold tracking-[0.12em] text-slate-950">
                        {newCode}
                      </code>
                      <button
                        type="button"
                        onClick={() => void copyCode()}
                        className="covie-action-sunshine inline-flex min-h-11 items-center gap-2 rounded-[10px] px-3 text-sm"
                      >
                        {copied ? (
                          <Check className="h-4 w-4" aria-hidden="true" />
                        ) : (
                          <Copy className="h-4 w-4" aria-hidden="true" />
                        )}
                        {copied ? "Copied" : "Copy"}
                      </button>
                    </div>
                  </div>
                ) : data?.activeInvite ? (
                  <p className="mt-3 text-sm text-slate-600">
                    An unused {data.activeInvite.permission === "editor" ? "editing" : "view-only"} code ending in{" "}
                    <strong>{data.activeInvite.codeHint}</strong> is active.
                  </p>
                ) : null}
              </div>
            </div>

            <footer className="covie-dialog-footer">
              {data?.activeInvite ? (
                <button
                  type="button"
                  onClick={() => void revokeCode()}
                  disabled={busy}
                  className="covie-dialog-secondary"
                >
                  Revoke code
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => void createCode()}
                disabled={busy}
                className="covie-dialog-primary"
              >
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                {busy ? "Working…" : data?.activeInvite ? "Replace code" : "Create code"}
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </>
  );
}
