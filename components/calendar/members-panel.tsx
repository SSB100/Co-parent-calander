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

export function MembersPanel() {
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
      window.setTimeout(() => window.location.reload(), 700);
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
        className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
      >
        <UserPlus className="h-4 w-4" aria-hidden="true" />Add parent
      </button>
      <button
        type="button"
        onClick={openPanel}
        className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
      >
        <UsersRound className="h-4 w-4" aria-hidden="true" />People & access
      </button>

      {parentOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/35 sm:items-center sm:p-4">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="parent-profiles-title"
            className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Calendar parents</p>
                <h2 id="parent-profiles-title" className="mt-1 text-2xl font-semibold text-slate-950">Parent profiles</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Parent profiles are used for names, colours and custody schedules. A parent does not need an account or calendar access. You can invite them separately later if you want.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setParentOpen(false)}
                aria-label="Close parent profiles"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {parentError ? (
              <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                {parentError}
              </p>
            ) : null}
            {parentMessage ? (
              <p role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                {parentMessage}
              </p>
            ) : null}

            <div className="mt-6 space-y-2">
              {parentProfiles.map((parent) => (
                <div key={parent.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 p-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className={`h-3 w-3 shrink-0 rounded-full ${parent.colorKey === "violet" ? "bg-violet-500" : "bg-emerald-500"}`}
                      aria-hidden="true"
                    />
                    <p className="truncate font-semibold text-slate-900">{parent.displayName}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${parent.hasAccount ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-600"}`}>
                    {parent.hasAccount ? "Has access" : "Profile only"}
                  </span>
                </div>
              ))}
            </div>

            {parentProfiles.length < 2 ? (
              <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <label className="block">
                  <span className="text-sm font-semibold text-slate-800">{"Other parent's name"}</span>
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
                    className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  />
                </label>
                <button
                  type="button"
                  disabled={parentBusy || !parentName.trim()}
                  onClick={() => void createParent()}
                  className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  {parentBusy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                  {parentBusy ? "Adding…" : "Add parent"}
                </button>
              </div>
            ) : (
              <p className="mt-5 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                This calendar already has two parent profiles. You can rename them in Settings or manage account access separately.
              </p>
            )}
          </section>
        </div>
      ) : null}

      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/35 sm:items-center sm:p-4">
          <section role="dialog" aria-modal="true" aria-labelledby="members-title" className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Calendar access</p><h2 id="members-title" className="mt-1 text-2xl font-semibold text-slate-950">People & permissions</h2></div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close access settings" className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200"><X className="h-5 w-5" /></button>
            </div>

            {error ? <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p> : null}

            <div className="mt-6 space-y-3">
              <h3 className="text-sm font-semibold text-slate-900">People with access</h3>
              {!data ? <p className="flex items-center gap-2 text-sm text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin" />Loading…</p> : data.members.map((member) => (
                <div key={member.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 p-4">
                  <div className="min-w-0"><p className="truncate font-semibold text-slate-900">{member.name}{member.isCurrentUser ? " (you)" : ""}</p>{member.email ? <p className="truncate text-xs text-slate-500">{member.email}</p> : null}</div>
                  {member.permission === "owner" ? <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">Owner</span> : (
                    <select value={member.permission} disabled={busy} onChange={(event) => void updateMember(member.id, event.target.value as "editor" | "viewer")} aria-label={`Permission for ${member.name}`} className="min-h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700">
                      <option value="editor">Can edit</option><option value="viewer">View only</option>
                    </select>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-7 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex gap-3"><KeyRound className="mt-0.5 h-5 w-5 text-violet-600" /><div><h3 className="font-semibold text-slate-900">Private join code</h3><p className="mt-1 text-sm leading-6 text-slate-600">{"Each code works once and expires after 30 days. Creating a new code cancels the old one. If you already created the other parent's profile, an editor who joins will be linked to that profile."}</p></div></div>
              <label className="mt-4 block text-sm font-semibold text-slate-800">New member can</label>
              <select value={permission} onChange={(event) => setPermission(event.target.value as "editor" | "viewer")} disabled={busy} className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900"><option value="editor">Edit the calendar</option><option value="viewer">View only</option></select>

              {newCode ? (
                <div className="mt-4 rounded-xl bg-white p-4 ring-1 ring-slate-200"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Share this code now</p><div className="mt-2 flex items-center gap-2"><code className="min-w-0 flex-1 break-all text-lg font-bold tracking-[0.12em] text-slate-950">{newCode}</code><button type="button" onClick={() => void copyCode()} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-slate-100 px-3 text-sm font-semibold text-slate-700">{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? "Copied" : "Copy"}</button></div><p className="mt-2 text-xs text-slate-500">For security, the full code is only shown here once.</p></div>
              ) : data?.activeInvite ? <p className="mt-4 text-sm text-slate-600">An unused {data.activeInvite.permission === "editor" ? "editing" : "view-only"} code ending in <strong>{data.activeInvite.codeHint}</strong> is active.</p> : null}

              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <button type="button" onClick={() => void createCode()} disabled={busy} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white disabled:opacity-60"><ShieldCheck className="h-4 w-4" />{busy ? "Working…" : data?.activeInvite ? "Replace code" : "Create code"}</button>
                {data?.activeInvite ? <button type="button" onClick={() => void revokeCode()} disabled={busy} className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 disabled:opacity-60">Revoke code</button> : null}
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
