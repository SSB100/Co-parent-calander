"use client";
import { CalendarDays, Bell, LayoutGrid, LogOut, UsersRound, ListChecks, WalletCards, ChevronDown, Menu } from "lucide-react";
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
  const accountRef = useRef<HTMLDetailsElement>(null);
  const mobileActionsRef = useRef<HTMLDetailsElement>(null);
  useDismissibleDetails(accountRef);
  useDismissibleDetails(mobileActionsRef);
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
    mobileActionsRef.current?.removeAttribute("open");
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
      <details ref={mobileActionsRef} className="workspace-mobile-actions relative">
        <summary className="workspace-mobile-actions-trigger" aria-label="Open actions menu">
          <Menu size={22} aria-hidden="true" />
          <span className="sr-only">Menu</span>
        </summary>
        <div
          className="workspace-mobile-action-panel"
          onClick={(event) => closeMobileActionsAfterAction(event.target)}
        >
          {actions}
          <div className="mobile-coming-up"><ComingUp /></div>
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
      </details>
    </div>
  </>;
}
