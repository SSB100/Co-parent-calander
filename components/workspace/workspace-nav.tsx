"use client";
import { CalendarDays, Bell, CheckSquare2, LayoutGrid, LogOut, UsersRound, WalletCards, ChevronDown, Download, Eye } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";
import { useDismissibleDetails } from "@/lib/client/use-details-dismiss";
import { InstallApp } from "@/components/pwa/install-app";
import { ComingUp, type ComingUpPayload } from "./coming-up";
import { CovieBrand } from "./covie-brand";

export type WorkspaceSection = "home" | "calendar" | "expenses" | "responsibilities" | "kids" | "organiser";
export const organiserItems = [
  {
    key: "responsibilities",
    href: "/responsibilities",
    label: "Tasks",
    description: "Practical jobs, ownership and due dates.",
    icon: CheckSquare2,
  },
  {
    key: "expenses",
    href: "/expenses",
    label: "Shared costs",
    description: "Shared costs, reimbursements and settlements.",
    icon: WalletCards,
  },
  {
    key: "kids",
    href: "/kids",
    label: "Children",
    description: "Profiles, activities and useful information.",
    icon: UsersRound,
  },
] as const;
const items = [
  { key: "calendar", href: "/calendar", label: "Calendar", icon: CalendarDays },
  { key: "home", href: "/home", label: "Updates", icon: Bell },
] as const;

type WorkspaceSummaryResponse = {
  notificationCount?: number;
  context?: ComingUpPayload;
  error?: string;
};
export function WorkspaceNav({ active, actions }: { active?: WorkspaceSection; actions?: ReactNode }) {
  const router = useRouter();
  const [signOutError, setSignOutError] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [notificationCount, setNotificationCount] = useState(0);
  const [workspaceContext, setWorkspaceContext] = useState<ComingUpPayload | null>(null);
  const [contextError, setContextError] = useState(false);
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false);
  const accountRef = useRef<HTMLDetailsElement>(null);
  const organiserRef = useRef<HTMLDetailsElement>(null);
  const mobileActionsRef = useRef<HTMLDivElement>(null);
  const mobileActionsOpenRef = useRef(false);
  const summaryControllerRef = useRef<AbortController | null>(null);
  useDismissibleDetails(accountRef);
  useDismissibleDetails(organiserRef);
  const section =
    active && ["responsibilities", "expenses", "kids", "organiser"].includes(active)
      ? "organiser"
      : active;

  const refreshWorkspace = useCallback(async (includeContext: boolean) => {
    summaryControllerRef.current?.abort();
    const controller = new AbortController();
    summaryControllerRef.current = controller;

    if (includeContext) {
      setContextError(false);
    }

    try {
      const response = await fetch(
        `/api/workspace-summary?context=${includeContext ? "1" : "0"}`,
        {
          signal: controller.signal,
          cache: "no-store",
        },
      );
      const body = (await response.json().catch(() => null)) as
        | WorkspaceSummaryResponse
        | null;

      if (!response.ok || !body) {
        throw new Error(body?.error ?? "Workspace summary could not be loaded.");
      }
      if (controller.signal.aborted) return;

      if (typeof body.notificationCount === "number") {
        setNotificationCount(body.notificationCount);
      }
      if (includeContext) {
        if (!body.context) {
          throw new Error("Workspace context was not returned.");
        }
        setWorkspaceContext(body.context);
        setContextError(false);
      }
    } catch {
      if (!controller.signal.aborted && includeContext) {
        setContextError(true);
      }
    } finally {
      if (summaryControllerRef.current === controller) {
        summaryControllerRef.current = null;
      }
    }
  }, []);

  useEffect(() => {
    const desktopQuery = window.matchMedia("(min-width: 1024px)");

    function refresh() {
      void refreshWorkspace(desktopQuery.matches || mobileActionsOpenRef.current);
    }

    function handleDesktopChange() {
      refresh();
    }

    refresh();
    desktopQuery.addEventListener("change", handleDesktopChange);
    window.addEventListener("focus", refresh);
    window.addEventListener("covie-records-updated", refresh);

    return () => {
      summaryControllerRef.current?.abort();
      desktopQuery.removeEventListener("change", handleDesktopChange);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("covie-records-updated", refresh);
    };
  }, [refreshWorkspace]);

  useEffect(() => {
    if (!mobileActionsOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (!(event.target instanceof Node)) return;
      if (!mobileActionsRef.current?.contains(event.target)) {
        mobileActionsOpenRef.current = false;
        setMobileActionsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        mobileActionsOpenRef.current = false;
        setMobileActionsOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [mobileActionsOpen]);

  async function signOut() {
    setSigningOut(true);
    setSignOutError(false);
    try {
      const result = await authClient.signOut();
      if (result?.error) throw new Error("Sign out failed");
      router.push("/");
    } catch {
      setSignOutError(true);
      setSigningOut(false);
    }
  }

  function openInstallPrompt() {
    window.dispatchEvent(new Event("covie-open-install"));
    mobileActionsOpenRef.current = false;
    setMobileActionsOpen(false);
  }

  function toggleMobileActions() {
    const next = !mobileActionsOpenRef.current;
    mobileActionsOpenRef.current = next;
    setMobileActionsOpen(next);
    if (next) {
      void refreshWorkspace(true);
    }
  }

  return <>
    <nav className="workspace-nav" aria-label="Main navigation">
      <Link href="/calendar" className="workspace-brand"><CovieBrand /></Link>
      <div className="workspace-destinations">
        {items.map(({ key, href, label, icon: Icon }) => (
          <Link key={key} href={href} aria-current={section === key ? "page" : undefined}>
            <Icon size={20} aria-hidden="true" />
            <span>{label}</span>
            {key === "home" && notificationCount > 0 ? (
              <span
                className="workspace-notification-badge"
                aria-label={`${notificationCount} update${notificationCount === 1 ? "" : "s"} need review`}
              >
                {notificationCount > 99 ? "99+" : notificationCount}
              </span>
            ) : null}
          </Link>
        ))}

        <details
          ref={organiserRef}
          className={`workspace-organiser-menu${section === "organiser" ? " is-active" : ""}`}
        >
          <summary
            className="workspace-organiser-trigger"
            aria-current={section === "organiser" ? "page" : undefined}
          >
            <LayoutGrid size={20} aria-hidden="true" />
            <span>Organiser</span>
            <ChevronDown className="workspace-organiser-chevron" size={16} aria-hidden="true" />
          </summary>
          <div className="workspace-organiser-options">
            {organiserItems.map(({ key, href, label, description, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                aria-current={active === key ? "page" : undefined}
                className="workspace-organiser-option"
              >
                <span className="workspace-organiser-option-icon">
                  <Icon size={18} aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <strong>{label}</strong>
                  <span>{description}</span>
                </span>
              </Link>
            ))}
          </div>
        </details>
      </div>
      <div className="desktop-coming-up">
        <ComingUp
          data={workspaceContext}
          error={contextError}
        />
      </div>
    </nav>

    <div className="workspace-actions">
      {actions ? <div className="workspace-page-actions">{actions}</div> : null}

      <div
        ref={mobileActionsRef}
        className={`workspace-mobile-actions relative${mobileActionsOpen ? " is-open" : ""}`}
      >
        <button
          type="button"
          className="workspace-mobile-actions-trigger"
          aria-label={mobileActionsOpen ? "Close quick view" : "Open quick view"}
          title="Quick view"
          aria-expanded={mobileActionsOpen}
          onClick={toggleMobileActions}
        >
          <Eye size={21} aria-hidden="true" />
          <span className="sr-only">Quick view</span>
        </button>
        <div className="workspace-mobile-action-panel">
          <ComingUp
            variant="menu"
            data={workspaceContext}
            error={contextError}
          />
          <div className="workspace-mobile-action-divider" />
          <button
            type="button"
            onClick={openInstallPrompt}
            className="workspace-mobile-install covie-menu-item"
          >
            <Download size={16} aria-hidden="true" />
            Install Covie
          </button>
          <button
            type="button"
            onClick={() => void signOut()}
            disabled={signingOut}
            className="workspace-mobile-logout covie-menu-item"
          >
            <LogOut size={16} aria-hidden="true" />{signingOut ? "Signing out…" : "Log out"}
          </button>
          {signOutError ? (
            <p role="alert" className="workspace-mobile-signout-error px-3 text-sm text-rose-700">
              Could not log out. Please try again.
            </p>
          ) : null}
        </div>
      </div>

      <details ref={accountRef} className="workspace-account relative">
        <summary className="covie-menu-trigger">Account <ChevronDown size={16} aria-hidden="true" /></summary>
        <div className="covie-menu">
          <button type="button" onClick={() => void signOut()} disabled={signingOut} className="covie-menu-item">
            <LogOut size={16} aria-hidden="true" />{signingOut ? "Signing out…" : "Log out"}
          </button>
          {signOutError && <p role="alert" className="px-3 text-sm text-rose-700">Could not log out. Please try again.</p>}
        </div>
      </details>
    </div>
    <InstallApp />
  </>;
}
