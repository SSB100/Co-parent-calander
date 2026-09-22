"use client";

import { LoaderCircle, MapPin, Plus, Tags } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  CovieButton,
  CovieConfirmDialog,
  CovieDialog,
  CovieEmptyState,
  CovieInput,
  CovieNotice,
  CovieStatusBadge,
} from "@/components/ui/covie";

type StructureItem = { id: string; name: string; active: boolean };
type StructurePayload = {
  canManage: boolean;
  roles: StructureItem[];
  locations: StructureItem[];
};
type Kind = "role" | "location";

export function StaffRosterRolesLocationsPage() {
  const [data, setData] = useState<StructurePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialogKind, setDialogKind] = useState<Kind | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<{
    kind: Kind;
    item: StructureItem;
  } | null>(null);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/staff-roster/roles-locations", {
      cache: "no-store",
    });
    const body = (await response.json().catch(() => null)) as
      | StructurePayload
      | { error?: string }
      | null;

    if (!response.ok || !body || !("roles" in body)) {
      throw new Error(
        body && "error" in body && body.error
          ? body.error
          : "Roles and locations could not be loaded.",
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
            : "Roles and locations could not be loaded.",
        ),
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  async function createItem() {
    if (!dialogKind || !name.trim() || busy) return;
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/staff-roster/roles-locations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: dialogKind, name }),
      });
      const body = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(
          body?.error ??
            "The " + dialogKind + " could not be added.",
        );
      }

      setDialogKind(null);
      setName("");
      await refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The roster setting could not be added.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function archiveItem() {
    if (!archiveTarget || busy) return;
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/staff-roster/roles-locations", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: archiveTarget.kind,
          id: archiveTarget.item.id,
        }),
      });
      const body = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(
          body?.error ??
            "The " + archiveTarget.kind + " could not be archived.",
        );
      }

      setArchiveTarget(null);
      await refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The roster setting could not be archived.",
      );
    } finally {
      setBusy(false);
    }
  }

  const activeRoles = data?.roles.filter((item) => item.active) ?? [];
  const activeLocations = data?.locations.filter((item) => item.active) ?? [];

  function renderList(
    kind: Kind,
    items: StructureItem[],
    Icon: typeof Tags,
    emptyTitle: string,
    emptyDescription: string,
  ) {
    if (items.length === 0) {
      return (
        <CovieEmptyState
          icon={<Icon className="h-8 w-8 text-[#19A897]" aria-hidden="true" />}
          title={emptyTitle}
          description={emptyDescription}
          action={
            data?.canManage ? (
              <CovieButton onClick={() => setDialogKind(kind)}>
                Add {kind}
              </CovieButton>
            ) : undefined
          }
        />
      );
    }

    return (
      <div className="space-y-2">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex min-h-14 items-center justify-between gap-3 rounded-xl border border-[#E6DBCF] bg-white px-4 py-3"
          >
            <div className="flex min-w-0 items-center gap-3">
              <Icon className="h-4 w-4 shrink-0 text-[#19A897]" aria-hidden="true" />
              <strong className="truncate text-sm text-[#243139]">
                {item.name}
              </strong>
            </div>

            {data?.canManage ? (
              <CovieButton
                tone="neutral"
                onClick={() => setArchiveTarget({ kind, item })}
              >
                Archive
              </CovieButton>
            ) : (
              <CovieStatusBadge tone="neutral">Active</CovieStatusBadge>
            )}
          </div>
        ))}
      </div>
    );
  }

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
          Loading roles and locations…
        </div>
      ) : null}

      {data ? (
        <div className="grid gap-5 xl:grid-cols-2">
          <section>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-lg font-extrabold text-[#243139]">Roles</h2>
              {data.canManage && activeRoles.length > 0 ? (
                <CovieButton onClick={() => setDialogKind("role")}>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Add role
                </CovieButton>
              ) : null}
            </div>
            {renderList(
              "role",
              activeRoles,
              Tags,
              "No roles yet",
              "Add the roles people can work when you start building shifts.",
            )}
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-lg font-extrabold text-[#243139]">Locations</h2>
              {data.canManage && activeLocations.length > 0 ? (
                <CovieButton onClick={() => setDialogKind("location")}>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Add location
                </CovieButton>
              ) : null}
            </div>
            {renderList(
              "location",
              activeLocations,
              MapPin,
              "No locations yet",
              "Add the places where this team can be rostered.",
            )}
          </section>
        </div>
      ) : null}

      {dialogKind ? (
        <CovieDialog
          id="staff-structure-dialog-title"
          title={dialogKind === "role" ? "Add role" : "Add location"}
          description={
            dialogKind === "role"
              ? "Roles describe the work a person is rostered to do."
              : "Locations describe where a shift takes place."
          }
          icon={
            dialogKind === "role" ? (
              <Tags aria-hidden="true" />
            ) : (
              <MapPin aria-hidden="true" />
            )
          }
          iconTone="teal"
          size="sm"
          busy={busy}
          onClose={() => setDialogKind(null)}
          footer={
            <>
              <CovieButton
                tone="neutral"
                disabled={busy}
                onClick={() => setDialogKind(null)}
              >
                Cancel
              </CovieButton>
              <CovieButton
                disabled={busy || !name.trim()}
                onClick={() => void createItem()}
              >
                {busy ? "Adding…" : "Add"}
              </CovieButton>
            </>
          }
        >
          <label>
            <span className="mb-1.5 block text-sm font-bold">Name</span>
            <CovieInput
              value={name}
              maxLength={100}
              autoFocus
              disabled={busy}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
        </CovieDialog>
      ) : null}

      <CovieConfirmDialog
        open={Boolean(archiveTarget)}
        id="archive-staff-structure-title"
        title={"Archive " + (archiveTarget?.kind ?? "item") + "?"}
        description={
          archiveTarget
            ? archiveTarget.item.name +
              " will no longer be available for new roster assignments."
            : ""
        }
        confirmLabel="Archive"
        busy={busy}
        onCancel={() => setArchiveTarget(null)}
        onConfirm={() => void archiveItem()}
      />
    </>
  );
}
