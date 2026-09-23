"use client";

import {
  BriefcaseBusiness,
  Copy,
  LoaderCircle,
  Pencil,
  UserPlus,
  UsersRound,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CovieButton,
  CovieConfirmDialog,
  CovieDialog,
  CovieEmptyState,
  CovieInput,
  CovieNotice,
  CovieSelect,
  CovieStatusBadge,
} from "@/components/ui/covie";

type StaffAccessRole = "owner" | "manager" | "staff";

type TeamMember = {
  id: string;
  displayName: string;
  accessRole: StaffAccessRole;
  active: boolean;
  roleIds: string[];
  roleNames: string[];
  defaultRoleId: string | null;
  defaultRoleName: string | null;
  defaultLocationId: string | null;
  defaultLocationName: string | null;
  hasAccount: boolean;
  accountState: "not_invited" | "invite_active" | "connected";
  hadInvite: boolean;
  inviteExpiresAt: string | null;
  isCurrentUser: boolean;
};

type Option = { id: string; name: string };

type TeamPayload = {
  currentMemberId: string;
  currentAccessRole: StaffAccessRole;
  canManageTeam: boolean;
  canManageManagers: boolean;
  members: TeamMember[];
  roles: Option[];
  locations: Option[];
};

type MemberForm = {
  memberId: string | null;
  displayName: string;
  accessRole: "manager" | "staff";
  roleIds: string[];
  defaultRoleId: string;
  defaultLocationId: string;
};

const emptyForm: MemberForm = {
  memberId: null,
  displayName: "",
  accessRole: "staff",
  roleIds: [],
  defaultRoleId: "",
  defaultLocationId: "",
};

function roleLabel(role: StaffAccessRole) {
  if (role === "owner") return "Owner";
  if (role === "manager") return "Manager";
  return "Staff";
}

export function StaffRosterTeamPage() {
  const autoOpenedAddDialog = useRef(false);
  const [data, setData] = useState<TeamPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<MemberForm>(emptyForm);
  const [busy, setBusy] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<TeamMember | null>(null);
  const [invite, setInvite] = useState<{
    code: string;
    displayName: string;
    expiresAt: string;
  } | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/staff-roster/team", { cache: "no-store" });
    const body = (await response.json().catch(() => null)) as
      | TeamPayload
      | { error?: string }
      | null;

    if (!response.ok || !body || !("members" in body)) {
      throw new Error(
        body && "error" in body && body.error
          ? body.error
          : "The team could not be loaded.",
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
            : "The team could not be loaded.",
        ),
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  useEffect(() => {
    if (
      autoOpenedAddDialog.current ||
      dialogOpen ||
      !data?.canManageTeam ||
      new URLSearchParams(window.location.search).get("add") !== "1"
    ) {
      return;
    }

    autoOpenedAddDialog.current = true;
    setForm(emptyForm);
    setDialogOpen(true);
  }, [data, dialogOpen]);

  const activeMembers = useMemo(
    () => data?.members.filter((member) => member.active) ?? [],
    [data],
  );

  function openCreate() {
    autoOpenedAddDialog.current = true;
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEdit(member: TeamMember) {
    setForm({
      memberId: member.id,
      displayName: member.displayName,
      accessRole: member.accessRole === "manager" ? "manager" : "staff",
      roleIds: member.roleIds,
      defaultRoleId: member.defaultRoleId ?? member.roleIds[0] ?? "",
      defaultLocationId: member.defaultLocationId ?? "",
    });
    setDialogOpen(true);
  }

  function toggleRole(roleId: string) {
    setForm((current) => {
      const selected = current.roleIds.includes(roleId);
      const roleIds = selected
        ? current.roleIds.filter((id) => id !== roleId)
        : [...current.roleIds, roleId];
      const defaultRoleId =
        current.defaultRoleId && roleIds.includes(current.defaultRoleId)
          ? current.defaultRoleId
          : (roleIds[0] ?? "");

      return { ...current, roleIds, defaultRoleId };
    });
  }

  async function saveMember() {
    if (!form.displayName.trim() || busy) return;
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/staff-roster/team", {
        method: form.memberId ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          form.memberId
            ? {
                memberId: form.memberId,
                displayName: form.displayName,
                accessRole: form.accessRole,
                roleIds: form.roleIds,
                defaultRoleId:
                  form.defaultRoleId && form.roleIds.includes(form.defaultRoleId)
                    ? form.defaultRoleId
                    : (form.roleIds[0] ?? ""),
                defaultLocationId: form.defaultLocationId,
                active: true,
              }
            : {
                displayName: form.displayName,
                accessRole: form.accessRole,
                roleIds: form.roleIds,
                defaultRoleId:
                  form.defaultRoleId && form.roleIds.includes(form.defaultRoleId)
                    ? form.defaultRoleId
                    : (form.roleIds[0] ?? ""),
                defaultLocationId: form.defaultLocationId,
              },
        ),
      });
      const body = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(body?.error ?? "The team member could not be saved.");
      }

      setDialogOpen(false);
      setForm(emptyForm);
      await refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The team member could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function inviteMember(member: TeamMember) {
    if (busy || member.hasAccount) return;
    setBusy(true);
    setError(null);
    setInviteCopied(false);

    try {
      const response = await fetch("/api/staff-roster/invitations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ memberId: member.id }),
      });
      const body = (await response.json().catch(() => null)) as
        | {
            code?: string;
            displayName?: string;
            expiresAt?: string;
            error?: string;
          }
        | null;

      if (!response.ok || !body?.code || !body.displayName || !body.expiresAt) {
        throw new Error(body?.error ?? "The invitation could not be created.");
      }

      setInvite({
        code: body.code,
        displayName: body.displayName,
        expiresAt: body.expiresAt,
      });
      await refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The invitation could not be created.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function revokeInvite(member: TeamMember) {
    if (busy || member.accountState !== "invite_active") return;
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/staff-roster/invitations", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ memberId: member.id }),
      });
      const body = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(body?.error ?? "The invitation could not be revoked.");
      }

      await refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The invitation could not be revoked.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function archiveMember() {
    if (!archiveTarget || busy) return;
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/staff-roster/team", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          memberId: archiveTarget.id,
          displayName: archiveTarget.displayName,
          accessRole:
            archiveTarget.accessRole === "manager" ? "manager" : "staff",
          roleIds: archiveTarget.roleIds,
          defaultRoleId: archiveTarget.defaultRoleId ?? archiveTarget.roleIds[0] ?? "",
          defaultLocationId: archiveTarget.defaultLocationId ?? "",
          active: false,
        }),
      });
      const body = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(body?.error ?? "The team member could not be archived.");
      }

      setArchiveTarget(null);
      setDialogOpen(false);
      await refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The team member could not be archived.",
      );
    } finally {
      setBusy(false);
    }
  }

  const editingMember = form.memberId
    ? data?.members.find((member) => member.id === form.memberId) ?? null
    : null;
  const canEditSelected =
    Boolean(data?.canManageTeam) &&
    editingMember?.accessRole !== "owner" &&
    (data?.canManageManagers || editingMember?.accessRole !== "manager");

  return (
    <>
      {error ? (
        <CovieNotice tone="danger" role="alert" className="mb-4">
          {error}
        </CovieNotice>
      ) : null}

      {!data && !error ? (
        <div className="flex min-h-40 items-center justify-center rounded-2xl border border-[#E6DBCF] bg-white text-sm text-[#66747A]">
          <LoaderCircle className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
          Loading team…
        </div>
      ) : null}

      {data ? (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-bold text-[#526168]">
              {activeMembers.length} {activeMembers.length === 1 ? "person" : "people"}
            </p>
            {data.canManageTeam ? (
              <CovieButton onClick={openCreate}>
                <UserPlus className="h-4 w-4" aria-hidden="true" />
                Add staff member
              </CovieButton>
            ) : null}
          </div>

          {activeMembers.length === 0 ? (
            <CovieEmptyState
              icon={<UsersRound className="h-8 w-8 text-[#19A897]" aria-hidden="true" />}
              title="Add your first staff member"
              description="Add the people who will appear on this roster."
              action={
                data.canManageTeam ? (
                  <CovieButton onClick={openCreate}>
                    Add staff member
                  </CovieButton>
                ) : undefined
              }
            />
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {activeMembers.map((member) => {
                const editable =
                  data.canManageTeam &&
                  member.accessRole !== "owner" &&
                  (data.canManageManagers || member.accessRole !== "manager");
                const canManageInvite =
                  member.accessRole !== "owner" &&
                  (member.accessRole === "staff"
                    ? data.canManageTeam
                    : data.canManageManagers);

                return (
                  <article
                    key={member.id}
                    className="rounded-2xl border border-[#E6DBCF] bg-white p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="truncate text-base font-extrabold text-[#243139]">
                          {member.displayName}
                        </h2>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <CovieStatusBadge tone="neutral">
                            {roleLabel(member.accessRole)}
                          </CovieStatusBadge>
                          <CovieStatusBadge
                            tone={
                              member.accountState === "connected"
                                ? "teal"
                                : member.accountState === "invite_active"
                                  ? "sunshine"
                                  : "neutral"
                            }
                          >
                            {member.accountState === "connected"
                              ? "Connected"
                              : member.accountState === "invite_active"
                                ? "Invite active"
                                : "Not invited"}
                          </CovieStatusBadge>
                          {member.isCurrentUser ? (
                            <CovieStatusBadge tone="neutral">You</CovieStatusBadge>
                          ) : null}
                        </div>
                      </div>

                      {editable ? (
                        <CovieButton
                          tone="neutral"
                          className="shrink-0"
                          onClick={() => openEdit(member)}
                          aria-label={"Edit " + member.displayName}
                        >
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                          <span className="hidden sm:inline">Edit</span>
                        </CovieButton>
                      ) : null}
                    </div>

                    {!member.hasAccount && canManageInvite ? (
                      <div className="mt-4 grid gap-2 sm:grid-cols-2">
                        <CovieButton
                          tone="neutral"
                          className={
                            member.accountState === "invite_active"
                              ? "w-full"
                              : "w-full sm:col-span-2"
                          }
                          disabled={busy}
                          onClick={() => void inviteMember(member)}
                        >
                          <UserPlus className="h-4 w-4" aria-hidden="true" />
                          {member.accountState === "invite_active" ||
                          member.hadInvite
                            ? "New invite"
                            : "Invite to Covie"}
                        </CovieButton>
                        {member.accountState === "invite_active" ? (
                          <CovieButton
                            tone="neutral"
                            className="w-full"
                            disabled={busy}
                            onClick={() => void revokeInvite(member)}
                          >
                            Revoke invite
                          </CovieButton>
                        ) : null}
                      </div>
                    ) : null}

                    {member.accountState === "invite_active" &&
                    member.inviteExpiresAt ? (
                      <p className="mt-2 text-xs font-bold text-[#8B6714]">
                        Invite active until{" "}
                        {new Intl.DateTimeFormat("en-NZ", {
                          day: "numeric",
                          month: "short",
                        }).format(new Date(member.inviteExpiresAt))}
                      </p>
                    ) : null}

                    <dl className="mt-4 grid gap-2 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <dt className="text-[#66747A]">Roles</dt>
                        <dd className="max-w-[65%] text-right font-bold text-[#243139]">
                          {member.roleNames.length > 0
                            ? member.roleNames.join(", ")
                            : "Not set"}
                        </dd>
                      </div>
                      {member.defaultRoleName ? (
                        <div className="flex items-center justify-between gap-3">
                          <dt className="text-[#66747A]">Usual role</dt>
                          <dd className="max-w-[65%] text-right font-bold text-[#243139]">
                            {member.defaultRoleName}
                          </dd>
                        </div>
                      ) : null}
                      <div className="flex items-center justify-between gap-3">
                        <dt className="text-[#66747A]">Usual location</dt>
                        <dd className="text-right font-bold text-[#243139]">
                          {member.defaultLocationName ?? "Not set"}
                        </dd>
                      </div>
                    </dl>
                  </article>
                );
              })}
            </div>
          )}
        </>
      ) : null}

      {dialogOpen && data ? (
        <CovieDialog
          id="staff-member-dialog-title"
          title={form.memberId ? "Edit staff member" : "Add staff member"}
          description={
            form.memberId
              ? "Update this person's roster details. Roles and location stay optional."
              : "Start with their name. Access, roles and location can all be added later."
          }
          icon={<BriefcaseBusiness aria-hidden="true" />}
          iconTone="teal"
          size="sm"
          busy={busy}
          onClose={() => setDialogOpen(false)}
          footer={
            <>
              {form.memberId && canEditSelected ? (
                <CovieButton
                  tone="danger"
                  disabled={busy}
                  onClick={() => {
                    if (editingMember) setArchiveTarget(editingMember);
                  }}
                >
                  Archive
                </CovieButton>
              ) : null}
              <CovieButton
                tone="neutral"
                disabled={busy}
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </CovieButton>
              <CovieButton
                disabled={busy || !form.displayName.trim()}
                onClick={() => void saveMember()}
              >
                {busy
                  ? "Saving…"
                  : form.memberId
                    ? "Save changes"
                    : "Add staff member"}
              </CovieButton>
            </>
          }
        >
          <div className="grid gap-4">
            <label>
              <span className="mb-1.5 block text-sm font-bold">Name</span>
              <CovieInput
                value={form.displayName}
                maxLength={80}
                disabled={busy}
                autoFocus={!form.memberId}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    displayName: event.target.value,
                  }))
                }
              />
            </label>

            <details
              open={form.memberId ? true : undefined}
              className="rounded-xl border border-[#E6DBCF] bg-[#FFF9F2]"
            >
              <summary className="flex min-h-11 cursor-pointer items-center px-3 py-2 text-sm font-extrabold text-[#243139]">
                Optional roster details
              </summary>
              <div className="grid gap-4 border-t border-[#E6DBCF] bg-white p-3">
                <label>
                  <span className="mb-1.5 block text-sm font-bold">
                    Roster access
                  </span>
                  <CovieSelect
                    value={form.accessRole}
                    disabled={busy || !data.canManageManagers}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        accessRole: event.target.value as "manager" | "staff",
                      }))
                    }
                  >
                    <option value="staff">Staff</option>
                    {data.canManageManagers ? (
                      <option value="manager">Manager</option>
                    ) : null}
                  </CovieSelect>
                  {!data.canManageManagers ? (
                    <p className="mt-1.5 text-xs text-[#66747A]">
                      Only the calendar owner can grant Manager access.
                    </p>
                  ) : null}
                </label>

                <fieldset>
                  <legend className="mb-1.5 block text-sm font-bold">Roles</legend>
                  {data.roles.length === 0 ? (
                    <p className="rounded-xl bg-[#FFF9F2] p-3 text-sm text-[#66747A]">
                      No roles yet. You can add them later from Roles & locations.
                    </p>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {data.roles.map((role) => {
                        const checked = form.roleIds.includes(role.id);
                        return (
                          <label
                            key={role.id}
                            className={
                              "flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold " +
                              (checked
                                ? "border-[#19A897] bg-[#EAF8F5] text-[#243139]"
                                : "border-[#E6DBCF] bg-white text-[#526168]")
                            }
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={busy}
                              onChange={() => toggleRole(role.id)}
                              className="h-4 w-4 accent-[#19A897]"
                            />
                            <span>{role.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </fieldset>

                {form.roleIds.length > 1 ? (
                  <label>
                    <span className="mb-1.5 block text-sm font-bold">
                      Usual role for new shifts
                    </span>
                    <CovieSelect
                      value={form.defaultRoleId}
                      disabled={busy}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          defaultRoleId: event.target.value,
                        }))
                      }
                    >
                      {data.roles
                        .filter((role) => form.roleIds.includes(role.id))
                        .map((role) => (
                          <option key={role.id} value={role.id}>
                            {role.name}
                          </option>
                        ))}
                    </CovieSelect>
                  </label>
                ) : null}

                <label>
                  <span className="mb-1.5 block text-sm font-bold">
                    Usual location
                  </span>
                  <CovieSelect
                    value={form.defaultLocationId}
                    disabled={busy}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        defaultLocationId: event.target.value,
                      }))
                    }
                  >
                    <option value="">Not set</option>
                    {data.locations.map((location) => (
                      <option key={location.id} value={location.id}>
                        {location.name}
                      </option>
                    ))}
                  </CovieSelect>
                </label>
              </div>
            </details>
          </div>
        </CovieDialog>
      ) : null}

      {invite ? (
        <CovieDialog
          id="staff-invite-dialog-title"
          title={"Invite " + invite.displayName + " to Covie"}
          description="They can use this code from Covie's Join flow. It links their account to this existing team profile."
          icon={<UserPlus aria-hidden="true" />}
          iconTone="teal"
          size="sm"
          onClose={() => setInvite(null)}
          footer={
            <CovieButton onClick={() => setInvite(null)}>Done</CovieButton>
          }
        >
          <div className="rounded-xl border-2 border-[#243139] bg-[#FFF9F2] p-4 text-center">
            <span className="text-xs font-extrabold uppercase tracking-[0.08em] text-[#66747A]">
              Invite code
            </span>
            <strong className="mt-2 block font-mono text-2xl tracking-[0.12em] text-[#243139]">
              {invite.code}
            </strong>
            <CovieButton
              tone="neutral"
              className="mt-3"
              onClick={() => {
                void navigator.clipboard.writeText(invite.code).then(() => {
                  setInviteCopied(true);
                });
              }}
            >
              <Copy className="h-4 w-4" aria-hidden="true" />
              {inviteCopied ? "Copied" : "Copy code"}
            </CovieButton>
          </div>
          <p className="mt-3 text-xs text-[#66747A]">
            Expires{" "}
            {new Intl.DateTimeFormat("en-NZ", {
              day: "numeric",
              month: "short",
              year: "numeric",
            }).format(new Date(invite.expiresAt))}
            .
          </p>
        </CovieDialog>
      ) : null}

      <CovieConfirmDialog
        open={Boolean(archiveTarget)}
        id="archive-staff-member-title"
        title="Archive staff member?"
        description={
          archiveTarget
            ? archiveTarget.displayName + " will stop appearing in the active team."
            : ""
        }
        confirmLabel="Archive"
        busy={busy}
        onCancel={() => setArchiveTarget(null)}
        onConfirm={() => void archiveMember()}
      />
    </>
  );
}
