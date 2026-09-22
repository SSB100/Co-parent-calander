"use client";

import {
  BriefcaseBusiness,
  LoaderCircle,
  Pencil,
  UserPlus,
  UsersRound,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
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
  defaultRoleId: string | null;
  defaultRoleName: string | null;
  defaultLocationId: string | null;
  defaultLocationName: string | null;
  hasAccount: boolean;
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
  defaultRoleId: string;
  defaultLocationId: string;
};

const emptyForm: MemberForm = {
  memberId: null,
  displayName: "",
  accessRole: "staff",
  defaultRoleId: "",
  defaultLocationId: "",
};

function roleLabel(role: StaffAccessRole) {
  if (role === "owner") return "Owner";
  if (role === "manager") return "Manager";
  return "Staff";
}

export function StaffRosterTeamPage() {
  const [data, setData] = useState<TeamPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<MemberForm>(emptyForm);
  const [busy, setBusy] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<TeamMember | null>(null);

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

  const activeMembers = useMemo(
    () => data?.members.filter((member) => member.active) ?? [],
    [data],
  );

  function openCreate() {
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEdit(member: TeamMember) {
    setForm({
      memberId: member.id,
      displayName: member.displayName,
      accessRole: member.accessRole === "manager" ? "manager" : "staff",
      defaultRoleId: member.defaultRoleId ?? "",
      defaultLocationId: member.defaultLocationId ?? "",
    });
    setDialogOpen(true);
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
                defaultRoleId: form.defaultRoleId,
                defaultLocationId: form.defaultLocationId,
                active: true,
              }
            : {
                displayName: form.displayName,
                accessRole: form.accessRole,
                defaultRoleId: form.defaultRoleId,
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
          defaultRoleId: archiveTarget.defaultRoleId ?? "",
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
                Add team member
              </CovieButton>
            ) : null}
          </div>

          {activeMembers.length === 0 ? (
            <CovieEmptyState
              icon={<UsersRound className="h-8 w-8 text-[#19A897]" aria-hidden="true" />}
              title="Add your first team member"
              description="Add the people who will appear on this roster."
              action={
                data.canManageTeam ? (
                  <CovieButton onClick={openCreate}>
                    Add team member
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
                          {member.hasAccount ? (
                            <CovieStatusBadge tone="violet">
                              Account linked
                            </CovieStatusBadge>
                          ) : null}
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

                    <dl className="mt-4 grid gap-2 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <dt className="text-[#66747A]">Role</dt>
                        <dd className="text-right font-bold text-[#243139]">
                          {member.defaultRoleName ?? "Not set"}
                        </dd>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <dt className="text-[#66747A]">Location</dt>
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
          title={form.memberId ? "Edit team member" : "Add team member"}
          description="Roster access controls what someone can manage. Role and location describe their usual work."
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
                {busy ? "Saving…" : "Save"}
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
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    displayName: event.target.value,
                  }))
                }
              />
            </label>

            <label>
              <span className="mb-1.5 block text-sm font-bold">Roster access</span>
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
            </label>

            <label>
              <span className="mb-1.5 block text-sm font-bold">Default role</span>
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
                <option value="">Not set</option>
                {data.roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </CovieSelect>
            </label>

            <label>
              <span className="mb-1.5 block text-sm font-bold">Default location</span>
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
        </CovieDialog>
      ) : null}

      <CovieConfirmDialog
        open={Boolean(archiveTarget)}
        id="archive-staff-member-title"
        title="Archive team member?"
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
