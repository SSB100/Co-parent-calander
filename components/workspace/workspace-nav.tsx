"use client";
import { CalendarDays, Bell, LayoutGrid, LogOut, UsersRound, ListChecks, WalletCards, ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";
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
  const section = active && ["expenses", "responsibilities", "kids"].includes(active) ? "organiser" : active;
  async function signOut() {
    setSigningOut(true);
    setSignOutError(false);
    try {
      const result = await authClient.signOut();
      if (result?.error) throw new Error("Sign out failed");
      router.push("/");
    } catch { setSignOutError(true); setSigningOut(false); }
  }
  return <>
    <nav className="workspace-nav" aria-label="Main navigation">
      <Link href="/calendar" className="workspace-brand"><CovieBrand /></Link>
      <div className="workspace-destinations">
        {items.map(({ key, href, label, icon: Icon }) => (
          <Link key={key} href={href} aria-current={section === key ? "page" : undefined}>
            <Icon size={20} aria-hidden="true" /><span>{label}</span>
          </Link>
        ))}
      </div>
      <div className="desktop-coming-up"><ComingUp /></div>
    </nav>
    <div className="workspace-actions flex flex-wrap items-center gap-2">
      {actions}
      <div className="mobile-coming-up"><ComingUp /></div>
      <details className="workspace-account relative">
        <summary className="covie-menu-trigger">Account <ChevronDown size={16} aria-hidden="true" /></summary>
        <div className="covie-menu">
          <Link href="/dashboard" className="covie-menu-item">Switch or add calendar</Link>
          <button type="button" onClick={() => void signOut()} disabled={signingOut} className="covie-menu-item">
            <LogOut size={16} aria-hidden="true" />{signingOut ? "Signing out…" : "Log out"}
          </button>
          {signOutError && <p role="alert" className="px-3 text-sm text-rose-700">Could not log out. Please try again.</p>}
        </div>
      </details>
    </div>
  </>;
}
