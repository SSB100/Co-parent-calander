"use client";
import { CalendarDays, Bell, LayoutGrid, LogOut, UsersRound, ListChecks, WalletCards, ChevronDown, Download, Menu } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";
import { useDismissibleDetails } from "@/lib/client/use-details-dismiss";
import { ComingUp } from "./coming-up";
import { CovieBrand } from "./covie-brand";

export type WorkspaceSection = "home" | "calendar" | "expenses" | "responsibilities" | "kids" | "organiser";
export const organiserItems = [
  { href: "/responsibilities", label: "Responsibilities", description: "Shared tasks, due dates and repeating responsibilities.", icon: ListChecks },
  { href: "/expenses", label: "Expenses", description: "Shared costs, reimbursements and settlements.", icon: WalletCards },
  { href: "/kids", label: "Children", description: "Profiles, activities and useful information.", icon: UsersRound },
];
const items = [
  { key: "calendar", href: "/calendar", label: "Calendar", icon: CalendarDays },
  { key: "home", href: "/home", label: "Updates", icon: Bell },
  { key: "organiser", href: "/organiser", label: "Organiser", icon: LayoutGrid },
];
export function WorkspaceNav({ active, actions }: { active?: WorkspaceSection; actions?: ReactNode }) {
  const router = useRouter();
  const [signOutError, setSignOutError] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [notificationCount, setNotificationCount] = useState(0);
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false);
  const accountRef = useRef<HTMLDetailsElement>(null);
  const mobileActionsRef = useRef<HTMLDivElement>(null);
  useDismissibleDetails(accountRef);
  const section = active && ["expenses", "responsibilities", "kids"].includes(active) ? "organiser" : active;

  useEffect(() => {
    const controller = new AbortController();
    async function refreshNotifications() {
      try {
        const response = await fetch("/api/notifications", {
          signal: controller.signal,
          cache: "no-store",
        });
        const body = (await response.json().catch(() => null)) as { count?: number } | null;
        if (response.ok && body && typeof body.count === "number" && !controller.signal.aborted) {
          setNotificationCount(body.count);
        }
      } catch {}
    }
    void refreshNotifications();
    window.addEventListener("focus", refreshNotifications);
    window.addEventListener("covie-records-updated", refreshNotifications);
    return () => {
      controller.abort();
      window.removeEventListener("focus", refreshNotifications);
      window.removeEventListener("covie-records-updated", refreshNotifications);
    };
  }, []);

  useEffect(() => {
    if (!mobileActionsOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (!(event.target instanceof Node)) return;
      if (!mobileActionsRef.current?.contains(event.target)) {
        setMobileActionsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMobileActionsOpen(false);
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

  function closeMobileActionsAfterAction(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) return;
    if (!target.closest("a, button")) return;
    setMobileActionsOpen(false);
  }

  function openInstallPrompt() {
    window.dispatchEvent(new Event("covie-open-install"));
    setMobileActionsOpen(false);
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
      </div>
      <div className="desktop-coming-up"><ComingUp /></div>
    </nav>

    <div className="workspace-actions">
      <div
        ref={mobileActionsRef}
        className={`workspace-mobile-actions relative${mobileActionsOpen ? " is-open" : ""}`}
      >
        <button
          type="button"
          className="workspace-mobile-actions-trigger"
          aria-label={mobileActionsOpen ? "Close actions menu" : "Open actions menu"}
          aria-expanded={mobileActionsOpen}
          onClick={() => setMobileActionsOpen((current) => !current)}
        >
          <Menu size={22} aria-hidden="true" />
          <span className="sr-only">Menu</span>
        </button>
        <div
          className="workspace-mobile-action-panel"
          onClick={(event) => closeMobileActionsAfterAction(event.target)}
        >
          <ComingUp variant="menu" />
          <div className="workspace-mobile-action-divider" />
          {actions}
          <button
            type="button"
            onClick={openInstallPrompt}
            className="workspace-mobile-install covie-menu-item"
          >
            <Download size={16} aria-hidden="true" />
            Install Covie
          </button>
          <details ref={accountRef} className="workspace-account relative">
            <summary className="covie-menu-trigger">Account <ChevronDown size={16} aria-hidden="true" /></summary>
            <div className="covie-menu">
              <button type="button" onClick={() => void signOut()} disabled={signingOut} className="covie-menu-item">
                <LogOut size={16} aria-hidden="true" />{signingOut ? "Signing out…" : "Log out"}
              </button>
              {signOutError && <p role="alert" className="px-3 text-sm text-rose-700">Could not log out. Please try again.</p>}
            </div>
          </details>
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
    </div>
  </>;
}
